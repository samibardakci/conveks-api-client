import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { Store } from './store.mjs';
import { Runner, safeUrl, redact } from './client.mjs';
import { testCases, manualCases } from './fixtures.mjs';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT || 4178);
const store = new Store(process.env.CONVEKS_CLIENT_DB || resolve(root, 'data/client.sqlite'));
const runner = new Runner(store);
const vite = process.argv.includes('--dev')
  ? await (
      await import('vite')
    ).createServer({ root, server: { middlewareMode: true }, appType: 'spa' })
  : null;
const json = (res, status, value) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(value));
};
const bodyOf = async (req) => {
  let raw = '',
    length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 4_000_000) throw new Error('Yerel istek 4 MB sınırını aşıyor');
    raw += chunk;
  }
  return raw ? JSON.parse(raw) : {};
};
const secrets = () => [...store.secrets.values(), process.env.CONVEKS_KEY];
const summary = (r) => {
  const { body, events, checks, response, workflowChecks, ...rest } = r;
  return {
    ...rest,
    summary: response?.summary,
    checkCount: checks?.length,
    failedChecks: checks?.filter((c) => !c.ok).length,
    eventCount: events?.length,
  };
};
const required = (kind, id) => {
  const v = store.get(kind, id);
  if (!v) throw new Error('Kayıt bulunamadı');
  return v;
};

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || '';
    if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(host))
      return json(res, 403, { error: 'Yerel host gerekli' });
    const origin = req.headers.origin;
    if (origin && ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(origin))
      return json(res, 403, { error: 'Origin reddedildi' });
    const url = new URL(req.url, 'http://localhost'),
      path = url.pathname,
      method = req.method;
    if (path.startsWith('/api/')) {
      if (!['GET', 'HEAD'].includes(method) && req.headers['x-conveks-client'] !== '1')
        return json(res, 403, { error: 'İstemci başlığı gerekli' });
      const input = ['POST', 'PUT'].includes(method) ? await bodyOf(req) : {};
      if (path === '/api/state' && method === 'GET')
        return json(res, 200, {
          profiles: store.publicProfiles(),
          scenarios: store.list('scenarios'),
          runs: store.list('runs').map(summary),
          assignments: store.list('assignments'),
          manualCases,
        });
      if (path === '/api/profiles' && method === 'POST') {
        const saved = store.put('profiles', {
          id: input.id,
          name: String(input.name || 'Bağlantı').slice(0, 100),
          url: safeUrl(input.url),
        });
        if (input.clearKey) store.secrets.delete(saved.id);
        if (input.key) store.secrets.set(saved.id, String(input.key));
        return json(
          res,
          200,
          store.publicProfiles().find((p) => p.id === saved.id),
        );
      }
      if (path === '/api/probe' && method === 'POST') {
        const profile = store.profile(input.profileId);
        if (!profile) throw new Error('Bağlantı bulunamadı');
        const call = async (p) => {
          const r = await fetch(safeUrl(profile.url) + p, {
            redirect: 'error',
            signal: AbortSignal.timeout(10000),
            headers: { Authorization: `Bearer ${profile.key || ''}` },
          });
          let data;
          try {
            data = await r.json();
          } catch {
            data = null;
          }
          return { status: r.status, data };
        };
        const health = await call('/health'),
          schema = await call('/v1/openapi.json'),
          auth = await call('/v1/plans/pln_client_connection_probe');
        return json(
          res,
          200,
          redact(
            {
              health,
              schema,
              auth,
              authenticated: auth.status === 404,
              note: '404 kimlik kontrolünü geçtiğinizi gösterir; motor ve OSRM için gerçek plan testi gerekir.',
            },
            secrets(),
          ),
        );
      }
      if (path === '/api/scenarios' && method === 'POST') {
        if (
          !input.request ||
          !Array.isArray(input.request.jobs) ||
          !Array.isArray(input.request.resources)
        )
          throw new Error('Senaryo jobs ve resources listeleri içermeli');
        const point = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon);
        if (
          input.request.jobs.some(
            (j) =>
              !j ||
              typeof j.id !== 'string' ||
              !point(j.location) ||
              !Number.isFinite(j.duration_min) ||
              (j.skills && !Array.isArray(j.skills)),
          )
        )
          throw new Error(
            'Form senaryosunda her iş için id, sayısal location ve duration_min gerekli. Hatalı kontrat testleri için ham laboratuvarı kullanın.',
          );
        if (
          input.request.resources.some(
            (r) =>
              !r ||
              typeof r.id !== 'string' ||
              typeof r.shift?.start !== 'string' ||
              typeof r.shift?.end !== 'string' ||
              (r.start && !point(r.start)) ||
              (r.skills && !Array.isArray(r.skills)),
          )
        )
          throw new Error('Form senaryosunda ekip kimliği ve shift.start/end gerekli.');
        if (input.request.depot && !point(input.request.depot))
          throw new Error('Depo sayısal lat/lon içermeli');
        return json(
          res,
          200,
          store.put('scenarios', {
            id: input.id,
            name: String(input.name || 'Yeni senaryo'),
            description: String(input.description || ''),
            request: input.request,
          }),
        );
      }
      if (path.startsWith('/api/scenarios/') && method === 'DELETE') {
        store.delete('scenarios', decodeURIComponent(path.split('/')[3]));
        return json(res, 200, { ok: true });
      }
      if (path === '/api/runs' && method === 'POST')
        return json(res, 202, summary(runner.launch(input)));
      if (path === '/api/suite' && method === 'POST') {
        if (!input.request?.jobs?.length || !input.request?.resources?.length)
          throw new Error('Test tabanı en az bir iş ve ekip içermeli');
        const selected = testCases(input.request).filter((t) => input.cases?.includes(t.id));
        if (!selected.length) throw new Error('En az bir test seçin');
        const batch = await runner.batch(
          selected.map((t) => ({
            ...t,
            profileId: input.profileId,
            otherProfileId: input.otherProfileId,
            retry: false,
            pollMs: 1000,
          })),
          1,
        );
        return json(res, 202, { id: batch.id, runs: batch.runs.map(summary) });
      }
      if (path === '/api/cases' && method === 'GET')
        return json(
          res,
          200,
          testCases(store.list('scenarios')[0]?.request || { jobs: [{}], resources: [{}] }).map(
            ({ body, ...t }) => t,
          ),
        );
      if (path === '/api/experiment' && method === 'POST') {
        const limits = input.limits || [5, 10, 30],
          overtimes = input.overtimes || [0],
          repeat = Number(input.repeat || 1),
          concurrency = Number(input.concurrency || 1);
        if (
          !Array.isArray(limits) ||
          !limits.length ||
          !Array.isArray(overtimes) ||
          !overtimes.length ||
          !Number.isInteger(repeat) ||
          repeat < 1 ||
          repeat > 10 ||
          !Number.isInteger(concurrency) ||
          concurrency < 1 ||
          concurrency > 8 ||
          limits.length * overtimes.length * repeat > 60
        )
          throw new Error('Deney: en çok 60 koşu, 1–10 tekrar ve 1–8 eşzamanlılık');
        if (
          limits.some((n) => !Number.isFinite(n) || n <= 0 || n > 60) ||
          overtimes.some((n) => !Number.isFinite(n) || n < 0 || n > 120)
        )
          throw new Error('Süre 0–60 (0 hariç), fazla mesai 0–120 aralığında olmalı');
        const inputs = [];
        for (const limit of limits)
          for (const overtime of overtimes)
            for (let i = 0; i < repeat; i++)
              inputs.push({
                profileId: input.profileId,
                name: `${limit} sn / ${overtime} dk · tekrar ${i + 1}`,
                request: {
                  ...input.request,
                  options: {
                    ...input.request.options,
                    time_limit_s: limit,
                    max_overtime_min: overtime,
                  },
                },
                expected: { completed: true, invariants: true },
                retry: input.retry !== false,
              });
        const batch = await runner.batch(inputs, concurrency);
        return json(res, 202, { id: batch.id, runs: batch.runs.map(summary) });
      }
      if (path === '/api/report' && method === 'GET')
        return json(
          res,
          200,
          redact(
            {
              exportedAt: new Date().toISOString(),
              runs: store
                .list('runs')
                .filter(
                  (r) =>
                    !url.searchParams.get('batch') || r.batchId === url.searchParams.get('batch'),
                ),
              manualCases: manualCases.map((name) => ({ name, status: 'not_run' })),
            },
            secrets(),
          ),
        );
      const match = path.match(/^\/api\/runs\/([^/]+)(?:\/(\w+))?$/);
      if (match) {
        const id = decodeURIComponent(match[1]),
          action = match[2],
          run = required('runs', id);
        if (!action && method === 'GET') return json(res, 200, redact(run, secrets()));
        if (action === 'cancel' && method === 'POST') {
          runner.cancel(id);
          return json(res, 200, { ok: true });
        }
        if (action === 'resume' && method === 'POST') {
          if (runner.controllers.has(id)) throw new Error('Koşu zaten çalışıyor');
          if (!run.planId) throw new Error('Plan kimliği yok');
          runner.execute(id, { resume: true }).catch(() => {});
          return json(res, 202, { ok: true });
        }
        if (action === 'retry' && method === 'POST') {
          if (runner.controllers.has(id)) throw new Error('Koşu zaten çalışıyor');
          // Recover an uncertain submission with the exact bytes and key.
          return json(
            res,
            202,
            summary(
              runner.launch({
                ...run,
                ...run.settings,
                name: run.name + ' · tekrar deneme',
                expected: undefined,
                workflow: undefined,
              }),
            ),
          );
        }
        if (action === 'remote' && method === 'DELETE') {
          if (!run.planId) throw new Error('Plan kimliği yok');
          const p = store.profile(run.profileId);
          if (!p?.key) throw new Error('API anahtarı gerekli');
          const result = await runner.call(
            run,
            { ...p, url: run.apiUrl },
            'DELETE',
            `/v1/plans/${encodeURIComponent(run.planId)}`,
            undefined,
            new AbortController().signal,
            Date.now() + 30000,
          );
          if (result.status !== 204) throw new Error(`API silme: HTTP ${result.status}`);
          runner.update(id, { remoteDeleted: true });
          return json(res, 200, { ok: true });
        }
        if (action === 'apply' && method === 'POST') {
          if (run.response?.status !== 'completed' || run.checks?.some((c) => !c.ok))
            throw new Error('Yalnız kontrolleri geçen tamamlanmış sonuç uygulanabilir');
          const rows = run.response.routes.flatMap((r) =>
            r.stops.map((s, i) => ({
              jobId: s.job_id,
              resourceId: r.resource_id,
              sequence: i + 1,
              startAt: s.start_at,
              endAt: s.end_at,
            })),
          );
          return json(
            res,
            200,
            store.put('assignments', {
              id: run.id,
              runId: run.id,
              planId: run.planId,
              rows,
              appliedAt: new Date().toISOString(),
            }),
          );
        }
      }
      return json(res, 404, { error: 'Yerel uç bulunamadı' });
    }
    if (vite)
      return vite.middlewares(req, res, () => {
        res.writeHead(404);
        res.end();
      });
    const requested = resolve(root, 'dist', '.' + decodeURIComponent(path));
    const file =
      requested.startsWith(resolve(root, 'dist') + sep) &&
      existsSync(requested) &&
      extname(requested)
        ? requested
        : resolve(root, 'dist/index.html');
    if (!existsSync(file)) {
      res.writeHead(503);
      return res.end('Önce npm run build çalıştırın.');
    }
    res.writeHead(200, {
      'Content-Type':
        {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
        }[extname(file)] || 'application/octet-stream',
    });
    res.end(readFileSync(file));
  } catch (e) {
    json(res, 400, { error: redact(String(e.message), secrets()) });
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Conveks API Lab · http://localhost:${port}`));
async function close() {
  for (const c of runner.controllers.values()) c.abort();
  await vite?.close();
  server.close();
  setTimeout(() => {
    store.close();
    process.exit(0);
  }, 300).unref();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
