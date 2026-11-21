import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exampleRequest } from '../server/fixtures.mjs';

test('local server boundary: profiles, persistence, real HTTP run, export, assignment and deletion', async () => {
  const received = new Map();
  let counter = 0;
  const mock = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    if (req.url === '/health') {
      res.end('{"status":"ok"}');
      return;
    }
    if (req.url === '/v1/openapi.json') {
      res.end('{"openapi":"3.1.0"}');
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST') {
      const request = JSON.parse(body),
        id = 'pln_fixture_' + ++counter;
      received.set(id, request);
      res.writeHead(202, { Location: '/v1/plans/' + id });
      res.end(JSON.stringify({ id, status: 'pending' }));
      return;
    }
    const id = req.url.split('/').pop(),
      request = received.get(id);
    if (!request) {
      res.writeHead(404);
      res.end('{"errors":[{"code":"NOT_FOUND"}]}');
      return;
    }
    if (req.method === 'DELETE') {
      received.delete(id);
      res.writeHead(204);
      res.end();
      return;
    }
    res.end(
      JSON.stringify({
        id,
        status: 'completed',
        routes: [],
        unassigned: request.jobs.map((j) => ({
          job_id: j.id,
          code: 'NO_TIME',
          message: 'Controlled test fixture',
        })),
        summary: {
          jobs_total: request.jobs.length,
          jobs_assigned: 0,
          jobs_unassigned: request.jobs.length,
          distance_m: 0,
          travel_min: 0,
          late_jobs: 0,
          overtime_min: 0,
        },
      }),
    );
  });
  mock.listen(0, '127.0.0.1');
  await once(mock, 'listening');
  const portFinder = http.createServer();
  portFinder.listen(0, '127.0.0.1');
  await once(portFinder, 'listening');
  const port = portFinder.address().port;
  await new Promise((r) => portFinder.close(r));
  const dir = mkdtempSync(join(tmpdir(), 'conveks-server-test-'));
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      CONVEKS_KEY: '',
      CONVEKS_CLIENT_DB: join(dir, 'client.sqlite'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = `http://127.0.0.1:${port}`;
  const call = async (path, body, method = body === undefined ? 'GET' : 'POST') => {
    const r = await fetch(base + '/api/' + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Conveks-Client': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server startup timeout')), 10000);
      child.stdout.on('data', (chunk) => {
        if (String(chunk).includes('Conveks API Lab')) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once('error', reject);
    });
    assert.equal((await fetch(base)).status, 200);
    const state = await call('state');
    assert.equal(state.body.scenarios.length, 1);
    const forbidden = await fetch(base + '/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(forbidden.status, 403);
    const cross = await fetch(base + '/api/state', {
      headers: { Origin: 'https://external.example' },
    });
    assert.equal(cross.status, 403);
    const p = await call('profiles', {
      name: 'Fixture only',
      url: `http://127.0.0.1:${mock.address().port}`,
      key: 'ck_live_fixture_only',
    });
    assert.equal(p.status, 200);
    assert.equal(p.body.hasKey, true);
    assert.equal(p.body.key, undefined);
    assert.equal((await call('probe', { profileId: p.body.id })).body.authenticated, true);
    const req = exampleRequest();
    const scenario = await call('scenarios', { name: 'Test saved', request: req });
    assert.equal(scenario.status, 200);
    const broken = await call('scenarios', {
      name: 'Bad',
      request: { jobs: [{}], resources: [{}] },
    });
    assert.equal(broken.status, 400);
    const created = await call('runs', {
      profileId: p.body.id,
      request: req,
      pollMs: 100,
      expected: { completed: true, invariants: true },
    });
    assert.equal(created.status, 202);
    let run;
    for (let i = 0; i < 50; i++) {
      run = (await call('runs/' + created.body.id)).body;
      if (!['queued', 'running'].includes(run.status)) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(run.status, 'completed');
    assert.equal(run.assessment.ok, true);
    assert.equal(run.events.length, 2);
    const apply = await call(`runs/${run.id}/apply`, {});
    assert.equal(apply.status, 200);
    assert.equal(apply.body.planId, run.planId);
    const report = await call('report');
    assert.equal(report.body.runs.length, 1);
    assert.ok(!JSON.stringify(report).includes('ck_live_fixture_only'));
    assert.equal(report.body.manualCases[0].status, 'not_run');
    const del = await call(`runs/${run.id}/remote`, undefined, 'DELETE');
    assert.equal(del.status, 200);
    assert.equal((await call('runs/' + run.id)).body.remoteDeleted, true);
    const badBatch = await call('experiment', {
      profileId: p.body.id,
      request: req,
      limits: [10],
      overtimes: [0],
      repeat: 100,
    });
    assert.equal(badBatch.status, 400);
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit');
    mock.closeAllConnections();
    await new Promise((r) => mock.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
