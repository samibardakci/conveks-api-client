import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, importRows, toCsv } from '../web/lib.ts';
test('CSV supports quoted delimiters, escaped quotes, BOM and CRLF', () => {
  const rows = parseCsv('\ufeffid,description\r\n1,"a,b"\r\n2,"say ""hi"""\r\n');
  assert.deepEqual(rows, [
    { id: '1', description: 'a,b' },
    { id: '2', description: 'say "hi"' },
  ]);
  assert.throws(() => parseCsv('id,x\n1'), /sütun sayısı/);
  assert.throws(() => parseCsv('id,x\n1,"x'), /tırnakları/);
});
test('CSV mapping preserves units, skills, and explicit false urgency', () => {
  const rows = importRows(
    'id,lat,lon,duration_min,skills,urgent,priority\nA,38.4,27.1,30,electric|repair,false,0',
    'jobs',
  );
  assert.equal(rows[0].priority, 0);
  assert.equal(rows[0].urgent, false);
  assert.deepEqual(rows[0].skills, ['electric', 'repair']);
  assert.throws(() => importRows('id,lat,lon,duration_min\nA,,27.1,30', 'jobs'), /lat/);
});
test('CSV report export quotes cells and neutralizes formulas', () => {
  const csv = toCsv([{ id: '=HYPERLINK("x")', name: 'a,b' }]);
  assert.ok(csv.includes("'=HYPERLINK"));
  const parsed = parseCsv(csv);
  assert.equal(parsed[0].name, 'a,b');
});
