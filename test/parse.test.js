import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { readSheetRows, parseRows } from '../src/lib/parse.js';

const hrmoRows = () => readSheetRows(fs.readFileSync('sample_data/HRMO (3).xls'));
const find = (records, acNo, date, session) =>
  records.find((r) => r.acNo === acNo && r.date === date && r.session === session);

describe('parseRows night shift (US-13)', () => {
  const night = () => parseRows(readSheetRows(fs.readFileSync('sample_data/NIGHT_shift.xls')));

  it('places rows by On duty, so all 30 night rows import', () => {
    const { records, skipped } = night();
    expect(records).toHaveLength(30);
    expect(skipped).toBe(0);
    // night guard 1 (17:00-23:59) goes to P.M., night guard 2 (01:00-06:00) to A.M.
    expect(find(records, '479', '2026-09-02', 'PM')).toMatchObject({ onDuty: '17:00', offDuty: '23:59', in: '17:12', out: '' });
    expect(find(records, '479', '2026-09-03', 'AM')).toMatchObject({ onDuty: '01:00', offDuty: '06:00', in: '', out: '06:01' });
  });

  it('skips a second row for the same day and session instead of overwriting the first', () => {
    // A third timetable (e.g. overtime 18:00-22:00) would land in P.M. too. The Afternoon row is kept.
    const rows = hrmoRows();
    rows.push(['14', 'RELITA BARAYA', '7/01/2026', 'Overtime', '18:00', '22:00', '18:05', '21:58', '', '', '']);
    const { records, skipped } = parseRows(rows);
    expect(records).toHaveLength(154);
    expect(skipped).toBe(1);
    expect(find(records, '14', '2026-07-01', 'PM')).toMatchObject({ onDuty: '13:00' });
  });

  it('HRMO Morning and Afternoon rows keep their sessions', () => {
    const { records } = parseRows(hrmoRows());
    expect(records.filter((r) => r.session === 'AM').every((r) => r.onDuty === '08:00')).toBe(true);
    expect(records.filter((r) => r.session === 'PM').every((r) => r.onDuty === '13:00')).toBe(true);
    expect(records.filter((r) => r.session === 'AM')).toHaveLength(77);
  });
});

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
