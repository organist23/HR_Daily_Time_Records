import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSheetRows, parseRows } from '../src/lib/parse.js';
import { emptyData, migrateGrace, resolveOffice, mergeImport, loadData, saveData, updateOffice, setHoliday, deleteHoliday, adjustDay, revertDay, setArchived, deleteEmployee, deleteOffice, makeBackup, readBackup } from '../src/lib/store.js';
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
    expect(data.offices.HRMO).toEqual({ name: 'HRMO', graceMinutes: 0 });
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
    data.offices.HRMO.graceMinutes = 10;
    mergeImport(data, 'HRMO', hrmo());
    expect(data.offices.HRMO.graceMinutes).toBe(10);
  });
});

describe('migrateGrace (grace default 0, US-5 changed 2026-11-10)', () => {
  const v1 = () => ({
    ...emptyData(),
    version: 1,
    offices: {
      HRMO: { name: 'HRMO', graceMinutes: 15, inCharge: 'MARIVIC P. SARINAS' },
      ACCT: { name: 'ACCT', graceMinutes: 10, archived: true },
    },
  });

  it('sets every office of version 1 data to grace 0 and marks it version 2', () => {
    const data = v1();
    expect(migrateGrace(data)).toBe(true);
    expect(data.version).toBe(2);
    expect(data.offices).toEqual({
      HRMO: { name: 'HRMO', graceMinutes: 0, inCharge: 'MARIVIC P. SARINAS' },
      ACCT: { name: 'ACCT', graceMinutes: 0, archived: true },
    });
  });

  it('leaves version 2 data alone, so a grace the admin set later stays', () => {
    const data = { ...v1(), version: 2 };
    expect(migrateGrace(data)).toBe(false);
    expect(data.offices.HRMO.graceMinutes).toBe(15);
    expect(data.offices.ACCT.graceMinutes).toBe(10);
  });

  it('new data starts at version 2', () => {
    expect(emptyData().version).toBe(2);
    expect(migrateGrace(emptyData())).toBe(false);
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
    expect(data.offices.constructor).toEqual({ name: 'constructor', graceMinutes: 0 });
    expect(JSON.parse(JSON.stringify(data)).offices.__proto__).toEqual({ name: '__proto__', graceMinutes: 0 });
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
    expect(data.offices.HRMO).toEqual({ name: 'HRMO', graceMinutes: 0 });
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

describe('time adjustments', () => {
  const AT = '2026-11-09T02:00:00.000Z';
  const ronie = () => {
    const data = emptyData();
    mergeImport(data, 'HRMO', hrmo());
    return data;
  };
  // RONIE (568) 7/01 device: AM 08:00 in only, PM absent.
  const wfh = {
    office: 'HRMO', acNo: '568', date: '2026-07-01',
    am: { in: '08:00', out: '12:00' }, pm: { in: '13:00', out: '17:00' }, reason: ' Work from home ',
  };

  it('stores changed sessions and keeps the device punch', () => {
    const data = ronie();
    adjustDay(data, wfh, AT);
    expect(data.adjustments['HRMO|568|2026-07-01|AM']).toEqual({ in: '08:00', out: '12:00', onDuty: '08:00', offDuty: '12:00', reason: 'Work from home', at: AT });
    expect(data.adjustments['HRMO|568|2026-07-01|PM']).toEqual({ in: '13:00', out: '17:00', onDuty: '13:00', offDuty: '17:00', reason: 'Work from home', at: AT });
    expect(data.punches['HRMO|568|2026-07-01|AM']).toMatchObject({ in: '08:00', out: '' });
  });

  it('stores nothing when values equal the device, and removes an existing adjustment', () => {
    const data = ronie();
    const same = { ...wfh, am: { in: '08:00', out: '' }, pm: { in: '', out: '' }, reason: '' };
    adjustDay(data, same, AT);
    expect(data.adjustments ?? {}).toEqual({});
    adjustDay(data, wfh, AT);
    adjustDay(data, { ...same, am: { in: '08:00', out: '12:00' }, reason: 'fix' }, AT); // PM back to device
    expect(Object.keys(data.adjustments)).toEqual(['HRMO|568|2026-07-01|AM']);
  });

  it.each([
    [{ am: { in: '25:00', out: '12:00' } }, /Invalid time: 25:00/],
    [{ am: { in: '8:00', out: '12:00' } }, /Invalid time: 8:00/],
    [{ am: { in: '12:00', out: '08:00' } }, /A.M. departure must be later than arrival/],
    [{ pm: { in: '13:00', out: '13:00' } }, /P.M. departure must be later than arrival/],
    [{ reason: '  ' }, /Reason is required/],
    [{ date: '2026-02-30' }, /Invalid date/],
    [{ acNo: '999' }, /Unknown employee/],
  ])('rejects bad input %#', (patch, err) => {
    const data = ronie();
    expect(() => adjustDay(data, { ...wfh, ...patch }, AT)).toThrow(err);
    expect(data.adjustments ?? {}).toEqual({});
  });

  it('keeps the reason and time of a session that was not changed', () => {
    const data = ronie();
    adjustDay(data, wfh, AT);
    const later = '2026-11-10T02:00:00.000Z';
    adjustDay(data, { ...wfh, pm: { in: '13:00', out: '16:00' }, reason: 'Left early, approved' }, later);
    expect(data.adjustments['HRMO|568|2026-07-01|AM']).toMatchObject({ reason: 'Work from home', at: AT });
    expect(data.adjustments['HRMO|568|2026-07-01|PM']).toMatchObject({ out: '16:00', reason: 'Left early, approved', at: later });
  });

  it('rejects an A.M. departure later than the P.M. arrival', () => {
    const data = ronie();
    expect(() => adjustDay(data, { ...wfh, am: { in: '08:00', out: '14:00' } }, AT)).toThrow('A.M. departure must not be later than P.M. arrival');
  });

  it('rejects non-string times', () => {
    const data = ronie();
    expect(() => adjustDay(data, { ...wfh, am: { in: ['08:00'], out: '12:00' } }, AT)).toThrow(/Invalid time/);
  });

  it('uses the nearest dated punch for official hours', () => {
    const data = emptyData();
    const p = (date, onDuty, offDuty) => ({ acNo: '1', name: 'X', date, session: 'AM', onDuty, offDuty, in: onDuty, out: offDuty });
    mergeImport(data, 'HR', [p('2026-01-05', '07:30', '11:30'), p('2026-07-06', '08:00', '12:00')]);
    adjustDay(data, { office: 'HR', acNo: '1', date: '2026-07-13', am: { in: '08:00', out: '12:00' }, pm: {}, reason: 'WFH' }, AT);
    expect(data.adjustments['HR|1|2026-07-13|AM']).toMatchObject({ onDuty: '08:00', offDuty: '12:00' });
  });

  it('takes official hours from other punches for a day with no device rows', () => {
    const data = ronie();
    adjustDay(data, { ...wfh, date: '2026-07-13' }, AT);
    expect(data.adjustments['HRMO|568|2026-07-13|PM']).toMatchObject({ onDuty: '13:00', offDuty: '17:00' });
  });

  it('survives a re-import', () => {
    const data = ronie();
    adjustDay(data, wfh, AT);
    mergeImport(data, 'HRMO', hrmo());
    expect(Object.keys(data.adjustments)).toHaveLength(2);
  });

  it.each(['2026-07-04', '2026-07-05'])('refuses a weekend (%s)', (date) => {
    const data = ronie();
    expect(() => adjustDay(data, { ...wfh, date }, AT)).toThrow(`${date} is a non-working day`);
    expect(data.adjustments ?? {}).toEqual({});
  });

  // US-7 Changed 2026-11-10: a guard's night-shift rows can be adjusted on weekends and holidays.
  it('allows a weekend or holiday night-shift row', () => {
    const data = emptyData();
    mergeImport(data, 'GUARD', parseRows(readSheetRows(fs.readFileSync('sample_data/NIGHT_shift.xls'))).records);
    const g = { office: 'GUARD', acNo: '479', reason: 'Forgot to punch' };
    // Sat 9/05: A.M. end of the 9/04 shift. Sun 9/06: P.M. start of a shift.
    adjustDay(data, { ...g, date: '2026-09-05', am: { in: '', out: '06:30' }, pm: { in: '', out: '' } }, AT);
    adjustDay(data, { ...g, date: '2026-09-06', am: { in: '', out: '' }, pm: { in: '17:00', out: '' } }, AT);
    setHoliday(data, { date: '2026-09-08', name: 'X', type: 'Regular Holiday' });
    adjustDay(data, { ...g, date: '2026-09-08', am: { in: '', out: '' }, pm: { in: '17:00', out: '' } }, AT);
    expect(Object.keys(data.adjustments).sort()).toEqual(['GUARD|479|2026-09-05|AM', 'GUARD|479|2026-09-06|PM', 'GUARD|479|2026-09-08|PM']);
  });

  it('sees a night start added by an adjustment (review)', () => {
    const data = emptyData();
    mergeImport(data, 'GUARD', parseRows(readSheetRows(fs.readFileSync('sample_data/NIGHT_shift.xls'))).records);
    const g = { office: 'GUARD', acNo: '479', reason: 'Logbook' };
    // Fri 9/18 has no device rows. Its P.M. takes the nearest P.M. hours (17:00-23:59), so Sat 9/19 ends a night shift.
    adjustDay(data, { ...g, date: '2026-09-18', am: {}, pm: { in: '17:00', out: '' } }, AT);
    expect(data.adjustments['GUARD|479|2026-09-18|PM']).toMatchObject({ offDuty: '23:59' });
    adjustDay(data, { ...g, date: '2026-09-19', am: { in: '', out: '06:00' }, pm: {} }, AT);
    expect(data.adjustments['GUARD|479|2026-09-19|AM']).toMatchObject({ out: '06:00' });
  });

  it('refuses a holiday, and still reverts an adjustment made before the holiday', () => {
    const data = ronie();
    adjustDay(data, wfh, AT);
    setHoliday(data, { date: '2026-07-01', name: 'X', type: 'Local Holiday' });
    expect(() => adjustDay(data, { ...wfh, pm: { in: '13:00', out: '16:00' } }, AT)).toThrow('2026-07-01 is a non-working day');
    expect(data.adjustments['HRMO|568|2026-07-01|PM']).toMatchObject({ out: '17:00' });
    revertDay(data, { office: 'HRMO', acNo: '568', date: '2026-07-01' });
    expect(data.adjustments).toEqual({});
  });

  it('reverts a day, and refuses when nothing is adjusted', () => {
    const data = ronie();
    adjustDay(data, wfh, AT);
    revertDay(data, { office: 'HRMO', acNo: '568', date: '2026-07-01' });
    expect(data.adjustments).toEqual({});
    expect(() => revertDay(data, { office: 'HRMO', acNo: '568', date: '2026-07-01' })).toThrow('No adjustment on 2026-07-01');
  });
});

describe('archive and delete', () => {
  const AT = '2026-11-09T02:00:00.000Z';
  const twoOffices = () => {
    const data = emptyData();
    mergeImport(data, 'HRMO', hrmo());
    mergeImport(data, 'HR', hrmo().filter((r) => r.acNo === '14'));
    // AC 140 in HRMO shares the "14" prefix without the separator.
    mergeImport(data, 'HRMO', hrmo().filter((r) => r.acNo === '14').map((r) => ({ ...r, acNo: '140', name: 'X' })));
    adjustDay(data, { office: 'HRMO', acNo: '14', date: '2026-07-01', am: { in: '08:00', out: '12:00' }, pm: {}, reason: 'WFH' }, AT);
    adjustDay(data, { office: 'HR', acNo: '14', date: '2026-07-01', am: { in: '08:00', out: '12:00' }, pm: {}, reason: 'WFH' }, AT);
    setHoliday(data, { date: '2026-07-03', name: 'X', type: 'Regular Holiday' });
    return data;
  };
  const count = (obj, prefix) => Object.keys(obj).filter((k) => k.startsWith(prefix)).length;

  it('archives and restores an employee and an office', () => {
    const data = twoOffices();
    setArchived(data, { office: 'HRMO', acNo: '2025204', archived: true });
    expect(data.employees['HRMO|2025204'].archived).toBe(true);
    setArchived(data, { office: 'HRMO', acNo: '2025204', archived: false });
    expect(data.employees['HRMO|2025204'].archived).toBeUndefined();
    setArchived(data, { office: 'HR', archived: true });
    expect(data.offices.HR).toMatchObject({ name: 'HR', archived: true });
    setArchived(data, { office: 'HR', archived: false });
    expect(data.offices.HR.archived).toBeUndefined();
  });

  it('rejects unknown records', () => {
    const data = twoOffices();
    expect(() => setArchived(data, { office: 'HRMO', acNo: '999', archived: true })).toThrow('Unknown employee');
    expect(() => setArchived(data, { office: 'NOPE', archived: true })).toThrow('Unknown office: NOPE');
    expect(() => deleteEmployee(data, { office: 'HRMO', acNo: '999' })).toThrow('Unknown employee');
    expect(() => deleteOffice(data, 'NOPE')).toThrow('Unknown office: NOPE');
  });

  it('a re-import keeps the archive', () => {
    const data = twoOffices();
    setArchived(data, { office: 'HRMO', acNo: '2025204', archived: true });
    setArchived(data, { office: 'HR', archived: true });
    mergeImport(data, 'HRMO', hrmo());
    mergeImport(data, 'HR', hrmo().filter((r) => r.acNo === '14'));
    expect(data.employees['HRMO|2025204'].archived).toBe(true);
    expect(data.offices.HR.archived).toBe(true);
  });

  it('deletes an employee with their punches and adjustments only', () => {
    const data = twoOffices();
    deleteEmployee(data, { office: 'HRMO', acNo: '14' });
    expect(data.employees['HRMO|14']).toBeUndefined();
    expect(count(data.punches, 'HRMO|14|')).toBe(0);
    expect(count(data.adjustments, 'HRMO|14|')).toBe(0);
    expect(count(data.punches, 'HRMO|140|')).toBe(14);
    expect(count(data.punches, 'HR|14|')).toBe(14);
    expect(count(data.adjustments, 'HR|14|')).toBe(2); // AM set + PM cleared (device PM exists)
  });

  it('an AC-No containing | does not take another employee\'s punches', () => {
    const data = twoOffices();
    mergeImport(data, 'HRMO', hrmo().filter((r) => r.acNo === '14').map((r) => ({ ...r, acNo: '14|2', name: 'Y' })));
    deleteEmployee(data, { office: 'HRMO', acNo: '14' });
    expect(count(data.punches, 'HRMO|14|2|')).toBe(14);
    expect(data.employees['HRMO|14|2']).toBeDefined();
  });

  it('deletes an office with its employees, punches, adjustments, and settings, keeping holidays', () => {
    const data = twoOffices();
    deleteOffice(data, 'HR');
    expect(data.offices.HR).toBeUndefined();
    expect(count(data.employees, 'HR|')).toBe(0);
    expect(count(data.punches, 'HR|')).toBe(0);
    expect(count(data.adjustments, 'HR|')).toBe(0);
    expect(count(data.employees, 'HRMO|')).toBe(12);
    expect(count(data.punches, 'HRMO|')).toBe(168);
    expect(count(data.adjustments, 'HRMO|')).toBe(2);
    expect(Object.keys(data.holidays)).toEqual(['2026-07-03']);
  });
});

describe('backup and restore', () => {
  const SAVED = '2026-11-09T12:00:00.000Z';
  const full = () => {
    const data = emptyData();
    mergeImport(data, 'HRMO', hrmo());
    setHoliday(data, { date: '2026-07-03', name: 'Test Holiday', type: 'Regular Holiday' });
    adjustDay(data, { office: 'HRMO', acNo: '568', date: '2026-07-01', am: { in: '08:00', out: '12:00' }, pm: { in: '13:00', out: '17:00' }, reason: 'WFH' }, SAVED);
    setArchived(data, { office: 'HRMO', acNo: '2025204', archived: true });
    updateOffice(data, 'HRMO', { inCharge: 'JUAN DELA CRUZ', graceMinutes: 10 });
    return data;
  };
  // Edits one part of a valid backup, to check each rule on otherwise good data.
  const broken = (edit) => {
    const file = JSON.parse(makeBackup(full(), SAVED));
    edit(file, file.data);
    return JSON.stringify(file);
  };

  it('round-trips everything', () => {
    const data = full();
    const back = readBackup(makeBackup(data, SAVED));
    expect(back.savedAt).toBe(SAVED);
    expect(back.data).toEqual(data);
    expect(Object.keys(back.data.punches)).toHaveLength(154);
    expect(Object.keys(back.data.adjustments)).toHaveLength(2);
    expect(back.data.employees['HRMO|2025204'].archived).toBe(true);
    expect(back.data.offices.HRMO).toMatchObject({ inCharge: 'JUAN DELA CRUZ', graceMinutes: 10 });
    expect(JSON.parse(makeBackup(data, SAVED)).data.version).toBe(2);
  });

  it('restores a backup made before grace default 0 with every office at grace 0', () => {
    const text = broken((f, d) => { d.version = 1; d.offices.HRMO.graceMinutes = 15; });
    const back = readBackup(text);
    expect(back.data.version).toBe(2);
    expect(back.data.offices.HRMO).toEqual({ name: 'HRMO', graceMinutes: 0, inCharge: 'JUAN DELA CRUZ' });
  });

  it.each([
    ['not JSON', () => '{"format":', /Invalid backup: not a JSON file/],
    ['another JSON file', () => JSON.stringify({ hello: 1 }), /Invalid backup: not a DTR Analyzer backup/],
    ['wrong version', () => broken((f) => { f.version = 2; }), /Invalid backup: unsupported version/],
    ['an unknown data version', () => broken((f, d) => { d.version = 3; }), /Invalid backup: unsupported version/],
    ['a map is not an object', () => broken((f, d) => { d.punches = []; }), /Invalid backup: punches/],
    ['office grace out of range', () => broken((f, d) => { d.offices.HRMO.graceMinutes = 99; }), /Invalid backup: office \(HRMO\)/],
    ['office name with |', () => broken((f, d) => { d.offices['A|B'] = { name: 'A|B', graceMinutes: 15 }; }), /Invalid backup: office \(A\|B\)/],
    ['employee of a missing office', () => broken((f, d) => { d.employees['NOPE|1'] = { office: 'NOPE', acNo: '1', name: 'X' }; }), /Invalid backup: employee \(NOPE\|1\)/],
    ['punch key and fields disagree', () => broken((f, d) => { d.punches['HRMO|14|2026-07-01|AM'].date = '2026-07-02'; }), /Invalid backup: punch \(HRMO\|14\|2026-07-01\|AM\)/],
    ['punch with a bad time', () => broken((f, d) => { d.punches['HRMO|14|2026-07-01|AM'].in = '25:00'; }), /Invalid backup: punch/],
    ['adjustment of an unknown employee', () => broken((f, d) => { d.adjustments['HRMO|999|2026-07-01|AM'] = d.adjustments['HRMO|568|2026-07-01|AM']; }), /Invalid backup: adjustment \(HRMO\|999/],
    ['holiday with a bad type', () => broken((f, d) => { d.holidays['2026-07-03'].type = 'Party'; }), /Invalid backup: holiday \(2026-07-03\)/],
    ['a __proto__ key', () => broken((f, d) => { d.holidays = JSON.parse('{"__proto__":{"date":"x"}}'); }), /Invalid backup: holiday \(__proto__\)/],
    ['offices differing only by case', () => broken((f, d) => { d.offices.hrmo = { name: 'hrmo', graceMinutes: 15 }; }), /Invalid backup: office \(hrmo\)/],
    ['an AC-No with |', () => broken((f, d) => { d.employees['HRMO|1|2'] = { office: 'HRMO', acNo: '1|2', name: 'X' }; }), /Invalid backup: employee \(HRMO\|1\|2\)/],
    ['an adjustment ending before it starts', () => broken((f, d) => { d.adjustments['HRMO|568|2026-07-01|AM'].out = '07:00'; }), /Invalid backup: adjustment \(HRMO\|568\|2026-07-01\|AM\)/],
  ])('rejects %s', (_, file, err) => {
    expect(() => readBackup(file())).toThrow(err);
  });

  it('keeps only known fields', () => {
    const text = broken((f, d) => {
      d.extra = 'x'.repeat(1000);
      d.punches['HRMO|14|2026-07-01|AM'].junk = 1;
      d.offices.HRMO.junk = 1;
    });
    const { data } = readBackup(text);
    expect(data).toEqual(full());
  });

  it('accepts an adjustment on a day that later became a holiday (kept by Phase 6)', () => {
    const data = full();
    setHoliday(data, { date: '2026-07-01', name: 'Later', type: 'Local Holiday' });
    expect(readBackup(makeBackup(data, SAVED)).data.adjustments['HRMO|568|2026-07-01|AM']).toBeDefined();
  });
});
