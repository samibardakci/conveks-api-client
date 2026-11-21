export type Json = Record<string, any>;
export async function api(
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<any> {
  const response = await fetch('/api/' + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Conveks-Client': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
export function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], {
      type: typeof data === 'string' ? 'text/csv;charset=utf-8' : 'application/json',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const pretty = (value: unknown) => JSON.stringify(value, null, 2);
export const num = (value: unknown, digits = 1) =>
  Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: digits });
export const clock = (value?: string) => (value ? value.slice(11, 19) : '—');
export const stateLabel: Record<string, string> = {
  queued: 'Sırada',
  running: 'Çalışıyor',
  completed: 'Tamamlandı',
  failed: 'Motor hatası',
  timed_out: 'Zaman aşımı',
  rejected: 'API reddetti',
  error: 'İstemci hatası',
  cancelled: 'Takip durdu',
  interrupted: 'Kesildi',
  skipped: 'Atlandı',
};
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('CSV tırnakları kapanmamış');
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  const headings = rows.shift()?.map((x) => x.replace(/^\uFEFF/, '').trim()) || [];
  if (new Set(headings).size !== headings.length)
    throw new Error('CSV sütun adları benzersiz olmalı');
  return rows.map((r, i) => {
    if (r.length !== headings.length) throw new Error(`CSV satır ${i + 2}: sütun sayısı farklı`);
    return Object.fromEntries(headings.map((h, j) => [h, r[j]]));
  });
}
export function importRows(text: string, kind: 'jobs' | 'resources') {
  const rows = parseCsv(text),
    numeric = (r: Record<string, string>, name: string) => {
      if (r[name] === undefined || r[name].trim() === '' || !Number.isFinite(Number(r[name])))
        throw new Error(`${name} geçerli sayı olmalı`);
      return Number(r[name]);
    };
  return rows.map((r) => {
    if (!r.id) throw new Error('id sütunu gerekli');
    const skills = (r.skills || '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    if (kind === 'resources') {
      if (!r.shift_start || !r.shift_end) throw new Error('shift_start ve shift_end gerekli');
      return {
        id: r.id,
        skills,
        shift: { start: r.shift_start, end: r.shift_end },
        ...(r.lat || r.lon ? { start: { lat: numeric(r, 'lat'), lon: numeric(r, 'lon') } } : {}),
      };
    }
    if (r.urgent && !['true', 'false'].includes(r.urgent))
      throw new Error('urgent true veya false olmalı');
    return {
      id: r.id,
      skills,
      location: { lat: numeric(r, 'lat'), lon: numeric(r, 'lon') },
      duration_min: numeric(r, 'duration_min'),
      ...(r.priority ? { priority: numeric(r, 'priority') } : {}),
      ...(r.due ? { due: r.due } : {}),
      urgent: r.urgent === 'true',
    };
  });
}
export function toCsv(rows: Json[]) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const escape = (value: unknown) =>
    '"' +
    String(value ?? '')
      .replace(/"/g, '""')
      .replace(/^([=+@\-])/, "'$1") +
    '"';
  return [
    keys.map(escape).join(','),
    ...rows.map((r) => keys.map((k) => escape(r[k])).join(',')),
  ].join('\n');
}
