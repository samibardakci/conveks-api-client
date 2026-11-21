import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  ArrowUpRight,
  Braces,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  FlaskConical,
  FolderOpen,
  History,
  Layers3,
  Link2,
  MapPin,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Terminal,
  Trash2,
  Upload,
  Users,
  Workflow,
  X,
  XCircle,
} from 'lucide-react';
import { api, download, pretty, num, clock, stateLabel, importRows, toCsv, type Json } from './lib';
import './style.css';

const nav = [
  { id: 'workspace', label: 'Planlama alanı', icon: Layers3 },
  { id: 'lab', label: 'İstek laboratuvarı', icon: Braces },
  { id: 'tests', label: 'Test paketleri', icon: ShieldCheck },
  { id: 'experiments', label: 'Deneyler', icon: FlaskConical },
  { id: 'history', label: 'Koşu geçmişi', icon: History },
  { id: 'connections', label: 'Bağlantılar', icon: Link2 },
];
const emptyState = {
  profiles: [],
  scenarios: [],
  runs: [],
  assignments: [],
  manualCases: [],
} as Json;
function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>
      <span />
      {stateLabel[status] || status}
    </span>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Button({
  children,
  onClick,
  primary = false,
  disabled = false,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      className={primary ? 'button primary' : 'button'}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SkillsInput({
  value,
  label,
  onCommit,
}: {
  value: string[];
  label: string;
  onCommit: (value: string[]) => void;
}) {
  const [text, setText] = useState(value.join(', '));
  const serialized = value.join(', ');
  useEffect(() => setText(serialized), [serialized]);
  return (
    <input
      aria-label={label}
      value={text}
      placeholder="elektrik, bakim"
      onChange={(e) => setText(e.target.value)}
      onBlur={() =>
        onCommit(
          text
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        )
      }
    />
  );
}

function RouteMap({ request, result }: { request: Json; result?: Json }) {
  const jobs = request.jobs || [],
    resources = request.resources || [];
  const points = [
    ...jobs.map((j: Json) => j.location),
    ...resources.map((r: Json) => r.start).filter(Boolean),
    request.depot,
  ].filter((p: Json) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (!points.length) return <div className="empty">Konum ekleyerek görünümü oluşturun.</div>;
  const minLon = Math.min(...points.map((p: Json) => p.lon)),
    maxLon = Math.max(...points.map((p: Json) => p.lon)),
    minLat = Math.min(...points.map((p: Json) => p.lat)),
    maxLat = Math.max(...points.map((p: Json) => p.lat));
  const pos = (p: Json) => [
    50 + ((p.lon - minLon) / (maxLon - minLon || 0.01)) * 600,
    245 - ((p.lat - minLat) / (maxLat - minLat || 0.01)) * 195,
  ];
  const colors = ['#107b72', '#c97835', '#6e65b4', '#377db2'];
  return (
    <div className="map">
      <svg
        viewBox="0 0 700 290"
        role="img"
        aria-label="İş konumları ve durak sırası. Çizgiler gerçek yol geometrisi değildir."
      >
        <defs>
          <pattern id="grid" width="35" height="35" patternUnits="userSpaceOnUse">
            <path d="M35 0H0V35" fill="none" stroke="#dce5e3" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="700" height="290" fill="#f1f6f4" />
        <rect width="700" height="290" fill="url(#grid)" />
        <text x="18" y="24" fill="#7d918c" fontSize="11">
          KONUM ŞEMASI · WGS84
        </text>
        {(result?.routes || []).map((r: Json, i: number) => {
          const crew = resources.find((c: Json) => c.id === r.resource_id),
            start = crew?.start || request.depot;
          const coords = [
            start,
            ...r.stops.map((s: Json) => jobs.find((j: Json) => j.id === s.job_id)?.location),
            ...(r.return ? [request.depot] : []),
          ].filter(Boolean);
          return (
            <polyline
              key={r.resource_id}
              points={coords.map((p) => pos(p).join(',')).join(' ')}
              fill="none"
              stroke={colors[i % 4]}
              strokeWidth="2.5"
              strokeDasharray="6 5"
            />
          );
        })}
        {jobs.map((j: Json, i: number) => {
          if (!j.location) return null;
          const [x, y] = pos(j.location);
          const route = result?.routes?.find((r: Json) =>
              r.stops.some((s: Json) => s.job_id === j.id),
            ),
            index = route?.stops.findIndex((s: Json) => s.job_id === j.id),
            unassigned = result?.unassigned?.some((u: Json) => u.job_id === j.id);
          return (
            <g key={j.id} transform={`translate(${x},${y})`}>
              <title>
                {j.id} · {j.location.lat}, {j.location.lon}
              </title>
              <circle
                r="12"
                fill={unassigned ? '#d68147' : j.urgent ? '#b84a3d' : '#147b72'}
                stroke="white"
                strokeWidth="3"
              />
              <text y="4" textAnchor="middle" fill="white" fontSize="10" fontWeight="700">
                {index !== undefined && index >= 0 ? index + 1 : i + 1}
              </text>
              <text y="-19" textAnchor="middle" fill="#344c47" fontSize="10">
                {j.id}
              </text>
            </g>
          );
        })}
        {request.depot &&
          (() => {
            const [x, y] = pos(request.depot);
            return (
              <g transform={`translate(${x},${y})`}>
                <rect
                  x="-10"
                  y="-10"
                  width="20"
                  height="20"
                  rx="4"
                  fill="#213e40"
                  stroke="white"
                  strokeWidth="2"
                />
                <text y="4" textAnchor="middle" fill="white" fontSize="10">
                  D
                </text>
              </g>
            );
          })()}
        <text x="680" y="275" textAnchor="end" fill="#7d918c" fontSize="11">
          N ↑
        </text>
      </svg>
      <div className="map-note">
        <span>
          <i className="legend-dot" /> İş konumu
        </span>
        <span>
          <i className="legend-dot urgent" /> Acil
        </span>
        <span>Kesikli çizgiler yalnız durak sırasını gösterir.</span>
      </div>
    </div>
  );
}

function Timeline({ routes }: { routes: Json[] }) {
  if (!routes?.length) return null;
  const start = Math.min(...routes.map((r) => Date.parse(r.start_at))),
    end = Math.max(...routes.map((r) => Date.parse(r.end_at))),
    span = Math.max(1, end - start);
  return (
    <section className="timeline">
      <h3>Ekip zaman çizelgesi</h3>
      <p>Renkli bloklar iş süreleri; aralıklar yol veya bekleme süresidir.</p>
      {routes.map((r) => (
        <div className="timeline-row" key={r.resource_id}>
          <div>
            <strong>{r.resource_id}</strong>
            <small>
              {clock(r.start_at)} – {clock(r.end_at)}
            </small>
          </div>
          <div className="timeline-track">
            {r.stops.map((s: Json) => (
              <div
                className={s.late_min > 0 ? 'timeline-job late' : 'timeline-job'}
                key={s.job_id}
                style={{
                  left: `${((Date.parse(s.start_at) - start) / span) * 100}%`,
                  width: `${((Date.parse(s.end_at) - Date.parse(s.start_at)) / span) * 100}%`,
                }}
                title={`${s.job_id}: ${clock(s.start_at)}–${clock(s.end_at)}`}
              >
                <span>{s.job_id}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function App() {
  const [state, setState] = useState(emptyState),
    [page, setPage] = useState('workspace'),
    [profileId, setProfileId] = useState('local'),
    [scenarioId, setScenarioId] = useState(''),
    [request, setRequest] = useState<Json | null>(null),
    [scenarioName, setScenarioName] = useState(''),
    [raw, setRaw] = useState(''),
    [dataTab, setDataTab] = useState('jobs'),
    [detail, setDetail] = useState<Json | null>(null),
    [detailTab, setDetailTab] = useState('result'),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [cases, setCases] = useState<Json[]>([]),
    [selectedCases, setSelectedCases] = useState<string[]>([
      'baseline',
      'async',
      'open',
      'missing',
      'unknown',
      'reserved',
      'duplicate',
      'time',
      'range',
      'json',
      'auth',
    ]),
    [otherProfile, setOtherProfile] = useState('');
  const [connection, setConnection] = useState<Json>({
      name: '',
      url: 'http://localhost:8095',
      key: '',
    }),
    [probe, setProbe] = useState<Json | null>(null),
    [wait, setWait] = useState(0),
    [attempts, setAttempts] = useState(4),
    [pollMs, setPollMs] = useState(2000),
    [timeoutMs, setTimeoutMs] = useState(190000),
    [budgetMs, setBudgetMs] = useState(360000),
    [retry, setRetry] = useState(true),
    [idem, setIdem] = useState(''),
    [limits, setLimits] = useState('5,10,30'),
    [overtimes, setOvertimes] = useState('0,30'),
    [repeat, setRepeat] = useState(2),
    [concurrency, setConcurrency] = useState(1),
    [generatedJobs, setGeneratedJobs] = useState(60),
    [generatedCrews, setGeneratedCrews] = useState(5),
    [filter, setFilter] = useState('all'),
    [confirm, setConfirm] = useState<{ text: string; action: () => Promise<void> } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null),
    csvRef = useRef<HTMLInputElement>(null),
    detailId = useRef<string | null>(null),
    initial = useRef(false);
  const load = async () => {
    const s = await api('state');
    setState(s);
    if (!initial.current && s.scenarios.length) {
      initial.current = true;
      chooseScenario(s.scenarios[0]);
    }
    if (detailId.current) setDetail(await api('runs/' + detailId.current));
  };
  useEffect(() => {
    load().catch((e) => setError(e.message));
    api('cases')
      .then(setCases)
      .catch((e) => setError(e.message));
    const timer = setInterval(() => load().catch(() => {}), 2000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  const perform = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  function chooseScenario(s: Json) {
    setScenarioId(s.id);
    setScenarioName(s.name);
    setRequest(structuredClone(s.request));
    setRaw(pretty(s.request));
  }
  const edit = (fn: (b: Json) => void) => {
    setRequest((current) => {
      const b = structuredClone(current!);
      fn(b);
      return b;
    });
  };
  const openRun = async (id: string) => {
    detailId.current = id;
    setDetail(await api('runs/' + id));
    setDetailTab('result');
  };
  const submit = async (useRaw = false) => {
    const run = await api('runs', {
      profileId,
      name: scenarioName + (useRaw ? ' · ham istek' : ''),
      body: useRaw ? raw : JSON.stringify(request),
      wait,
      pollMs,
      timeoutMs,
      budgetMs,
      attempts,
      retry,
      ...(idem ? { idempotencyKey: idem } : {}),
    });
    await openRun(run.id);
    setNotice('Koşu başlatıldı. İstek ve sonuçlar kaydediliyor.');
  };
  const profile = state.profiles.find((p: Json) => p.id === profileId),
    runs = state.runs as Json[],
    active = runs.filter((r) => ['running', 'queued'].includes(r.status)),
    completed = runs.filter((r) => r.status === 'completed'),
    passed = runs.filter((r) => r.assessment?.ok === true),
    failed = runs.filter((r) => r.assessment?.ok === false);
  const selectedTitle = nav.find((n) => n.id === page)?.label;
  const list = runs.filter(
    (r) =>
      filter === 'all' ||
      (filter === 'active' && ['queued', 'running'].includes(r.status)) ||
      (filter === 'passed' && r.assessment?.ok === true) ||
      (filter === 'failed' && r.assessment?.ok === false),
  );
  const batchStats = Object.values(
    runs
      .filter((r) => r.batchId)
      .reduce((acc: Record<string, Json>, r) => {
        const b = (acc[r.batchId] ||= { id: r.batchId, total: 0, passed: 0, failed: 0, active: 0 });
        b.total++;
        b.passed += Number(r.assessment?.ok === true);
        b.failed += Number(r.assessment?.ok === false);
        b.active += Number(['running', 'queued'].includes(r.status));
        return acc;
      }, {}),
  );
  const exportReport = () =>
    perform(async () => download('conveks-test-report.json', await api('report')));
  function runsTable(items: Json[]) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Koşu / deney</th>
              <th>Durum</th>
              <th>Atanan iş</th>
              <th>Mesafe</th>
              <th>Uçtan uca</th>
              <th>Test</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} onClick={() => perform(() => openRun(r.id))} className="clickable">
                <td>
                  <strong>{r.name}</strong>
                  <small>
                    {new Date(r.createdAt).toLocaleString('tr-TR')} · {r.profileName}
                  </small>
                </td>
                <td>
                  <Badge status={r.status} />
                </td>
                <td>{r.summary ? `${r.summary.jobs_assigned} / ${r.summary.jobs_total}` : '—'}</td>
                <td>{r.summary ? num(r.summary.distance_m / 1000) + ' km' : '—'}</td>
                <td>{r.elapsedMs ? num(r.elapsedMs / 1000) + ' sn' : '—'}</td>
                <td>
                  {r.assessment?.ok === true ? (
                    <span className="pass">
                      <Check size={14} /> Geçti
                    </span>
                  ) : r.assessment?.ok === false ? (
                    <span className="fail">
                      <X size={14} /> Kaldı
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <ChevronRight size={16} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && (
          <div className="empty">
            <Activity size={28} />
            <h3>Henüz koşu yok</h3>
            <p>Senaryonuzu hazırlayıp ilk planı gönderin. Sonuçlar burada birikecek.</p>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Workflow size={22} />
          </div>
          <div>
            conveks<span>API LAB</span>
          </div>
        </div>
        <div className="workspace-label">GELİŞTİRİCİ ÇALIŞMA ALANI</div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? 'nav-item selected' : 'nav-item'}
              onClick={() => {
                setPage(n.id);
                setError('');
              }}
            >
              <n.icon size={19} />
              {n.label}
              {n.id === 'history' && runs.length > 0 && (
                <span className="nav-count">{runs.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-tag">
            <Terminal size={16} /> Yalnız yerel ortam
          </div>
          <p>Public API v1 · Aşama A</p>
          <div className="sidebar-rule" />
          <span>
            Sen hazırla.
            <br />
            Conveks planlasın.
          </span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Çalışma alanı <ChevronRight size={14} />
            <strong>{selectedTitle}</strong>
          </div>
          <div className="top-actions">
            <span className="environment">
              <span /> LOCAL
            </span>
            <select
              aria-label="Aktif bağlantı"
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
            >
              {state.profiles.map((p: Json) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="avatar">CX</div>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">CONVEKS OPTIMIZATION API</div>
              <h1>{page === 'workspace' ? 'Veriden plana. Tek çalışma alanı.' : selectedTitle}</h1>
              <p>
                {
                  (
                    {
                      workspace:
                        'İş emirlerini hazırla, ekiplerini eşleştir, optimizasyon sonuçlarını incele.',
                      lab: 'Ham HTTP isteklerini gönder. Her denemeyi, başlığı ve yanıtı takip et.',
                      tests: 'Sözleşmeyi ve plan kalitesini tekrarlanabilir senaryolarla doğrula.',
                      experiments:
                        'Aynı veride farklı hesaplama bütçeleri ve fazla mesai seçeneklerini karşılaştır.',
                      history:
                        'Her istek, her sonuç ve her kontrol. Yerel olarak saklanan koşu arşivin.',
                      connections:
                        'API adreslerini ve müşteri anahtarlarını birbirinden bağımsız yönet.',
                    } as Record<string, string>
                  )[page]
                }
              </p>
            </div>
            <Button onClick={exportReport}>
              <Download size={16} /> Rapor indir
            </Button>
          </div>
          {error && (
            <div className="alert error" role="alert">
              <XCircle size={18} />
              <span>{error}</span>
              <button onClick={() => setError('')} aria-label="Hatayı kapat">
                <X size={16} />
              </button>
            </div>
          )}
          {!profile?.hasKey && page !== 'connections' && (
            <div className="alert info">
              <Link2 size={18} />
              <span>
                Gerçek API koşuları için bağlantına bir API anahtarı ekle. Senaryolarını şimdiden
                hazırlayabilirsin.
              </span>
              <button onClick={() => setPage('connections')}>Bağlantıları aç</button>
            </div>
          )}
          {page === 'workspace' && request && (
            <>
              <div className="metrics">
                <Metric
                  label="İş emri"
                  value={request.jobs.length}
                  icon={<Layers3 />}
                  sub="Planlamaya hazır veri"
                />
                <Metric
                  label="Saha ekibi"
                  value={request.resources.length}
                  icon={<Users />}
                  sub="Yetkinlik ve vardiya bazlı"
                />
                <Metric
                  label="Acil iş"
                  value={request.jobs.filter((j: Json) => j.urgent).length}
                  icon={<Activity />}
                  sub="Öncelikli rota başlangıcı"
                />
                <Metric
                  label="Tamamlanan koşu"
                  value={completed.length}
                  icon={<CheckCircle2 />}
                  sub={`${active.length} koşu bekliyor veya çalışıyor`}
                />
              </div>
              <section className="panel scenario-bar">
                <div>
                  <span className="section-label">AKTİF SENARYO</span>
                  <select
                    value={scenarioId}
                    onChange={(e) =>
                      chooseScenario(state.scenarios.find((s: Json) => s.id === e.target.value))
                    }
                  >
                    {state.scenarios.map((s: Json) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="actions">
                  <Button onClick={() => fileRef.current?.click()}>
                    <Upload size={16} /> İçe aktar
                  </Button>
                  <Button onClick={() => download('plan-request.json', request)}>
                    <Download size={16} /> JSON
                  </Button>
                  <Button
                    onClick={() =>
                      perform(async () => {
                        const s = await api('scenarios', {
                          name: scenarioName + ' · kopya',
                          request,
                        });
                        chooseScenario(s);
                        setNotice('Senaryo kopyası kaydedildi.');
                      })
                    }
                  >
                    <Plus size={16} /> Kopyala
                  </Button>
                  <Button
                    onClick={() =>
                      perform(async () => {
                        await api('scenarios', { id: scenarioId, name: scenarioName, request });
                        setNotice('Senaryo kaydedildi.');
                      })
                    }
                  >
                    <Save size={16} /> Kaydet
                  </Button>
                </div>
              </section>
              <div className="workspace-grid">
                <section className="panel data-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Müşteri verisi</h2>
                      <p>ERP / EAM’den gelen iş emirleri ve ekipler</p>
                    </div>
                    <span className="tag">SAP örnek akışı</span>
                  </div>
                  <div className="tabs">
                    <button
                      className={dataTab === 'jobs' ? 'active' : ''}
                      onClick={() => setDataTab('jobs')}
                    >
                      İş emirleri <span>{request.jobs.length}</span>
                    </button>
                    <button
                      className={dataTab === 'resources' ? 'active' : ''}
                      onClick={() => setDataTab('resources')}
                    >
                      Ekipler <span>{request.resources.length}</span>
                    </button>
                    <button
                      className={dataTab === 'assignments' ? 'active' : ''}
                      onClick={() => setDataTab('assignments')}
                    >
                      Yerel atamalar
                    </button>
                    <div className="tabs-right">
                      {dataTab !== 'assignments' && (
                        <button onClick={() => csvRef.current?.click()}>
                          <Upload size={14} /> CSV
                        </button>
                      )}
                    </div>
                  </div>
                  {dataTab === 'jobs' && (
                    <>
                      <div className="table-wrap">
                        <table className="editor-table">
                          <thead>
                            <tr>
                              <th>İş emri / konum</th>
                              <th>Süre / öncelik</th>
                              <th>Yetkinlik / termin</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {request.jobs.map((j: Json, i: number) => (
                              <tr key={i}>
                                <td>
                                  <input
                                    aria-label={`İş ${i + 1} kimliği`}
                                    value={j.id}
                                    onChange={(e) => edit((b) => (b.jobs[i].id = e.target.value))}
                                  />
                                  <div className="coordinate-input">
                                    <input
                                      aria-label={`İş ${i + 1} enlem`}
                                      type="number"
                                      step="any"
                                      value={j.location?.lat ?? ''}
                                      onChange={(e) =>
                                        edit(
                                          (b) =>
                                            (b.jobs[i].location = {
                                              ...j.location,
                                              lat: Number(e.target.value),
                                            }),
                                        )
                                      }
                                    />
                                    <input
                                      aria-label={`İş ${i + 1} boylam`}
                                      type="number"
                                      step="any"
                                      value={j.location?.lon ?? ''}
                                      onChange={(e) =>
                                        edit(
                                          (b) =>
                                            (b.jobs[i].location = {
                                              ...j.location,
                                              lon: Number(e.target.value),
                                            }),
                                        )
                                      }
                                    />
                                  </div>
                                </td>
                                <td>
                                  <div className="inline-input">
                                    <input
                                      aria-label={`İş ${i + 1} süre`}
                                      type="number"
                                      min="0.1"
                                      max="1440"
                                      value={j.duration_min}
                                      onChange={(e) =>
                                        edit(
                                          (b) => (b.jobs[i].duration_min = Number(e.target.value)),
                                        )
                                      }
                                    />
                                    <small>dk</small>
                                  </div>
                                  <div className="inline-input">
                                    <input
                                      aria-label={`İş ${i + 1} öncelik`}
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={j.priority ?? ''}
                                      placeholder="50"
                                      onChange={(e) =>
                                        edit((b) => {
                                          if (e.target.value === '') delete b.jobs[i].priority;
                                          else b.jobs[i].priority = Number(e.target.value);
                                        })
                                      }
                                    />
                                    <label className="checkbox">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(j.urgent)}
                                        onChange={(e) =>
                                          edit((b) => (b.jobs[i].urgent = e.target.checked))
                                        }
                                      />{' '}
                                      Acil
                                    </label>
                                  </div>
                                </td>
                                <td>
                                  <SkillsInput
                                    label={`İş ${i + 1} yetkinlikler`}
                                    value={j.skills || []}
                                    onCommit={(value) => edit((b) => (b.jobs[i].skills = value))}
                                  />
                                  <input
                                    aria-label={`İş ${i + 1} termin`}
                                    value={j.due || ''}
                                    placeholder="Termin · ISO-8601 +03:00"
                                    onChange={(e) =>
                                      edit((b) => {
                                        if (e.target.value) b.jobs[i].due = e.target.value;
                                        else delete b.jobs[i].due;
                                      })
                                    }
                                  />
                                </td>
                                <td>
                                  <button
                                    className="icon-button"
                                    aria-label={`${j.id} sil`}
                                    onClick={() => edit((b) => b.jobs.splice(i, 1))}
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="panel-footer">
                        <button
                          className="text-button"
                          onClick={() =>
                            edit((b) =>
                              b.jobs.push({
                                id: `SAP-${Date.now().toString().slice(-6)}`,
                                location: { ...(b.depot || { lat: 38.4237, lon: 27.1428 }) },
                                duration_min: 30,
                                priority: 50,
                                skills: [],
                              }),
                            )
                          }
                        >
                          <Plus size={16} /> İş emri ekle
                        </button>
                        <small>İşlem başına en fazla 300 iş</small>
                      </div>
                    </>
                  )}
                  {dataTab === 'resources' && (
                    <>
                      <div className="table-wrap">
                        <table className="editor-table">
                          <thead>
                            <tr>
                              <th>Ekip / yetkinlik</th>
                              <th>Vardiya başlangıç / bitiş</th>
                              <th>Çıkış konumu</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {request.resources.map((r: Json, i: number) => (
                              <tr key={i}>
                                <td>
                                  <input
                                    aria-label={`Ekip ${i + 1} kimliği`}
                                    value={r.id}
                                    onChange={(e) =>
                                      edit((b) => (b.resources[i].id = e.target.value))
                                    }
                                  />
                                  <SkillsInput
                                    label={`Ekip ${i + 1} yetkinlikler`}
                                    value={r.skills || []}
                                    onCommit={(value) =>
                                      edit((b) => (b.resources[i].skills = value))
                                    }
                                  />
                                </td>
                                <td>
                                  <input
                                    aria-label={`Ekip ${i + 1} vardiya başlangıcı`}
                                    value={r.shift.start}
                                    onChange={(e) =>
                                      edit((b) => (b.resources[i].shift.start = e.target.value))
                                    }
                                  />
                                  <input
                                    aria-label={`Ekip ${i + 1} vardiya bitişi`}
                                    value={r.shift.end}
                                    onChange={(e) =>
                                      edit((b) => (b.resources[i].shift.end = e.target.value))
                                    }
                                  />
                                </td>
                                <td>
                                  <label className="checkbox">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(r.start)}
                                      onChange={(e) =>
                                        edit((b) => {
                                          if (e.target.checked)
                                            b.resources[i].start = {
                                              ...(b.depot || { lat: 38.4237, lon: 27.1428 }),
                                            };
                                          else delete b.resources[i].start;
                                        })
                                      }
                                    />{' '}
                                    Özel çıkış
                                  </label>
                                  {r.start && (
                                    <div className="coordinate-input">
                                      <input
                                        aria-label={`Ekip ${i + 1} çıkış enlem`}
                                        type="number"
                                        step="any"
                                        value={r.start.lat}
                                        onChange={(e) =>
                                          edit(
                                            (b) =>
                                              (b.resources[i].start.lat = Number(e.target.value)),
                                          )
                                        }
                                      />
                                      <input
                                        aria-label={`Ekip ${i + 1} çıkış boylam`}
                                        type="number"
                                        step="any"
                                        value={r.start.lon}
                                        onChange={(e) =>
                                          edit(
                                            (b) =>
                                              (b.resources[i].start.lon = Number(e.target.value)),
                                          )
                                        }
                                      />
                                    </div>
                                  )}
                                </td>
                                <td>
                                  <button
                                    className="icon-button"
                                    aria-label={`${r.id} sil`}
                                    onClick={() => edit((b) => b.resources.splice(i, 1))}
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="panel-footer">
                        <button
                          className="text-button"
                          onClick={() =>
                            edit((b) =>
                              b.resources.push({
                                id: `EKIP-${b.resources.length + 1}`,
                                skills: [],
                                shift: {
                                  start: '2026-11-17T08:00:00+03:00',
                                  end: '2026-11-17T17:00:00+03:00',
                                },
                              }),
                            )
                          }
                        >
                          <Plus size={16} /> Ekip ekle
                        </button>
                        <small>En fazla 30 ekip</small>
                      </div>
                    </>
                  )}
                  {dataTab === 'assignments' && (
                    <div className="assignment-list">
                      {state.assignments.length ? (
                        state.assignments.map((a: Json) => (
                          <div className="assignment" key={a.id}>
                            <h3>
                              {a.rows.length} iş atandı{' '}
                              <small>{new Date(a.appliedAt).toLocaleString('tr-TR')}</small>
                            </h3>
                            {a.rows.map((r: Json) => (
                              <div className="assignment-row" key={r.jobId}>
                                <strong>{r.jobId}</strong>
                                <span>{r.resourceId}</span>
                                <span>#{r.sequence}</span>
                                <span>
                                  {clock(r.startAt)} – {clock(r.endAt)}
                                </span>
                              </div>
                            ))}
                            <Button onClick={() => download('yerel-atamalar.csv', toCsv(a.rows))}>
                              <Download size={14} /> CSV indir
                            </Button>
                          </div>
                        ))
                      ) : (
                        <div className="empty">
                          <Workflow size={28} />
                          <h3>Henüz atama uygulanmadı</h3>
                          <p>
                            Tamamlanan bir sonucu inceleyip “Yerel atamalara uygula” seçeneğini
                            kullan.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </section>
                <section className="panel settings-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Planlama ayarları</h2>
                      <p>Public sözleşmenin sunduğu seçenekler</p>
                    </div>
                    <SlidersHorizontal size={18} />
                  </div>
                  <div className="settings-content">
                    <Field label="Senaryo adı">
                      <input
                        value={scenarioName}
                        onChange={(e) => setScenarioName(e.target.value)}
                      />
                    </Field>
                    <Field
                      label="Planlama anı"
                      hint="Sabit zaman, senaryoyu tekrar oynamanı sağlar."
                    >
                      <input
                        value={request.now || ''}
                        placeholder="Boş: sunucu zamanı"
                        onChange={(e) =>
                          edit((b) => {
                            if (e.target.value) b.now = e.target.value;
                            else delete b.now;
                          })
                        }
                      />
                    </Field>
                    <div className="form-row">
                      <Field label="Hesaplama bütçesi">
                        <div className="unit-input">
                          <input
                            type="number"
                            min="0.1"
                            max="60"
                            step="0.5"
                            value={request.options?.time_limit_s ?? ''}
                            placeholder="30"
                            onChange={(e) =>
                              edit((b) => {
                                b.options ||= {};
                                if (e.target.value) b.options.time_limit_s = Number(e.target.value);
                                else delete b.options.time_limit_s;
                              })
                            }
                          />
                          <span>sn</span>
                        </div>
                      </Field>
                      <Field label="Fazla mesai">
                        <div className="unit-input">
                          <input
                            type="number"
                            min="0"
                            max="120"
                            value={request.options?.max_overtime_min ?? ''}
                            placeholder="0"
                            onChange={(e) =>
                              edit((b) => {
                                b.options ||= {};
                                if (e.target.value)
                                  b.options.max_overtime_min = Number(e.target.value);
                                else delete b.options.max_overtime_min;
                              })
                            }
                          />
                          <span>dk</span>
                        </div>
                      </Field>
                    </div>
                    <Field label="Politika paketi" hint="Yalnız hesabına izin verilen paketler.">
                      <input
                        value={request.policy || ''}
                        placeholder="Tenant varsayılanı"
                        onChange={(e) =>
                          edit((b) => {
                            if (e.target.value) b.policy = e.target.value;
                            else delete b.policy;
                          })
                        }
                      />
                    </Field>
                    <div className="depot-toggle">
                      <div>
                        <strong>Depoya dönüş</strong>
                        <small>Depolu kapalı tur</small>
                      </div>
                      <input
                        aria-label="Depolu plan"
                        type="checkbox"
                        className="switch"
                        checked={Boolean(request.depot)}
                        onChange={(e) =>
                          edit((b) => {
                            if (e.target.checked) b.depot = { lat: 38.4237, lon: 27.1428 };
                            else {
                              b.resources.forEach((r: Json) => (r.start ||= { ...b.depot }));
                              delete b.depot;
                            }
                          })
                        }
                      />
                    </div>
                    {request.depot && (
                      <div className="form-row">
                        <Field label="Depo enlemi">
                          <input
                            type="number"
                            step="any"
                            value={request.depot.lat}
                            onChange={(e) => edit((b) => (b.depot.lat = Number(e.target.value)))}
                          />
                        </Field>
                        <Field label="Depo boylamı">
                          <input
                            type="number"
                            step="any"
                            value={request.depot.lon}
                            onChange={(e) => edit((b) => (b.depot.lon = Number(e.target.value)))}
                          />
                        </Field>
                      </div>
                    )}
                    <div className="subtle-note">
                      <ShieldCheck size={16} />
                      <span>Algoritma ve çözücü profili sunucu tarafından seçilir.</span>
                    </div>
                    <Button
                      primary
                      disabled={
                        busy ||
                        !profile?.hasKey ||
                        !request.jobs.length ||
                        !request.resources.length
                      }
                      onClick={() => perform(() => submit())}
                    >
                      <Play size={17} /> Optimizasyonu başlat
                    </Button>
                    <button
                      className="text-button centered"
                      onClick={() => {
                        setRaw(pretty(request));
                        setPage('lab');
                      }}
                    >
                      İsteği laboratuvarda aç <ArrowUpRight size={14} />
                    </button>
                  </div>
                </section>
              </div>
              <div className="bottom-grid">
                <section className="panel">
                  <div className="panel-title">
                    <div>
                      <h2>Operasyon bölgesi</h2>
                      <p>İş ve depo koordinatlarının şematik görünümü</p>
                    </div>
                    <MapPin size={18} />
                  </div>
                  <RouteMap request={request} />
                </section>
                <section className="panel">
                  <div className="panel-title">
                    <div>
                      <h2>Son koşular</h2>
                      <p>En son gönderdiğin planlar</p>
                    </div>
                    <button className="text-button" onClick={() => setPage('history')}>
                      Tümü
                    </button>
                  </div>
                  {runs.slice(0, 4).map((r) => (
                    <button
                      key={r.id}
                      className="recent-run"
                      onClick={() => perform(() => openRun(r.id))}
                    >
                      <div className="run-icon">
                        <Activity size={17} />
                      </div>
                      <div>
                        <strong>{r.name}</strong>
                        <small>
                          {clock(r.createdAt)} ·{' '}
                          {r.planId?.slice(0, 16) || 'Plan kimliği bekleniyor'}
                        </small>
                      </div>
                      <Badge status={r.status} />
                    </button>
                  ))}
                  {!runs.length && (
                    <div className="empty compact">
                      <Clock3 size={25} />
                      <p>İlk koşunun sonucu burada görünecek.</p>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
          {page === 'lab' && (
            <div className="lab-grid">
              <section className="panel">
                <div className="panel-title">
                  <div>
                    <h2>İstek gövdesi</h2>
                    <p>Ham mod: doğrulama hataları dahil, yazdığın baytlar gönderilir.</p>
                  </div>
                  <Button onClick={() => setRaw(pretty(request))}>
                    <RefreshCw size={14} /> Senaryodan al
                  </Button>
                </div>
                <div className="endpoint">
                  <span>POST</span>
                  <code>
                    {profile?.url}/v1/plans?wait={wait}
                  </code>
                </div>
                <textarea
                  className="code-editor"
                  aria-label="Ham JSON istek"
                  spellCheck={false}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                />
                <div className="panel-footer">
                  <span className="mono">
                    {new TextEncoder().encode(raw).length.toLocaleString('tr-TR')} bayt ·
                    application/json
                  </span>
                  <Button
                    primary
                    disabled={busy || !profile?.hasKey}
                    onClick={() => perform(() => submit(true))}
                  >
                    <Play size={15} /> İsteği gönder
                  </Button>
                </div>
              </section>
              <section className="panel settings-panel">
                <div className="panel-title">
                  <h2>HTTP davranışı</h2>
                  <Settings2 size={18} />
                </div>
                <div className="settings-content">
                  <Field label="Idempotency-Key" hint="Boş bırak: her yeni koşu için yeni anahtar.">
                    <input
                      value={idem}
                      onChange={(e) => setIdem(e.target.value)}
                      placeholder="Otomatik UUID"
                    />
                  </Field>
                  <Field label="wait (saniye)">
                    <input
                      type="number"
                      min="0"
                      max="60"
                      value={wait}
                      onChange={(e) => setWait(Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Sorgulama aralığı (ms)">
                    <input
                      type="number"
                      min="100"
                      value={pollMs}
                      onChange={(e) => setPollMs(Number(e.target.value))}
                    />
                  </Field>
                  <Field label="HTTP zaman aşımı (ms)">
                    <input
                      type="number"
                      min="100"
                      value={timeoutMs}
                      onChange={(e) => setTimeoutMs(Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Toplam bekleme bütçesi (ms)">
                    <input
                      type="number"
                      min="100"
                      value={budgetMs}
                      onChange={(e) => setBudgetMs(Number(e.target.value))}
                    />
                  </Field>
                  <Field label="En fazla deneme">
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={attempts}
                      onChange={(e) => setAttempts(Number(e.target.value))}
                    />
                  </Field>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={retry}
                      onChange={(e) => setRetry(e.target.checked)}
                    />{' '}
                    Geçici hatalarda tekrar dene
                  </label>
                  <p className="muted">
                    429, 500, 502, 503, 504 ve IDEMPOTENCY_IN_PROGRESS. Retry-After korunur. Ağ
                    hatalarında aynı gövde ve anahtar kullanılır.
                  </p>
                </div>
              </section>
            </div>
          )}
          {page === 'connections' && (
            <div className="connection-grid">
              <section className="panel">
                <div className="panel-title">
                  <h2>Bağlantı profilleri</h2>
                  <Button
                    onClick={() => {
                      setConnection({
                        name: 'Yeni müşteri',
                        url: 'http://localhost:8095',
                        key: '',
                      });
                      setProbe(null);
                    }}
                  >
                    <Plus size={15} /> Yeni
                  </Button>
                </div>
                {state.profiles.map((p: Json) => (
                  <button
                    className="connection-card"
                    key={p.id}
                    onClick={() => {
                      setConnection({ ...p, key: '' });
                      setProbe(null);
                    }}
                  >
                    <div className="connection-icon">
                      <Link2 size={22} />
                    </div>
                    <div>
                      <h3>{p.name}</h3>
                      <code>{p.url}</code>
                      <small>
                        {p.hasKey ? 'Anahtar bu oturumda hazır' : 'API anahtarı gerekli'}
                      </small>
                    </div>
                    <ChevronRight size={18} />
                  </button>
                ))}
                <div className="subtle-note padded">
                  <ShieldCheck size={18} />
                  <span>
                    Anahtarlar yalnız yerel sunucunun belleğinde tutulur. Sunucu yeniden
                    başladığında yeniden girilir. Varsayılan profil CONVEKS_KEY ortam değişkenini de
                    kullanabilir.
                  </span>
                </div>
              </section>
              <section className="panel">
                <div className="panel-title">
                  <h2>{connection.id ? 'Bağlantıyı düzenle' : 'Yeni bağlantı'}</h2>
                </div>
                <div className="settings-content">
                  <Field label="Profil adı">
                    <input
                      value={connection.name}
                      onChange={(e) => setConnection({ ...connection, name: e.target.value })}
                    />
                  </Field>
                  <Field label="API adresi">
                    <input
                      value={connection.url}
                      onChange={(e) => setConnection({ ...connection, url: e.target.value })}
                    />
                  </Field>
                  <Field label="API anahtarı" hint="Boş bırakırsan mevcut oturum anahtarı korunur.">
                    <input
                      type="password"
                      autoComplete="off"
                      value={connection.key}
                      placeholder="ck_live_…"
                      onChange={(e) => setConnection({ ...connection, key: e.target.value })}
                    />
                  </Field>
                  <div className="actions">
                    <Button
                      primary
                      disabled={busy || !connection.name}
                      onClick={() =>
                        perform(async () => {
                          const p = await api('profiles', connection);
                          setProfileId(p.id);
                          setConnection({ ...p, key: '' });
                          setNotice('Bağlantı kaydedildi.');
                        })
                      }
                    >
                      <Save size={16} /> Kaydet
                    </Button>
                    {connection.id && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          perform(async () =>
                            setProbe(await api('probe', { profileId: connection.id })),
                          )
                        }
                      >
                        <Activity size={16} /> Bağlantıyı test et
                      </Button>
                    )}
                  </div>
                  {connection.id && (
                    <button
                      className="text-button"
                      onClick={() =>
                        perform(async () => {
                          await api('profiles', { ...connection, key: '', clearKey: true });
                          setNotice(
                            'Bellekteki anahtar kaldırıldı. CONVEKS_KEY varsa kullanılmaya devam eder.',
                          );
                        })
                      }
                    >
                      Bellekteki anahtarı kaldır
                    </button>
                  )}
                  {probe && (
                    <div className="probe-result">
                      <h3>
                        {probe.authenticated
                          ? 'Kimlik doğrulaması başarılı'
                          : 'Kimlik doğrulaması doğrulanamadı'}
                      </h3>
                      <p>
                        Health: {probe.health.status} · OpenAPI: {probe.schema.status} · Yetkili
                        GET: {probe.auth.status}
                      </p>
                      <p>{probe.note}</p>
                      <details>
                        <summary>OpenAPI sözleşmesini incele</summary>
                        <pre>{pretty(probe.schema.data)}</pre>
                      </details>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
          {page === 'tests' && (
            <>
              <div className="metrics">
                <Metric
                  label="Başarılı test"
                  value={passed.length}
                  icon={<CheckCircle2 />}
                  sub="Beklentiyi karşılayan koşular"
                />
                <Metric
                  label="Başarısız test"
                  value={failed.length}
                  icon={<XCircle />}
                  sub="İncelenmesi gereken sonuçlar"
                />
                <Metric
                  label="Aktif koşu"
                  value={active.length}
                  icon={<Activity />}
                  sub="Sıralı test yürütümü"
                />
                <Metric
                  label="Hazır test"
                  value={cases.length}
                  icon={<ShieldCheck />}
                  sub="Public API senaryoları"
                />
              </div>
              <div className="test-grid">
                <section className="panel">
                  <div className="panel-title">
                    <div>
                      <h2>Kontrat ve işlev testleri</h2>
                      <p>
                        Taban veri: {scenarioName}. Negatif testlerde otomatik tekrar kapalıdır.
                      </p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() =>
                        setSelectedCases(
                          selectedCases.length === cases.length ? [] : cases.map((c) => c.id),
                        )
                      }
                    >
                      {selectedCases.length === cases.length ? 'Seçimi kaldır' : 'Tümünü seç'}
                    </button>
                  </div>
                  <div className="test-list">
                    {cases.map((c) => (
                      <label key={c.id} className="test-item">
                        <input
                          type="checkbox"
                          checked={selectedCases.includes(c.id)}
                          onChange={(e) =>
                            setSelectedCases(
                              e.target.checked
                                ? [...selectedCases, c.id]
                                : selectedCases.filter((id) => id !== c.id),
                            )
                          }
                        />
                        <div>
                          <strong>{c.name}</strong>
                          <small>
                            {c.expected?.code ||
                              (c.workflow
                                ? 'Çok adımlı HTTP doğrulaması'
                                : 'Plan sonucu ve tutarlılık kontrolleri')}
                          </small>
                        </div>
                        <span className="tag">{c.expected?.http || 'E2E'}</span>
                      </label>
                    ))}
                  </div>
                  <div className="panel-footer">
                    <span>{selectedCases.length} test seçildi</span>
                    <Button
                      primary
                      disabled={busy || !profile?.hasKey || !selectedCases.length}
                      onClick={() =>
                        perform(async () => {
                          const b = await api('suite', {
                            profileId,
                            otherProfileId: otherProfile,
                            request,
                            cases: selectedCases,
                          });
                          setNotice(`${b.runs.length} test sıraya alındı.`);
                          setPage('history');
                        })
                      }
                    >
                      <Play size={16} /> Testleri çalıştır
                    </Button>
                  </div>
                </section>
                <div>
                  <section className="panel">
                    <div className="panel-title">
                      <h2>İzolasyon önkoşulu</h2>
                    </div>
                    <div className="settings-content">
                      <Field
                        label="İkinci müşteri bağlantısı"
                        hint="Aynı sunucuda farklı tenant’a ait anahtar olmalı."
                      >
                        <select
                          value={otherProfile}
                          onChange={(e) => setOtherProfile(e.target.value)}
                        >
                          <option value="">Seçilmedi · test atlanır</option>
                          {state.profiles
                            .filter((p: Json) => p.id !== profileId)
                            .map((p: Json) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                      </Field>
                    </div>
                  </section>
                  <section className="panel manual-panel">
                    <div className="panel-title">
                      <div>
                        <h2>Ortam hazırlığı gerekenler</h2>
                        <p>Bu testler otomatik olarak başarılı sayılmaz.</p>
                      </div>
                    </div>
                    {state.manualCases.map((m: string) => (
                      <div className="manual-case" key={m}>
                        <Clock3 size={16} />
                        <span>
                          {m}
                          <small>Çalıştırılmadı</small>
                        </span>
                      </div>
                    ))}
                  </section>
                </div>
              </div>
            </>
          )}
          {page === 'experiments' && (
            <>
              <div className="lab-grid">
                <section className="panel">
                  <div className="panel-title">
                    <div>
                      <h2>Parametre karşılaştırması</h2>
                      <p>Aynı senaryo, bağımsız planlar ve yeni idempotency anahtarları.</p>
                    </div>
                    <FlaskConical size={20} />
                  </div>
                  <div className="settings-content">
                    <div className="form-row">
                      <Field label="Hesaplama süreleri (sn)" hint="Virgülle ayır: 5,10,30">
                        <input value={limits} onChange={(e) => setLimits(e.target.value)} />
                      </Field>
                      <Field label="Fazla mesai seçenekleri (dk)">
                        <input value={overtimes} onChange={(e) => setOvertimes(e.target.value)} />
                      </Field>
                    </div>
                    <div className="form-row">
                      <Field label="Her kombinasyon için tekrar">
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={repeat}
                          onChange={(e) => setRepeat(Number(e.target.value))}
                        />
                      </Field>
                      <Field
                        label="Eşzamanlı koşu"
                        hint="1: kalite karşılaştırması. >1: kontrollü yük."
                      >
                        <input
                          type="number"
                          min="1"
                          max="8"
                          value={concurrency}
                          onChange={(e) => setConcurrency(Number(e.target.value))}
                        />
                      </Field>
                    </div>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={retry}
                        onChange={(e) => setRetry(e.target.checked)}
                      />{' '}
                      Kota ve geçici hatalarda Retry-After ile tekrar dene
                    </label>
                    <div className="experiment-preview">
                      <span>PLANLANAN KOŞU</span>
                      <strong>
                        {limits.split(',').filter((s) => s.trim()).length *
                          overtimes.split(',').filter((s) => s.trim()).length *
                          repeat}
                      </strong>
                      <p>
                        {scenarioName} · {request?.jobs.length} iş / {request?.resources.length}{' '}
                        ekip
                      </p>
                    </div>
                    <Button
                      primary
                      disabled={busy || !profile?.hasKey}
                      onClick={() =>
                        setConfirm({
                          text: 'Bu deney gerçek API’ye plan istekleri gönderecek. Koşular kota kullanır ve yerel geçmişe kaydedilir.',
                          action: async () => {
                            const parse = (s: string) =>
                              s.split(',').map((x) => {
                                if (!x.trim()) throw new Error('Boş parametre değeri');
                                return Number(x);
                              });
                            const b = await api('experiment', {
                              profileId,
                              request,
                              limits: parse(limits),
                              overtimes: parse(overtimes),
                              repeat,
                              concurrency,
                              retry,
                            });
                            setNotice(`${b.runs.length} deney koşusu başlatıldı.`);
                            setPage('history');
                          },
                        })
                      }
                    >
                      <Play size={16} /> Deneyi başlat
                    </Button>
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-title">
                    <h2>Sonuçları nasıl okuyalım?</h2>
                  </div>
                  <div className="settings-content">
                    <Field
                      label="İş yükü oluştur · iş sayısı"
                      hint="Profil eşikleri için 10, 11, 60, 61; sınır için 300."
                    >
                      <input
                        type="number"
                        min="1"
                        max="300"
                        value={generatedJobs}
                        onChange={(e) => setGeneratedJobs(Number(e.target.value))}
                      />
                    </Field>
                    <Field label="Ekip sayısı">
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={generatedCrews}
                        onChange={(e) => setGeneratedCrews(Number(e.target.value))}
                      />
                    </Field>
                    <Button
                      onClick={() =>
                        perform(async () => {
                          if (!request?.jobs?.length || !request.resources?.length)
                            throw new Error('Taban senaryoda en az bir iş ve ekip gerekli');
                          if (
                            !Number.isInteger(generatedJobs) ||
                            generatedJobs < 1 ||
                            generatedJobs > 300 ||
                            !Number.isInteger(generatedCrews) ||
                            generatedCrews < 1 ||
                            generatedCrews > 30
                          )
                            throw new Error('1–300 iş ve 1–30 ekip seçin');
                          const b = structuredClone(request);
                          b.jobs = Array.from({ length: generatedJobs }, (_, i) => ({
                            ...structuredClone(request.jobs[i % request.jobs.length]),
                            id: `JOB-${i + 1}`,
                          }));
                          b.resources = Array.from({ length: generatedCrews }, (_, i) => ({
                            ...structuredClone(request.resources[i % request.resources.length]),
                            id: `CREW-${i + 1}`,
                          }));
                          const s = await api('scenarios', {
                            name: `Yük · ${generatedJobs} iş / ${generatedCrews} ekip`,
                            request: b,
                          });
                          chooseScenario(s);
                          setNotice(
                            'Sentetik yük senaryosu oluşturuldu; henüz API’ye gönderilmedi.',
                          );
                        })
                      }
                    >
                      <Plus size={15} /> Yeni yük senaryosu oluştur
                    </Button>
                    <p>
                      Mevcut koordinat ve iş özellikleri döngüyle çoğaltılır. Bu sentetik veri
                      gerçekçi coğrafi çeşitlilik iddiası taşımaz.
                    </p>
                    <p>
                      Plan kimliği arama tohumunu etkiler. Tek koşu yerine tekrarların dağılımına
                      bak.
                    </p>
                    <p>
                      Atanan iş, mesafe, geciken iş, fazla mesai ve uçtan uca süre birlikte
                      karşılaştırılır.
                    </p>
                    <p>
                      Ölçülen süreye ağ, kuyruk, matris hazırlığı ve polling dahildir. Bu değer saf
                      motor süresi değildir.
                    </p>
                    <div className="subtle-note">
                      <SlidersHorizontal size={18} />
                      <span>
                        Algoritma, amaç ağırlıkları ve çözücü profili public API’den değiştirilemez.
                      </span>
                    </div>
                  </div>
                </section>
              </div>
              <ExperimentSummary runs={runs} />
            </>
          )}
          {page === 'history' && (
            <>
              <div className="history-toolbar">
                <div className="tabs no-border">
                  {[
                    ['all', 'Tüm koşular'],
                    ['active', 'Aktif'],
                    ['passed', 'Geçen testler'],
                    ['failed', 'Kalan testler'],
                  ].map(([v, t]) => (
                    <button
                      key={v}
                      className={filter === v ? 'active' : ''}
                      onClick={() => setFilter(v)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="actions">
                  <Button
                    onClick={() =>
                      download(
                        'kosular.csv',
                        toCsv(
                          runs.map((r) => ({
                            id: r.id,
                            name: r.name,
                            status: r.status,
                            assigned: r.summary?.jobs_assigned,
                            distance_m: r.summary?.distance_m,
                            late_jobs: r.summary?.late_jobs,
                            overtime_min: r.summary?.overtime_min,
                            elapsed_ms: r.elapsedMs,
                            test: r.assessment?.ok,
                          })),
                        ),
                      )
                    }
                  >
                    <Download size={15} /> CSV
                  </Button>
                  {active.length > 0 && (
                    <Button
                      onClick={() =>
                        setConfirm({
                          text: 'Tüm aktif yerel takipler durdurulacak. Sunucuda kabul edilmiş planlar hesaplanmaya devam edebilir.',
                          action: async () => {
                            for (const r of active) await api(`runs/${r.id}/cancel`, {});
                          },
                        })
                      }
                    >
                      <Square size={14} /> Takipleri durdur
                    </Button>
                  )}
                </div>
              </div>
              {batchStats.length > 0 && (
                <div className="batch-list">
                  {batchStats.slice(0, 4).map((b) => (
                    <div className="batch-card" key={b.id}>
                      <strong>Paket · {b.id.slice(0, 8)}</strong>
                      <span>
                        {b.total} koşu · {b.passed} geçti · {b.failed} kaldı · {b.active} aktif
                      </span>
                      <button
                        className="text-button"
                        onClick={() =>
                          perform(async () =>
                            download(
                              `paket-${b.id.slice(0, 8)}.json`,
                              await api('report?batch=' + b.id),
                            ),
                          )
                        }
                      >
                        <Download size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <section className="panel">{runsTable(list)}</section>
            </>
          )}
          <footer className="footer">
            <span>
              Conveks API Lab <span className="footer-dot">·</span> Yerel müşteri istemcisi
            </span>
            <span>TRL4Engine’den bağımsız · HTTP üzerinden bağlanır</span>
          </footer>
        </main>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f)
            perform(async () => {
              const parsed = JSON.parse(await f.text());
              const r = parsed.request || parsed;
              if (!Array.isArray(r.jobs) || !Array.isArray(r.resources))
                throw new Error('JSON jobs ve resources listelerini içermeli');
              const s = await api('scenarios', {
                name: parsed.name || f.name.replace('.json', ''),
                request: r,
              });
              chooseScenario(s);
              setNotice('Senaryo içe aktarıldı.');
            });
          e.target.value = '';
        }}
      />
      <input
        ref={csvRef}
        type="file"
        accept=".csv"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f)
            perform(async () => {
              const kind = dataTab === 'resources' ? 'resources' : 'jobs';
              const rows = importRows(await f.text(), kind);
              edit((b) => (b[kind] = rows));
              setNotice(
                `${rows.length} ${kind === 'jobs' ? 'iş' : 'ekip'} yüklendi. Kalıcı tutmak için senaryoyu kaydet.`,
              );
            });
          e.target.value = '';
        }}
      />
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {notice}
        </div>
      )}
      {detail && (
        <div
          className="drawer-backdrop"
          onClick={() => {
            setDetail(null);
            detailId.current = null;
          }}
        >
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="eyebrow">KOŞU DETAYI</div>
              <button
                className="icon-button"
                aria-label="Detayı kapat"
                onClick={() => {
                  setDetail(null);
                  detailId.current = null;
                }}
              >
                <X size={22} />
              </button>
              <h2>{detail.name}</h2>
              <div className="detail-meta">
                <Badge status={detail.status} />
                <code>{detail.planId || detail.id}</code>
              </div>
            </div>
            <div className="drawer-actions">
              <Button onClick={() => download(`run-${detail.id}.json`, detail)}>
                <Download size={14} /> JSON
              </Button>
              {['queued', 'running'].includes(detail.status) ? (
                <Button
                  onClick={() =>
                    perform(async () => {
                      await api(`runs/${detail.id}/cancel`, {});
                    })
                  }
                >
                  <Square size={14} /> Takibi durdur
                </Button>
              ) : (
                <>
                  <Button
                    onClick={() =>
                      perform(async () => {
                        const r = await api(`runs/${detail.id}/retry`, {});
                        await openRun(r.id);
                      })
                    }
                  >
                    <RefreshCw size={14} /> Aynı anahtarla dene
                  </Button>
                  {detail.planId && !detail.remoteDeleted && (
                    <Button
                      onClick={() =>
                        perform(async () => {
                          await api(`runs/${detail.id}/resume`, {});
                        })
                      }
                    >
                      Yeniden sorgula
                    </Button>
                  )}
                </>
              )}
              {detail.planId && !detail.remoteDeleted && (
                <Button
                  onClick={() =>
                    setConfirm({
                      text: 'API’deki plan ve sonucu silinecek. Bu işlem motor hesaplamasını iptal etmez. Yerel test kaydı korunur.',
                      action: async () => {
                        await api(`runs/${detail.id}/remote`, undefined, 'DELETE');
                        setNotice('Plan API’den silindi.');
                      },
                    })
                  }
                >
                  <Trash2 size={14} /> API’den sil
                </Button>
              )}
            </div>
            <div className="tabs drawer-tabs">
              {[
                ['result', 'Sonuç'],
                ['checks', 'Kontroller'],
                ['http', 'HTTP günlüğü'],
                ['json', 'Ham veri'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={detailTab === id ? 'active' : ''}
                  onClick={() => setDetailTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="drawer-content">
              {detail.error && <div className="alert error">{detail.error}</div>}
              {detail.remoteDeleted && (
                <div className="alert info">Plan API’den silindi. Bu ekran yerel arşivdir.</div>
              )}
              {detailTab === 'result' && (
                <>
                  {detail.response?.summary ? (
                    <>
                      <div className="result-metrics">
                        {[
                          [
                            'Atanan',
                            `${detail.response.summary.jobs_assigned}/${detail.response.summary.jobs_total}`,
                          ],
                          ['Mesafe', num(detail.response.summary.distance_m / 1000) + ' km'],
                          ['Geciken', detail.response.summary.late_jobs],
                          ['Fazla mesai', num(detail.response.summary.overtime_min) + ' dk'],
                        ].map(([l, v]) => (
                          <div key={l}>
                            <span>{l}</span>
                            <strong>{v}</strong>
                          </div>
                        ))}
                      </div>
                      <RouteMap
                        request={(() => {
                          try {
                            return JSON.parse(detail.body);
                          } catch {
                            return {};
                          }
                        })()}
                        result={detail.response}
                      />
                      <Timeline routes={detail.response.routes} />
                      <div className="routes">
                        {detail.response.routes?.map((r: Json) => (
                          <div key={r.resource_id} className="route">
                            <div className="route-heading">
                              <h3>
                                <Users size={17} />
                                {r.resource_id}
                              </h3>
                              <span>
                                {clock(r.start_at)} – {clock(r.end_at)} · {num(r.distance_m / 1000)}{' '}
                                km
                              </span>
                            </div>
                            {r.stops.map((s: Json, i: number) => (
                              <div className="route-stop" key={s.job_id}>
                                <div className="stop-number">{i + 1}</div>
                                <div>
                                  <strong>{s.job_id}</strong>
                                  <small>
                                    Yol: {num(s.travel_min)} dk · {num(s.distance_m)} m
                                  </small>
                                </div>
                                <div className="stop-time">
                                  <strong>
                                    {clock(s.start_at)} – {clock(s.end_at)}
                                  </strong>
                                  <small>
                                    Varış {clock(s.arrival_at)}
                                    {s.late_min > 0 && <em> · {num(s.late_min)} dk gecikme</em>}
                                  </small>
                                </div>
                              </div>
                            ))}
                            {r.return && (
                              <div className="return-row">
                                Depoya dönüş · {clock(r.return.arrival_at)} ·{' '}
                                {num(r.return.distance_m)} m
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {detail.response.unassigned?.length > 0 && (
                        <div className="unassigned">
                          <h3>Atanamayan işler</h3>
                          {detail.response.unassigned.map((j: Json) => (
                            <div key={j.job_id}>
                              <strong>{j.job_id}</strong>
                              <span>{j.message}</span>
                              <code>{j.code}</code>
                            </div>
                          ))}
                        </div>
                      )}
                      <Button
                        primary
                        disabled={detail.checks?.some((c: Json) => !c.ok)}
                        onClick={() =>
                          perform(async () => {
                            await api(`runs/${detail.id}/apply`, {});
                            setNotice('Sonuç yerel müşteri atamalarına uygulandı.');
                          })
                        }
                      >
                        <Check size={16} /> Yerel atamalara uygula
                      </Button>
                      <p className="muted">
                        Bu işlem yalnız örnek müşterinin yerel kaydını günceller.
                      </p>
                    </>
                  ) : (
                    <div className="empty">
                      <Activity size={30} />
                      <h3>
                        {['queued', 'running'].includes(detail.status)
                          ? 'API sonucu bekleniyor'
                          : 'Plan sonucu yok'}
                      </h3>
                      <p>HTTP günlüğünden istek ve hata ayrıntılarını inceleyebilirsin.</p>
                      {detail.response?.error && <pre>{pretty(detail.response.error)}</pre>}
                    </div>
                  )}
                  <details>
                    <summary>Varsayılanlar ve uyarılar</summary>
                    <pre>
                      {pretty({
                        applied_defaults: detail.response?.applied_defaults,
                        warnings: detail.response?.warnings,
                        policy: detail.response?.policy,
                      })}
                    </pre>
                  </details>
                </>
              )}
              {detailTab === 'checks' && (
                <>
                  <div className="assessment-title">
                    <ShieldCheck size={20} />
                    <h3>
                      {detail.assessment
                        ? detail.assessment.ok === true
                          ? 'Test geçti'
                          : detail.assessment.ok === false
                            ? 'Test beklentileri karşılanmadı'
                            : 'Test atlandı'
                        : 'Sonuç tutarlılık kontrolleri'}
                    </h3>
                  </div>
                  {(detail.assessment?.checks || detail.checks || []).map((c: Json, i: number) => (
                    <div className="check-row" key={i}>
                      {c.ok ? (
                        <CheckCircle2 size={17} className="pass" />
                      ) : (
                        <XCircle size={17} className="fail" />
                      )}
                      <div>
                        {c.name}
                        {c.detail && <small>{c.detail}</small>}
                      </div>
                    </div>
                  ))}
                  {!(detail.checks?.length || detail.assessment?.checks?.length) && (
                    <p className="muted">Henüz değerlendirilecek tamamlanmış sonuç yok.</p>
                  )}
                </>
              )}
              {detailTab === 'http' && (
                <>
                  <div className="timing">
                    <span>
                      İlk yanıt <strong>{num(detail.firstResponseMs / 1000)} sn</strong>
                    </span>
                    <span>
                      Uçtan uca <strong>{num(detail.elapsedMs / 1000)} sn</strong>
                    </span>
                    <span>
                      HTTP çağrısı <strong>{detail.events.length}</strong>
                    </span>
                  </div>
                  <p className="muted">
                    Authorization başlığı kaydedilmez. İstek gövdesi “Ham veri” sekmesindedir.
                  </p>
                  {detail.events.map((e: Json, i: number) => (
                    <details className="http-event" key={i}>
                      <summary>
                        <span className="method">{e.method}</span>
                        <code>{e.path}</code>
                        <strong className={e.status >= 400 ? 'fail' : 'pass'}>
                          {e.status || 'Ağ hatası'}
                        </strong>
                        <span>{num(e.elapsedMs)} ms</span>
                      </summary>
                      <pre>{pretty(e)}</pre>
                    </details>
                  ))}
                </>
              )}
              {detailTab === 'json' && (
                <>
                  <h3>İstek · aynı baytlar tekrar gönderilir</h3>
                  <pre>{detail.body}</pre>
                  <h3>Idempotency-Key</h3>
                  <code className="block-code">{detail.idempotencyKey}</code>
                  <h3>API yanıtı</h3>
                  <pre>{pretty(detail.response || {})}</pre>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
      {confirm && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmation-title"
          >
            <h2 id="confirmation-title">İşlemi başlat</h2>
            <p>{confirm.text}</p>
            <div className="actions">
              <Button onClick={() => setConfirm(null)}>Vazgeç</Button>
              <Button
                primary
                onClick={() => {
                  const action = confirm.action;
                  setConfirm(null);
                  perform(action);
                }}
              >
                Devam et
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="metric">
      <div className="metric-top">
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}
function ExperimentSummary({ runs }: { runs: Json[] }) {
  const groups: Record<string, Json> = {};
  for (const r of runs.filter((r) => r.batchId && r.name.includes('sn /'))) {
    const key = r.batchId + '|' + r.name.split(' · ')[0];
    const g = (groups[key] ||= {
      name: r.name.split(' · ')[0],
      batch: r.batchId.slice(0, 8),
      total: 0,
      rows: [],
    });
    g.total++;
    if (r.status === 'completed') g.rows.push(r);
  }
  const avg = (rows: Json[], fn: (r: Json) => number) =>
    rows.length ? num(rows.reduce((s, r) => s + fn(r), 0) / rows.length) : '—';
  const p95 = (rows: Json[]) => {
    const v = rows.map((r) => r.elapsedMs / 1000).sort((a, b) => a - b);
    return v.length ? num(v[Math.ceil(v.length * 0.95) - 1]) : '—';
  };
  return (
    <section className="panel experiment-summary">
      <div className="panel-title">
        <div>
          <h2>Karşılaştırma tablosu</h2>
          <p>Yalnız tamamlanan koşuların ortalamaları; süre için p95 ayrıca gösterilir.</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Seçenek / paket</th>
              <th>Tamamlanan</th>
              <th>Atanan iş</th>
              <th>Mesafe km</th>
              <th>Geciken</th>
              <th>Fazla mesai dk</th>
              <th>Ort. süre sn</th>
              <th>p95 sn</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(groups).map(([key, g]) => (
              <tr key={key}>
                <td>
                  <strong>{g.name}</strong>
                  <small>{g.batch}</small>
                </td>
                <td>
                  {g.rows.length}/{g.total}
                </td>
                <td>{avg(g.rows, (r) => r.summary?.jobs_assigned || 0)}</td>
                <td>{avg(g.rows, (r) => (r.summary?.distance_m || 0) / 1000)}</td>
                <td>{avg(g.rows, (r) => r.summary?.late_jobs || 0)}</td>
                <td>{avg(g.rows, (r) => r.summary?.overtime_min || 0)}</td>
                <td>{avg(g.rows, (r) => r.elapsedMs / 1000)}</td>
                <td>{p95(g.rows)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!Object.keys(groups).length && (
          <div className="empty compact">İlk deneyden sonra karşılaştırmalar burada görünecek.</div>
        )}
      </div>
    </section>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
