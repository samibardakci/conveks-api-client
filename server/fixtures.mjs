export function exampleRequest() {
  return {
    depot: { lat: 38.4237, lon: 27.1428 },
    now: '2026-11-17T08:00:00+03:00',
    resources: [
      {
        id: 'EKIP-01',
        shift: { start: '2026-11-17T08:00:00+03:00', end: '2026-11-17T17:00:00+03:00' },
        skills: ['elektrik', 'bakim'],
      },
      {
        id: 'EKIP-02',
        shift: { start: '2026-11-17T09:00:00+03:00', end: '2026-11-17T17:00:00+03:00' },
        skills: ['elektrik'],
      },
    ],
    jobs: [
      {
        id: 'SAP-40001',
        location: { lat: 38.437, lon: 27.148 },
        duration_min: 35,
        skills: ['elektrik'],
        priority: 90,
        urgent: true,
      },
      {
        id: 'SAP-40002',
        location: { lat: 38.451, lon: 27.183 },
        duration_min: 45,
        skills: ['bakim'],
        priority: 70,
        due: '2026-11-17T10:00:00+03:00',
      },
      {
        id: 'SAP-40003',
        location: { lat: 38.464, lon: 27.21 },
        duration_min: 25,
        skills: ['elektrik'],
        priority: 50,
      },
      {
        id: 'SAP-40004',
        location: { lat: 38.418, lon: 27.129 },
        duration_min: 60,
        skills: ['yuksek-gerilim'],
        priority: 80,
      },
    ],
    options: { time_limit_s: 10, max_overtime_min: 0 },
    policy: 'generic@1.0.0',
  };
}

export function testCases(base) {
  const clone = () => structuredClone(base);
  const change = (fn) => {
    const body = clone();
    fn(body);
    return JSON.stringify(body);
  };
  const valid = JSON.stringify(base);
  return [
    {
      id: 'baseline',
      name: 'Temel plan ve sonuç tutarlılığı',
      body: valid,
      expected: { completed: true, invariants: true },
    },
    {
      id: 'async',
      name: 'Asenkron kabul ve sorgulama',
      body: valid,
      wait: 0,
      expected: { http: 202, completed: true, invariants: true },
    },
    {
      id: 'open',
      name: 'Deposuz açık tur',
      body: change((b) => {
        b.resources.forEach((r) => (r.start = r.start || b.depot));
        delete b.depot;
      }),
      expected: { completed: true, invariants: true, noReturn: true },
    },
    {
      id: 'missing',
      name: 'Eksik işler alanı',
      body: change((b) => delete b.jobs),
      expected: { http: 422, code: 'REQUIRED' },
    },
    {
      id: 'unknown',
      name: 'Bilinmeyen alan',
      body: change((b) => (b.unknown_option = true)),
      expected: { http: 422, code: 'UNKNOWN_FIELD' },
    },
    {
      id: 'reserved',
      name: 'Desteklenmeyen zaman penceresi',
      body: change((b) => (b.jobs[0].time_windows = [])),
      expected: { http: 422, code: 'UNSUPPORTED_FIELD' },
    },
    {
      id: 'duplicate',
      name: 'Tekrarlanan iş kimliği',
      body: change((b) => b.jobs.push(structuredClone(b.jobs[0]))),
      expected: { http: 422, code: 'DUPLICATE_ID' },
    },
    {
      id: 'time',
      name: 'Ofsetsiz zaman',
      body: change((b) => (b.now = '2026-11-17T08:00:00')),
      expected: { http: 422, code: 'INVALID_TIME' },
    },
    {
      id: 'range',
      name: 'Öncelik üst sınırı',
      body: change((b) => (b.jobs[0].priority = 101)),
      expected: { http: 422, code: 'OUT_OF_RANGE' },
    },
    {
      id: 'size',
      name: '301 iş sınırı',
      body: change(
        (b) =>
          (b.jobs = Array.from({ length: 301 }, (_, i) => ({ ...b.jobs[0], id: `limit-${i}` }))),
      ),
      expected: { http: 413, code: 'LIMIT_EXCEEDED' },
    },
    {
      id: 'resources',
      name: '31 ekip sınırı',
      body: change(
        (b) =>
          (b.resources = Array.from({ length: 31 }, (_, i) => ({
            ...b.resources[0],
            id: `crew-${i}`,
          }))),
      ),
      expected: { http: 413, code: 'LIMIT_EXCEEDED' },
    },
    {
      id: 'body',
      name: '2 MB gövde sınırı',
      body: JSON.stringify({ padding: 'x'.repeat(2_000_001) }),
      expected: { http: 413, code: 'LIMIT_EXCEEDED' },
    },
    {
      id: 'json',
      name: 'Geçersiz JSON',
      body: '{"jobs":',
      expected: { http: 422, code: 'INVALID_BODY' },
    },
    {
      id: 'auth',
      name: 'Geçersiz API anahtarı',
      body: valid,
      invalidKey: true,
      expected: { http: 401, code: 'UNAUTHORIZED' },
    },
    {
      id: 'policy',
      name: 'Yetkisiz politika',
      body: change((b) => (b.policy = 'not-allowed@1.0.0')),
      expected: { http: 403, code: 'POLICY_NOT_ALLOWED' },
    },
    {
      id: 'fraction',
      name: '0.5 saniye kontrat sınırı',
      body: change((b) => (b.options = { ...b.options, time_limit_s: 0.5 })),
      expected: { completed: true, invariants: true },
    },
    {
      id: 'idempotency',
      name: 'Aynı anahtar / aynı gövde',
      body: valid,
      workflow: 'idempotency',
      expected: { completed: true, invariants: true },
    },
    {
      id: 'conflict',
      name: 'Aynı anahtar / farklı gövde',
      body: valid,
      workflow: 'conflict',
      expected: { completed: true },
    },
    {
      id: 'delete',
      name: 'Silme ve ardından 404',
      body: valid,
      workflow: 'delete',
      expected: { completed: true },
    },
    {
      id: 'isolation',
      name: 'İkinci müşteriyle erişim izolasyonu',
      body: valid,
      workflow: 'isolation',
      expected: { completed: true },
    },
  ];
}

export const manualCases = [
  'OSRM kesintisi → 503 ROUTING_UNAVAILABLE (sunucu hazırlığı gerekir)',
  'Motor cevapsızlığı → timed_out (sunucu hazırlığı gerekir)',
  'İptal edilmiş anahtar → 401 (anahtarı yönetici iptal eder)',
  '7 günlük saklama ve 24 saatlik idempotency süresi (zaman/ortam hazırlığı gerekir)',
  'Kapsam dışı koordinat → 422 (kurulu haritaya göre koordinat seçilir)',
  'Bekleyen planı silme / geç gelen sonuç (zamanlamaya bağlı, laboratuvardan yapılır)',
];
