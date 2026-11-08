import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSheetRows, parseRows } from '../src/lib/parse.js';
import { emptyData, resolveOffice, mergeImport, loadData, saveData, updateOffice, setHoliday, deleteHoliday } from '../src/lib/store.js';
import { HOLIDAY_TYPES } from '../src/lib/dtr.js';

const hrmo = () => parseRows(readSheetRows(fs.readFileSync('sample_data/HRMO (3).xls'))).records;
const made = [];
const tmpDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dtr-'));
  made.push(dir);
  return dir;
};
afterAll(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe('mergeImport', () => {
  it('adds then updates without duplicates', () => {
    const data = emptyData();
    expect(mergeImport(data, 'HRMO', hrmo())).toEqual({ added: 154, updated: 0 });
    expect(mergeImport(data, 'HRMO', hrmo())).toEqual({ added: 0, updated: 154 });
    expect(Object.keys(data.punches)).toHaveLength(154);
    expect(Object.keys(data.employees)).toHaveLength(11);
    expect(data.offices.HRMO).toEqual({ name: 'HRMO', graceMinutes: 15 });
    expect(data.punches['HRMO|14|2026-07-01|AM']).toMatchObject({ office: 'HRMO', in: '07:58' });
  });

  it('latest import name wins', () => {
    const data = emptyData();
    mergeImport(data, 'HRMO', hrmo());
    const renamed = hrmo().filter((r) => r.acNo === '14').map((r) => ({ ...r, name: 'RELITA B. BARAYA' }));
    mergeImport(data, 'HRMO', renamed);
    expect(data.employees['HRMO|14'].name).toBe('RELITA B. BARAYA');
  });

  it('keeps an office grace setting on re-import', () => {
    const data = emptyData();
    mergeImport(data, 'HRMO', hrmo());
    data.offices.HRMO.graceMinutes = 0;
    mergeImport(data, 'HRMO', hrmo());
    expect(data.offices.HRMO.graceMinutes).toBe(0);
  });
});

describe('resolveOffice', () => {
  it('trims and matches existing office case-insensitively', () => {
    const data = emptyData();
    mergeImport(data, 'HRMO', hrmo());
    expect(resolveOffice(data, ' hrmo ')).toBe('HRMO');
    expect(resolveOffice(data, ' Accounting ')).toBe('Accounting');
    expect(() => resolveOffice(data, '   ')).toThrow();
  });

  it('rejects | in office names (it separates record keys)', () => {
    expect(() => resolveOffice(emptyData(), 'HR|1')).toThrow(/\|/);
  });
});

describe('office names that clash with object internals', () => {
  it('stores __proto__ and constructor as normal offices', () => {
    const data = emptyData();
    const records = hrmo().slice(0, 2);
    mergeImport(data, '__proto__', records);
    mergeImport(data, 'constructor', records);
    expect(Object.keys(data.offices).sort()).toEqual(['__proto__', 'constructor']);
    expect(data.offices.constructor).toEqual({ name: 'constructor', graceMinutes: 15 });
    expect(JSON.parse(JSON.stringify(data)).offices.__proto__).toEqual({ name: '__proto__', graceMinutes: 15 });
  });
});

describe('loadData / saveData', () => {
  it('returns empty data when no file exists', () => {
    expect(loadData(tmpDir())).toEqual(emptyData());
  });

  it('round-trips and leaves no temp file', () => {
    const dir = tmpDir();
    const data = emptyData();
    mergeImport(data, 'HRMO', hrmo());
    saveData(dir, data);
    expect(loadData(dir)).toEqual(data);
    expect(fs.readdirSync(dir)).toEqual(['dtr-data.json']);
  });

  it('throws on a corrupt file and does not touch it', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'dtr-data.json');
    fs.writeFileSync(file, '{bad');
    expect(() => loadData(dir)).toThrow();
    expect(fs.readFileSync(file, 'utf8')).toBe('{bad');
  });
});

