import { randomUUID } from 'node:crypto';
import { validateResult, assess } from './checks.mjs';

export const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('İstemci takibi durduruldu'));
    const abort = () => {
      clearTimeout(timer);
      reject(new Error('İstemci takibi durduruldu'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
export function safeUrl(value) {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('API adresi http(s) olmalı; kullanıcı bilgisi, sorgu veya fragment içeremez.');
  return url.href.replace(/\/$/, '');
}
export function redact(value, secrets) {
  let serialized = JSON.stringify(value);
  for (const secret of secrets.filter(Boolean))
    serialized = serialized.split(secret).join('[REDACTED]');
  return JSON.parse(serialized.replace(/ck_(?:live|test)_[A-Za-z0-9_-]+/g, '[REDACTED]'));
}
export function retryDelay(headers, fallback = 1000) {
  const value = headers.get('retry-after');
  if (!value) return fallback;
  const seconds = Number(value);
  return Number.isFinite(seconds)
    ? Math.max(0, seconds * 1000)
    : Math.max(0, Date.parse(value) - Date.now()) || fallback;
}

export class Runner {
  constructor(store, { fetchImpl = fetch } = {}) {
    this.store = store;
    this.fetch = fetchImpl;
    this.controllers = new Map();
    this.workers = new Map();
  }
  create(input) {
    const profile = this.store.profile(input.profileId);
    if (!profile) throw new Error('Bağlantı profili bulunamadı');
    if (!profile.key && !input.invalidKey)
      throw new Error('Bağlantılar ekranında API anahtarı girin veya CONVEKS_KEY tanımlayın.');
    const body = typeof input.body === 'string' ? input.body : JSON.stringify(input.request);
    if (typeof body !== 'string') throw new Error('İstek gövdesi gerekli');
    const num = (value, fallback, min, max) => {
      const n = Number(value ?? fallback);
      if (!Number.isFinite(n) || n < min || n > max)
        throw new Error(`Ayar ${min}–${max} aralığında olmalı`);
      return n;
    };
    const settings = {
      wait: num(input.wait, 0, 0, 60),
      pollMs: num(input.pollMs, 2000, 100, 60000),
      timeoutMs: num(input.timeoutMs, 190000, 100, 600000),
      budgetMs: num(input.budgetMs, 360000, 100, 1800000),
      attempts: num(input.attempts, 4, 1, 10),
      retry: input.retry !== false,
    };
    if (!Number.isInteger(settings.wait) || !Number.isInteger(settings.attempts))
      throw new Error('wait ve deneme sayısı tam sayı olmalı');
    const run = this.store.put('runs', {
      id: randomUUID(),
      name: input.name || 'Manuel plan',
      profileId: input.profileId,
      profileName: profile.name,
      apiUrl: profile.url,
      body,
      settings,
      idempotencyKey: input.idempotencyKey || randomUUID(),
      expected: input.expected,
      workflow: input.workflow,
      otherProfileId: input.otherProfileId,
      invalidKey: input.invalidKey,
      batchId: input.batchId,
      createdAt: new Date().toISOString(),
      status: 'queued',
      events: [],
      checks: [],
    });
    return run;
  }
  launch(input) {
    const run = this.create(input);
    this.execute(run.id).catch(() => {});
    return run;
  }
  async batch(inputs, concurrency = 1) {
    const id = randomUUID();
    const runs = inputs.map((input) => this.create({ ...input, batchId: id }));
    let next = 0;
    const work = async () => {
      while (next < runs.length) {
        const r = runs[next++];
        if (this.store.get('runs', r.id).status === 'queued') await this.execute(r.id);
      }
    };
    Promise.all(Array.from({ length: concurrency }, work)).catch(() => {});
    return { id, runs };
  }
  update(id, patch) {
    const old = this.store.get('runs', id);
    return this.store.put('runs', { ...old, ...patch });
  }
  cancel(id) {
    this.controllers.get(id)?.abort();
    const run = this.store.get('runs', id);
    if (run?.status === 'queued')
      this.update(id, { status: 'cancelled', error: 'Başlatılmadan durduruldu' });
  }
  async call(run, profile, method, path, body, signal, deadline) {
    const started = Date.now();
    let response;
    const clean = (value) => redact(value, [profile.key]);
    try {
      response = await this.fetch(safeUrl(profile.url) + path, {
        method,
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${profile.key || ''}`,
          ...(body !== undefined
            ? { 'Content-Type': 'application/json', 'Idempotency-Key': run.idempotencyKey }
            : {}),
        },
        body,
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(Math.max(1, Math.min(run.settings.timeoutMs, deadline - Date.now()))),
        ]),
      });
      const raw = await response.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        data = { raw: raw.slice(0, 20000) };
      }
      const headers = {};
      for (const name of ['content-type', 'location', 'retry-after', 'www-authenticate'])
        if (response.headers.has(name)) headers[name] = response.headers.get(name);
      const event = clean({
        at: new Date().toISOString(),
        method,
        path,
        status: response.status,
        elapsedMs: Date.now() - started,
        headers,
        response: data,
      });
      const latest = this.store.get('runs', run.id);
      this.update(run.id, { events: [...latest.events, event] });
      return { status: response.status, data: clean(data), headers: response.headers };
    } catch (error) {
      const latest = this.store.get('runs', run.id);
      this.update(run.id, {
        events: [
          ...latest.events,
          {
            at: new Date().toISOString(),
            method,
            path,
            elapsedMs: Date.now() - started,
            error: clean(String(error.message)),
          },
        ],
      });
      throw error;
    }
  }
  async request(run, profile, method, path, body, signal, deadline) {
    for (let attempt = 1; attempt <= run.settings.attempts; attempt++) {
      if (Date.now() >= deadline)
        throw new Error(
          'İstemcinin toplam süre bütçesi doldu; sunucudaki plan devam ediyor olabilir.',
        );
      let response;
      try {
        response = await this.call(run, profile, method, path, body, signal, deadline);
      } catch (e) {
        if (signal.aborted || !run.settings.retry || attempt === run.settings.attempts) throw e;
        await sleep(
          Math.min(1000 * 2 ** (attempt - 1), Math.max(0, deadline - Date.now())),
          signal,
        );
        continue;
      }
      const retryable =
        [429, 500, 502, 503, 504].includes(response.status) ||
        (response.status === 409 &&
          response.data?.errors?.some((e) => e.code === 'IDEMPOTENCY_IN_PROGRESS'));
      if (!retryable || !run.settings.retry || attempt === run.settings.attempts) return response;
      const pause = retryDelay(response.headers);
      if (Date.now() + pause >= deadline)
        throw new Error('Retry-After toplam süre bütçesini aşıyor.');
      await sleep(pause, signal);
    }
  }
  async execute(id, { resume = false } = {}) {
    if (this.controllers.has(id)) throw new Error('Koşu zaten çalışıyor');
    let run = this.store.get('runs', id);
    const profile = this.store.profile(run.profileId);
    if (!profile?.key && !run.invalidKey)
      return this.update(id, { status: 'error', error: 'API anahtarı gerekli' });
    if (run.workflow === 'isolation' && !this.store.profile(run.otherProfileId)?.key)
      return this.update(id, {
        status: 'skipped',
        error: 'İzolasyon testi için farklı tenant’a ait ikinci bağlantı ve anahtar gerekli.',
        assessment: { ok: null, checks: [] },
      });
    const controller = new AbortController();
    this.controllers.set(id, controller);
    const { signal } = controller,
      started = Date.now(),
      deadline = started + run.settings.budgetMs;
    this.update(id, { status: 'running', error: null, startedAt: new Date().toISOString() });
    const auth = {
      ...profile,
      url: run.apiUrl,
      key: run.invalidKey ? 'ck_live_invalid' : profile.key,
    };
    try {
      let answer;
      if (resume) {
        if (!run.planId) throw new Error('Sorgulanacak plan kimliği yok');
        answer = await this.request(
          run,
          auth,
          'GET',
          `/v1/plans/${encodeURIComponent(run.planId)}`,
          undefined,
          signal,
          deadline,
        );
      } else {
        answer = await this.request(
          run,
          auth,
          'POST',
          `/v1/plans?wait=${run.settings.wait}`,
          run.body,
          signal,
          deadline,
        );
        this.update(id, { httpStatus: answer.status, firstResponseMs: Date.now() - started });
      }
      if (![200, 202].includes(answer.status)) {
        this.update(id, {
          status: 'rejected',
          response: answer.data,
          error: `HTTP ${answer.status}`,
          lastHttpStatus: answer.status,
        });
      } else {
        if (
          !answer.data?.id ||
          !['pending', 'completed', 'failed', 'timed_out'].includes(answer.data.status)
        )
          throw new Error('API plan yanıtı beklenen sözleşmede değil');
        this.update(id, { planId: answer.data.id, response: answer.data });
        // Construct on the configured origin: never forward credentials to a Location host.
        const path = `/v1/plans/${encodeURIComponent(answer.data.id)}`;
        while (answer.data.status === 'pending') {
          if (Date.now() + run.settings.pollMs >= deadline)
            throw new Error('İstemci bekleme süresi doldu; planı daha sonra sorgulayabilirsiniz.');
          await sleep(run.settings.pollMs, signal);
          answer = await this.request(run, auth, 'GET', path, undefined, signal, deadline);
          if (answer.status !== 200) throw new Error(`Plan sorgulama HTTP ${answer.status}`);
          if (!['pending', 'completed', 'failed', 'timed_out'].includes(answer.data?.status))
            throw new Error('Bilinmeyen plan durumu');
          this.update(id, { response: answer.data });
        }
        let parsed;
        try {
          parsed = JSON.parse(run.body);
        } catch {
          parsed = {};
        }
        this.update(id, {
          status: answer.data.status,
          response: answer.data,
          checks: validateResult(parsed, answer.data),
        });
        if (run.workflow && !resume && answer.data.status === 'completed') {
          const checks = [],
            add = (name, ok) => checks.push({ name, ok: Boolean(ok) });
          if (['idempotency', 'conflict'].includes(run.workflow)) {
            const body = run.workflow === 'conflict' ? run.body + ' ' : run.body;
            const again = await this.request(
              run,
              auth,
              'POST',
              '/v1/plans?wait=0',
              body,
              signal,
              deadline,
            );
            if (run.workflow === 'conflict')
              add(
                'Farklı ham gövde → 409 IDEMPOTENCY_CONFLICT',
                again.status === 409 &&
                  again.data.errors?.some((e) => e.code === 'IDEMPOTENCY_CONFLICT'),
              );
            else add('Aynı plan kimliği', again.status === 202 && again.data.id === answer.data.id);
          }
          if (run.workflow === 'delete') {
            const del = await this.request(run, auth, 'DELETE', path, undefined, signal, deadline);
            const get = await this.request(run, auth, 'GET', path, undefined, signal, deadline);
            add('Silme 204, sonraki GET 404', del.status === 204 && get.status === 404);
            this.update(id, { remoteDeleted: del.status === 204 });
          }
          if (run.workflow === 'isolation') {
            const other = this.store.profile(run.otherProfileId);
            if (safeUrl(other.url) !== safeUrl(run.apiUrl))
              throw new Error('İzolasyon profilleri aynı API adresini kullanmalı');
            const get = await this.request(run, other, 'GET', path, undefined, signal, deadline);
            add('Diğer tenant GET → 404', get.status === 404);
            // No DELETE: a mistaken same-tenant key must not erase the plan.
          }
          this.update(id, { workflowChecks: checks });
        }
      }
    } catch (e) {
      this.update(id, {
        status: signal.aborted ? 'cancelled' : 'error',
        error: redact(String(e.message), [profile?.key]),
      });
    } finally {
      const current = this.store.get('runs', id);
      this.update(id, {
        elapsedMs: Date.now() - started,
        finishedAt: new Date().toISOString(),
        assessment: assess(current),
      });
      this.controllers.delete(id);
    }
    return this.store.get('runs', id);
  }
}
