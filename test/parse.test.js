import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { readSheetRows, parseRows } from '../src/lib/parse.js';

const hrmoRows = () => readSheetRows(fs.readFileSync('sample_data/HRMO (3).xls'));
const find = (records, acNo, date, session) =>
  records.find((r) => r.acNo === acNo && r.date === date && r.session === session);

describe('parseRows', () => {
  it('parses HRMO (3).xls', () => {
    const { records, skipped } = parseRows(hrmoRows());
    expect(records).toHaveLength(154);
    expect(skipped).toBe(0);
    expect(new Set(records.map((r) => r.acNo)).size).toBe(11);
    expect(find(records, '14', '2026-07-01', 'AM')).toEqual({
      acNo: '14', name: 'RELITA BARAYA', date: '2026-07-01', session: 'AM',
      onDuty: '08:00', offDuty: '12:00', in: '07:58', out: '12:01',
    });
  });

  it('missing punch is empty string', () => {
    const { records } = parseRows(hrmoRows());
    const r = find(records, '14', '2026-07-03', 'PM');
    expect(r.in).toBe('');
    expect(r.out).toBe('17:00');
  });

  it('throws on missing columns', () => {
    const rows = hrmoRows();
    const i = rows[0].indexOf('Clock Out');
    const cut = rows.map((r) => r.filter((_, j) => j !== i));
    expect(() => parseRows(cut)).toThrow(/Missing columns: Clock Out/);
  });

  it('skips rows with invalid date or time', () => {
    const rows = hrmoRows();
    rows.push(['1', 'X', '13/45/2026', 'Morning', '08:00', '12:00', '', '', '', '', '']);
    rows.push(['1', 'X', '7/01/2026', 'Morning', '08:00', '12:00', '25:99', '', '', '', '']);
    const { records, skipped } = parseRows(rows);
    expect(skipped).toBe(2);
    expect(records).toHaveLength(154);
  });

  it('accepts real Excel date and time cells in an .xlsx', () => {
    const header = hrmoRows()[0];
    const ws = XLSX.utils.aoa_to_sheet([header,
      ['5', 'Y', new Date(2026, 6, 1), 'Morning', '08:00', '12:00', '8:05 AM', '12:00 PM', '', '', '']], { cellDates: true });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const rows = readSheetRows(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    const { records, skipped } = parseRows(rows);
    expect(skipped).toBe(0);
    expect(records[0]).toMatchObject({ date: '2026-07-01', in: '08:05', out: '12:00' });
  });

  it('converts 12h AM/PM times and 2-digit years', () => {
    const rows = [hrmoRows()[0], ['1', 'X', '7/1/26', 'Afternoon', '13:00', '17:00', '1:05 PM', '12:30 AM', '', '', '']];
    expect(parseRows(rows).records[0]).toMatchObject({ date: '2026-07-01', in: '13:05', out: '00:30' });
  });

  it('accepts ISO dates and unpadded times', () => {
    const rows = [hrmoRows()[0], ['1', 'X', '2026-07-01', 'Afternoon', '13:00', '17:00', '1:05', '17:00', '', '', '']];
    const { records } = parseRows(rows);
    expect(records[0]).toMatchObject({ date: '2026-07-01', session: 'PM', in: '01:05' });
  });
});
