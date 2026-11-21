import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { Store } from '../server/store.mjs';
import { Runner, retryDelay, safeUrl, redact } from '../server/client.mjs';
import { validateResult } from '../server/checks.mjs';
import { exampleRequest, testCases } from '../server/fixtures.mjs';

function setup(fetchImpl) {
  const store = new Store(':memory:');
  store.secrets.set('local', 'ck_live_secret_test');
  return { store, runner: new Runner(store, { fetchImpl }) };
}
const reply = (status, data, headers = {}) =>
  new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
const finished = {
  id: 'pln_test',
  status: 'completed',
  summary: { jobs_total: 0, jobs_assigned: 0, jobs_unassigned: 0, distance_m: 0 },
  routes: [],
  unassigned: [],
};

test('async acceptance polls and records terminal completion', async () => {
  const calls = [];
  const { store, runner } = setup(async (url, opts) => {
    calls.push([url, opts.method]);
    return calls.length === 1
      ? reply(
          202,
          { id: 'pln_test', status: 'pending' },
          { Location: 'https://evil.example/steal' },
        )
      : reply(200, finished);
  });
  const run = runner.create({
    profileId: 'local',
    request: { jobs: [], resources: [] },
    pollMs: 100,
    expected: { http: 202, completed: true, invariants: true },
  });
  const result = await runner.execute(run.id);
  assert.equal(result.status, 'completed');
  assert.equal(result.assessment.ok, true);
  assert.equal(calls[1][0], 'http://localhost:8095/v1/plans/pln_test');
  assert.equal(result.events.length, 2);
  store.close();
});
test('HTTP 200 failed is not successful optimization', async () => {
  const { store, runner } = setup(async () =>
    reply(200, { id: 'pln_failed', status: 'failed', error: { code: 'ENGINE_ERROR' } }),
  );
  const run = runner.create({ profileId: 'local', request: {}, expected: { completed: true } });
  const r = await runner.execute(run.id);
  assert.equal(r.status, 'failed');
  assert.equal(r.assessment.ok, false);
  store.close();
});
test('network loss and retry preserve exact bytes and idempotency key', async () => {
  const attempts = [];
  const { store, runner } = setup(async (url, options) => {
    attempts.push(options);
    if (attempts.length === 1) throw new Error('connection reset');
    return reply(200, finished);
  });
  const body = '{ "jobs": [], "resources": [] }\n';
  const run = runner.create({ profileId: 'local', body, wait: 1, attempts: 2 });
  await runner.execute(run.id);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].body, body);
  assert.equal(attempts[1].body, body);
  assert.equal(attempts[0].headers['Idempotency-Key'], attempts[1].headers['Idempotency-Key']);
  store.close();
});
test('429 retry-after and in-progress are retried; conflict is terminal', async () => {
  for (const code of ['RATE_LIMITED', 'IDEMPOTENCY_IN_PROGRESS', 'IDEMPOTENCY_CONFLICT']) {
    let calls = 0;
    const status = code === 'RATE_LIMITED' ? 429 : 409;
    const { store, runner } = setup(async () =>
      ++calls === 1
        ? reply(status, { errors: [{ code }] }, { 'retry-after': '0' })
        : reply(200, finished),
    );
    const run = runner.create({ profileId: 'local', request: {}, attempts: 2 });
    const r = await runner.execute(run.id);
    assert.equal(calls, code === 'IDEMPOTENCY_CONFLICT' ? 1 : 2);
    assert.equal(r.status, code === 'IDEMPOTENCY_CONFLICT' ? 'rejected' : 'completed');
    store.close();
  }
});
test('expected negative validation is a passing test', async () => {
  const { store, runner } = setup(async () =>
    reply(422, { errors: [{ code: 'REQUIRED', path: 'jobs' }] }),
  );
  const run = runner.create({
    profileId: 'local',
    body: '{}',
    expected: { http: 422, code: 'REQUIRED' },
  });
  const r = await runner.execute(run.id);
  assert.equal(r.status, 'rejected');
  assert.equal(r.assessment.ok, true);
  store.close();
});
test('unexpected status and code fail test expectation', async () => {
  const { store, runner } = setup(async () => reply(500, { errors: [{ code: 'INTERNAL_ERROR' }] }));
  const run = runner.create({
    profileId: 'local',
    body: '{}',
    retry: false,
    expected: { http: 422, code: 'REQUIRED' },
  });
  const r = await runner.execute(run.id);
  assert.equal(r.assessment.ok, false);
  store.close();
});
test('secrets are memory-only and redacted from echoed responses', async () => {
  const { store, runner } = setup(async () => reply(401, { message: 'ck_live_secret_test' }));
  assert.equal(JSON.stringify(store.list('profiles')).includes('secret_test'), false);
  const run = runner.create({ profileId: 'local', request: {}, retry: false });
  await runner.execute(run.id);
  assert.equal(JSON.stringify(store.list('runs')).includes('secret_test'), false);
  store.close();
});
test('isolation without a second key is skipped, not passed', async () => {
  const { store, runner } = setup(async () => {
    throw new Error('should not call');
  });
  const run = runner.create({
    profileId: 'local',
    request: {},
    workflow: 'isolation',
    expected: { completed: true },
  });
  const r = await runner.execute(run.id);
  assert.equal(r.status, 'skipped');
  assert.equal(r.assessment.ok, null);
  store.close();
});
test('same key workflow verifies plan identity', async () => {
  let n = 0;
  const { store, runner } = setup(async () => reply(++n === 1 ? 200 : 202, finished));
  const run = runner.create({
    profileId: 'local',
    request: { jobs: [], resources: [] },
    workflow: 'idempotency',
    expected: { completed: true },
  });
  const r = await runner.execute(run.id);
  assert.equal(r.assessment.ok, true);
  assert.equal(n, 2);
  store.close();
});
test('delete workflow requires 204 then 404 and marks remote record deleted', async () => {
  const methods = [];
  const { store, runner } = setup(async (url, opts) => {
    methods.push(opts.method);
    return opts.method === 'POST'
      ? reply(200, finished)
      : opts.method === 'DELETE'
        ? reply(204)
        : reply(404, { errors: [{ code: 'NOT_FOUND' }] });
  });
  const run = runner.create({
    profileId: 'local',
    request: { jobs: [], resources: [] },
    workflow: 'delete',
    expected: { completed: true },
  });
  const r = await runner.execute(run.id);
  assert.deepEqual(methods, ['POST', 'DELETE', 'GET']);
  assert.equal(r.remoteDeleted, true);
  assert.equal(r.assessment.ok, true);
  store.close();
});
test('cancel stops local polling without a DELETE request', async () => {
  const calls = [];
  const { store, runner } = setup(async (url, opts) => {
    calls.push(opts.method);
    return reply(202, { id: 'pln_test', status: 'pending' });
  });
  const run = runner.create({ profileId: 'local', request: {}, pollMs: 1000 });
  const task = runner.execute(run.id);
  await new Promise((r) => setTimeout(r, 20));
  runner.cancel(run.id);
  const r = await task;
  assert.equal(r.status, 'cancelled');
  assert.deepEqual(calls, ['POST']);
  assert.equal(r.planId, 'pln_test');
  store.close();
});
test('client timeout never becomes server timed_out', async () => {
  const { store, runner } = setup(async () => reply(202, { id: 'pln_test', status: 'pending' }));
  const run = runner.create({ profileId: 'local', request: {}, pollMs: 100, budgetMs: 100 });
  const r = await runner.execute(run.id);
  assert.equal(r.status, 'error');
  assert.equal(r.response.status, 'pending');
  store.close();
});
test('retry-after that exceeds budget stops without early retry', async () => {
  let calls = 0;
  const { store, runner } = setup(async () => {
    calls++;
    return reply(429, { errors: [] }, { 'retry-after': '10' });
  });
  const run = runner.create({ profileId: 'local', request: {}, budgetMs: 100 });
  const r = await runner.execute(run.id);
  assert.equal(calls, 1);
  assert.match(r.error, /Retry-After/);
  store.close();
});
test('no-capability reason and schedule checks detect corrupted results', () => {
  const req = {
    now: '2026-11-17T08:00:00+03:00',
    resources: [
      {
        id: 'R',
        skills: ['electric'],
        shift: { start: '2026-11-17T08:00:00+03:00', end: '2026-11-17T17:00:00+03:00' },
      },
    ],
    jobs: [{ id: 'J', skills: ['electric'], duration_min: 30 }],
  };
  const result = {
    status: 'completed',
    summary: { jobs_total: 1, jobs_assigned: 1, jobs_unassigned: 0 },
    routes: [
      {
        resource_id: 'R',
        start_at: '2026-11-17T08:00:00+03:00',
        end_at: '2026-11-17T08:40:00+03:00',
        stops: [
          {
            job_id: 'J',
            arrival_at: '2026-11-17T08:10:00+03:00',
            start_at: '2026-11-17T08:10:00+03:00',
            end_at: '2026-11-17T08:40:00+03:00',
            late_min: 0,
          },
        ],
      },
    ],
    unassigned: [],
  };
  result.summary.distance_m = 100;
  result.routes[0].distance_m = 100;
  assert.ok(validateResult(req, result).every((c) => c.ok));
  const wrong = structuredClone(result);
  wrong.routes[0].stops[0].end_at = '2026-11-17T08:15:00+03:00';
  assert.ok(validateResult(req, wrong).some((c) => c.name.includes('iş süresi') && !c.ok));
  wrong.routes[0].stops.push(wrong.routes[0].stops[0]);
  assert.ok(validateResult(req, wrong).some((c) => c.name.includes('tam bir kez') && !c.ok));
  req.resources[0].skills = [];
  assert.ok(validateResult(req, result).some((c) => c.name.includes('yetkinlik') && !c.ok));
});
test('CSV/JSON-independent test fixtures cover upper boundary and malformed JSON', () => {
  const cases = testCases(exampleRequest());
  assert.equal(JSON.parse(cases.find((c) => c.id === 'size').body).jobs.length, 301);
  assert.equal(JSON.parse(cases.find((c) => c.id === 'resources').body).resources.length, 31);
  assert.ok(Buffer.byteLength(cases.find((c) => c.id === 'body').body) > 2_000_000);
  assert.throws(() => JSON.parse(cases.find((c) => c.id === 'json').body));
});
test('URL and secret safety helpers', () => {
  assert.equal(safeUrl('http://localhost:8095/'), 'http://localhost:8095');
  for (const url of [
    'file:///tmp/key',
    'https://key:secret@example.org',
    'http://localhost/?key=x',
  ])
    assert.throws(() => safeUrl(url));
  assert.deepEqual(redact({ text: 'token my-secret ck_live_other_key' }, ['my-secret']), {
    text: 'token [REDACTED] [REDACTED]',
  });
  assert.equal(retryDelay(new Headers({ 'retry-after': '2' })), 2000);
});
test('real HTTP boundary: bearer, exact body, polling, and response headers', async () => {
  const seen = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    seen.push({
      method: req.method,
      auth: req.headers.authorization,
      body,
      key: req.headers['idempotency-key'],
    });
    res.writeHead(req.method === 'POST' ? 202 : 200, {
      'Content-Type': 'application/json',
      Location: '/v1/plans/pln_test',
    });
    res.end(
      JSON.stringify(req.method === 'POST' ? { id: 'pln_test', status: 'pending' } : finished),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const store = new Store(':memory:');
  store.put('profiles', {
    id: 'local',
    name: 'Test',
    url: `http://127.0.0.1:${server.address().port}`,
  });
  store.secrets.set('local', 'ck_live_http_test');
  const runner = new Runner(store);
  try {
    const body = '{"jobs":[], "resources":[]}';
    const r = runner.create({ profileId: 'local', body, pollMs: 100 });
    const final = await runner.execute(r.id);
    assert.equal(final.status, 'completed');
    assert.equal(seen[0].auth, 'Bearer ck_live_http_test');
    assert.equal(seen[0].body, body);
    assert.ok(seen[0].key);
    assert.equal(seen[1].method, 'GET');
    assert.equal(final.events[0].headers.location, '/v1/plans/pln_test');
  } finally {
    store.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
