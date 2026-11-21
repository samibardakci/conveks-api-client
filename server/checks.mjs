export function validateResult(request, result) {
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });
  if (result?.status !== 'completed') {
    add('Plan tamamlandı', false, result?.status || 'Sonuç yok');
    return checks;
  }
  const jobs = request.jobs || [],
    resources = request.resources || [],
    routes = result.routes || [],
    unassigned = result.unassigned || [];
  const assigned = routes.flatMap((r) => r.stops || []);
  const ids = [...assigned.map((s) => s.job_id), ...unassigned.map((j) => j.job_id)];
  add(
    'Her iş tam bir kez temsil ediliyor',
    ids.length === jobs.length &&
      new Set(ids).size === jobs.length &&
      jobs.every((j) => ids.includes(j.id)),
  );
  add(
    'Özet iş sayıları tutarlı',
    result.summary?.jobs_total === jobs.length &&
      result.summary?.jobs_assigned === assigned.length &&
      result.summary?.jobs_unassigned === unassigned.length,
  );
  add(
    'Atanamayan işlerin gerekçesi var',
    unassigned.every((j) => ['NO_TIME', 'NO_CAPABLE_RESOURCE'].includes(j.code)),
  );
  add('Ekip rotaları benzersiz', new Set(routes.map((r) => r.resource_id)).size === routes.length);
  add(
    'Mesafe özeti tutarlı',
    Number.isFinite(result.summary?.distance_m) &&
      Math.abs(result.summary.distance_m - routes.reduce((sum, r) => sum + r.distance_m, 0)) <=
        routes.length,
  );
  for (const r of routes) {
    const crew = resources.find((c) => c.id === r.resource_id);
    add(`${r.resource_id}: ekip tanımlı`, !!crew);
    if (!crew) continue;
    const begin = Date.parse(r.start_at),
      end = Date.parse(r.end_at);
    add(`${r.resource_id}: vardiya başlangıcı`, begin >= Date.parse(crew.shift.start));
    if (request.now) add(`${r.resource_id}: planlama anı`, begin >= Date.parse(request.now));
    add(
      `${r.resource_id}: fazla mesai sınırı`,
      end <= Date.parse(crew.shift.end) + (request.options?.max_overtime_min || 0) * 60000 + 1000,
    );
    add(`${r.resource_id}: dönüş davranışı`, request.depot ? !!r.return : !r.return);
    let previous = begin;
    let ordinarySeen = false;
    for (const stop of r.stops || []) {
      const job = jobs.find((j) => j.id === stop.job_id);
      if (!job) {
        add(`${stop.job_id}: tanımlı iş`, false);
        continue;
      }
      if (job.urgent) add(`${job.id}: acil iş normal işlerden önce`, !ordinarySeen);
      else ordinarySeen = true;
      const arrival = Date.parse(stop.arrival_at),
        start = Date.parse(stop.start_at),
        finish = Date.parse(stop.end_at);
      add(
        `${job.id}: yetkinlik`,
        (job.skills || []).every((s) => (crew.skills || []).includes(s)),
      );
      add(
        `${job.id}: zaman sırası`,
        arrival >= previous && start >= arrival && finish > start && finish <= end,
      );
      add(`${job.id}: iş süresi`, Math.abs((finish - start) / 60000 - job.duration_min) <= 1 / 60);
      const late = job.due ? Math.max(0, (finish - Date.parse(job.due)) / 60000) : 0;
      add(`${job.id}: gecikme hesabı`, Math.abs(late - stop.late_min) <= 0.11);
      previous = finish;
    }
  }
  return checks;
}

export function assess(run) {
  const expected = run.expected;
  if (!expected) return null;
  if (run.status === 'skipped')
    return { ok: null, checks: [{ name: 'Önkoşul', ok: null, detail: run.error }] };
  const checks = [];
  const add = (name, ok) => checks.push({ name, ok: Boolean(ok) });
  if (expected.http) add(`HTTP ${expected.http}`, run.httpStatus === expected.http);
  if (expected.code)
    add(
      expected.code,
      run.response?.errors?.some((e) => e.code === expected.code),
    );
  if (expected.completed) add('Plan completed', run.response?.status === 'completed');
  if (expected.invariants) checks.push(...(run.checks || []));
  if (expected.noReturn)
    add(
      'Dönüş bacağı yok',
      run.response?.routes?.every((r) => !r.return),
    );
  checks.push(...(run.workflowChecks || []));
  if (run.error && run.status !== 'rejected') add(run.error, false);
  return { ok: checks.length > 0 && checks.every((c) => c.ok), checks };
}