describe('updateOffice', () => {
  const withHrmo = () => {
    const data = emptyData();
    mergeImport(data, 'HRMO', hrmo().slice(0, 2));
    return data;
  };

  it('saves trimmed in-charge and numeric grace', () => {
    const data = withHrmo();
    updateOffice(data, 'HRMO', { inCharge: '  MARIVIC P. SARINAS ', graceMinutes: '0' });
    expect(data.offices.HRMO).toEqual({ name: 'HRMO', graceMinutes: 0, inCharge: 'MARIVIC P. SARINAS' });
  });

  it.each([-1, 61, 'abc', 1.5, '', '0x10', '1e1', true, ' 5 x'])('rejects grace %s and leaves data unchanged', (grace) => {
    const data = withHrmo();
    expect(() => updateOffice(data, 'HRMO', { inCharge: 'X', graceMinutes: grace })).toThrow(/whole number from 0 to 60/);
    expect(data.offices.HRMO).toEqual({ name: 'HRMO', graceMinutes: 15 });
  });

  it('updates an office named __proto__ as a plain key', () => {
    const data = emptyData();
    mergeImport(data, '__proto__', hrmo().slice(0, 2));
    updateOffice(data, '__proto__', { inCharge: 'X', graceMinutes: 5 });
    expect(Object.getPrototypeOf(data.offices)).toBe(Object.prototype);
    expect(JSON.parse(JSON.stringify(data.offices)).__proto__).toEqual({ name: '__proto__', graceMinutes: 5, inCharge: 'X' });
  });

  it('accepts a padded whole number string', () => {
    const data = withHrmo();
    updateOffice(data, 'HRMO', { inCharge: '', graceMinutes: ' 5 ' });
    expect(data.offices.HRMO.graceMinutes).toBe(5);
  });

  it('rejects a too-long in-charge name', () => {
    expect(() => updateOffice(withHrmo(), 'HRMO', { inCharge: 'A'.repeat(101), graceMinutes: 15 })).toThrow(/too long/);
  });

  it('rejects an unknown office, including inherited names', () => {
    expect(() => updateOffice(withHrmo(), 'Accounting', { inCharge: '', graceMinutes: 15 })).toThrow(/Unknown office/);
    expect(() => updateOffice(withHrmo(), 'constructor', { inCharge: '', graceMinutes: 15 })).toThrow(/Unknown office/);
  });
});

describe('holidays', () => {
  const reg = { date: '2026-07-03', name: ' Test Holiday ', type: 'Regular Holiday' };

  it('lists the four types', () => {
    expect(HOLIDAY_TYPES).toEqual(['Regular Holiday', 'Special Non-Working Holiday', 'Local Holiday', 'Work Suspension']);
  });

  it('adds to data without a holidays map (older files)', () => {
    const data = emptyData();
    delete data.holidays;
    setHoliday(data, reg);
    expect(data.holidays).toEqual({ '2026-07-03': { date: '2026-07-03', name: 'Test Holiday', type: 'Regular Holiday' } });
  });

  it('rejects a second holiday on the same date', () => {
    const data = emptyData();
    setHoliday(data, reg);
    expect(() => setHoliday(data, { ...reg, name: 'Other' })).toThrow('A holiday already exists on 2026-07-03');
    expect(data.holidays['2026-07-03'].name).toBe('Test Holiday');
  });

  it('edits in place and moves to a new date', () => {
    const data = emptyData();
    setHoliday(data, reg);
    setHoliday(data, { ...reg, type: 'Local Holiday' }, '2026-07-03');
    expect(data.holidays['2026-07-03'].type).toBe('Local Holiday');
    setHoliday(data, { ...reg, date: '2026-07-06' }, '2026-07-03');
    expect(Object.keys(data.holidays)).toEqual(['2026-07-06']);
  });

  it('rejects moving onto another holiday and leaves both unchanged', () => {
    const data = emptyData();
    setHoliday(data, reg);
    setHoliday(data, { ...reg, date: '2026-07-06', name: 'B' });
    expect(() => setHoliday(data, { ...reg, date: '2026-07-06' }, '2026-07-03')).toThrow(/already exists on 2026-07-06/);
    expect(Object.keys(data.holidays).sort()).toEqual(['2026-07-03', '2026-07-06']);
  });

  it.each([
    [{ ...reg, date: '2026-02-30' }, /Invalid date/],
    [{ ...reg, date: '7/03/2026' }, /Invalid date/],
    [{ ...reg, name: '   ' }, /name/i],
    [{ ...reg, name: 'A'.repeat(101) }, /name/i],
    [{ ...reg, type: 'Birthday' }, /type/i],
  ])('rejects invalid input %#', (h, err) => {
    const data = emptyData();
    expect(() => setHoliday(data, h)).toThrow(err);
    expect(data.holidays).toEqual({});
  });

  it('rejects deleting a date with no holiday', () => {
    expect(() => deleteHoliday(emptyData(), '2026-07-03')).toThrow('No holiday on 2026-07-03');
  });

  it('deletes', () => {
    const data = emptyData();
    setHoliday(data, reg);
    deleteHoliday(data, '2026-07-03');
    expect(data.holidays).toEqual({});
  });
});
