import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { readSheetRows, parseRows } from '../src/lib/parse.js';
import { computeDtr, formatTime, periodLabel, officialHours, effectivePunches } from '../src/lib/dtr.js';

const all = parseRows(readSheetRows(fs.readFileSync('sample_data/HRMO (3).xls'))).records;
const of = (acNo) => all.filter((r) => r.acNo === acNo);
const july = (acNo, half = 'first', graceMinutes = 15) =>
  computeDtr({ punches: of(acNo), year: 2026, month: 7, half, graceMinutes });

describe('computeDtr', () => {
  it('missing punch = 4h undertime, absent session = blank', () => {
    const r = july('568').rows[0]; // RONIE 7/01: AM 08:00 in only, PM absent
    expect(r).toEqual({ day: 1, amIn: '8:00', amOut: '', pmIn: '', pmOut: '', undertime: 240, label: '', adjusted: [] });
  });

  it('late beyond grace counts from on-duty', () => {
    expect(july('611').rows[7].undertime).toBe(18); // LAZARO 7/08 in 08:18
  });

  it('within grace is not late', () => {
    expect(july('611').rows[5].undertime).toBe(0); // LAZARO 7/06 in 08:08 and 13:06
  });

  it('grace 0 counts every minute', () => {
    expect(july('568', 'first', 0).rows[1].undertime).toBe(3); // RONIE 7/02 in 08:01 and 13:02
  });

  it('grace 0 (default since 2026-11-10): LAZARO 7/06 is 14 min late', () => {
    expect(july('611', 'first', 0).rows[5].undertime).toBe(14); // 08:08 = 8 + 13:06 = 6
  });

  it('RELITA July 1-15 totals', () => {
    // 7 days x 2 sessions = 14; 13 complete on time (240 each), 7/03 PM missing arrival.
    const d = july('14');
    expect(d.credited).toBe(3120);
    expect(d.days).toBe(6);
    expect(d.totalUndertime).toBe(240);
    expect(d.rows[2]).toMatchObject({ pmIn: '', pmOut: '5:00', undertime: 240 });
  });

  it('only official hours are credited', () => {
    const punches = [];
    for (const day of [1, 2, 3, 6, 7, 8, 9]) { // 7 workdays: July 4/5, 2026 are a weekend
      const date = `2026-07-${String(day).padStart(2, '0')}`;
      punches.push({ acNo: '1', name: 'X', date, session: 'AM', onDuty: '08:00', offDuty: '12:00', in: '07:00', out: '12:30' });
      punches.push({ acNo: '1', name: 'X', date, session: 'PM', onDuty: '13:00', offDuty: '17:00', in: '12:30', out: '18:00' });
    }
    const d = computeDtr({ punches, year: 2026, month: 7, half: 'full', graceMinutes: 15 });
    expect(d.credited).toBe(7 * 480);
    expect(d.days).toBe(7);
    expect(d.totalUndertime).toBe(0);
  });

  it('early departure is undertime', () => {
    const punches = [{ acNo: '1', name: 'X', date: '2026-07-01', session: 'PM', onDuty: '13:00', offDuty: '17:00', in: '13:00', out: '16:30' }];
    const d = computeDtr({ punches, year: 2026, month: 7, half: 'full', graceMinutes: 15 });
    expect(d.rows[0].undertime).toBe(30);
    expect(d.credited).toBe(210);
  });

  it('days outside the period are blank', () => {
    const d = july('14', 'second');
    expect(d.rows).toHaveLength(31);
    expect(d.rows[0]).toEqual({ day: 1, amIn: '', amOut: '', pmIn: '', pmOut: '', undertime: 0, label: '', adjusted: [] });
    expect(d.credited).toBe(0);
  });

  it('day 31 is blank in a 30-day month', () => {
    const punches = [{ acNo: '1', name: 'X', date: '2026-10-01', session: 'AM', onDuty: '08:00', offDuty: '12:00', in: '08:00', out: '12:00' }];
    const d = computeDtr({ punches, year: 2026, month: 9, half: 'full', graceMinutes: 15 });
    expect(d.rows[30].amIn).toBe('');
    expect(d.rows[0].amIn).toBe('');
  });
});

describe('formatTime', () => {
  it('formats 12h without AM/PM', () => {
    expect(formatTime('13:02')).toBe('1:02');
    expect(formatTime('08:00')).toBe('8:00');
    expect(formatTime('12:05')).toBe('12:05');
    expect(formatTime('00:30')).toBe('12:30');
    expect(formatTime('')).toBe('');
  });
});

describe('periodLabel', () => {
  it('labels month and halves', () => {
    expect(periodLabel(2026, 7, 'full')).toBe('For the month of July 2026');
    expect(periodLabel(2026, 7, 'first')).toBe('For the period of July 1-15, 2026');
    expect(periodLabel(2026, 7, 'second')).toBe('For the period of July 16-31, 2026');
    expect(periodLabel(2026, 2, 'second')).toBe('For the period of February 16-28, 2026');
  });
});

describe('officialHours', () => {
  it('reads on/off duty from the shown month', () => {
    expect(officialHours(of('14'), 2026, 7)).toBe('8:00-12:00, 1:00-5:00');
  });

  it('prefers the shown month over other months', () => {
    const p = (date, session, onDuty, offDuty) => ({ acNo: '1', name: 'X', date, session, onDuty, offDuty, in: '', out: '' });
    const punches = [p('2026-07-01', 'AM', '08:00', '12:00'), p('2026-08-03', 'AM', '07:00', '11:00'), p('2026-08-03', 'PM', '12:00', '16:00')];
    expect(officialHours(punches, 2026, 8)).toBe('7:00-11:00, 12:00-4:00');
    expect(officialHours(punches, 2026, 9)).toBe('8:00-12:00, 12:00-4:00');
  });

  it('is empty with no punches', () => {
    expect(officialHours([], 2026, 7)).toBe('');
  });
});

describe('holiday and weekend labels', () => {
  const holidays = { '2026-07-03': { date: '2026-07-03', name: 'Test Holiday', type: 'Regular Holiday' } };
  const withHolidays = (acNo, half = 'first', h = holidays) =>
    computeDtr({ punches: of(acNo), year: 2026, month: 7, half, graceMinutes: 15, holidays: h });

  it('labels Saturday and Sunday rows without times (July 4 and 5, 2026)', () => {
    const d = july('14');
    expect(d.rows[3].label).toBe('SATURDAY');
    expect(d.rows[4].label).toBe('SUNDAY');
    expect(d.rows[2].label).toBe('');
    expect(d.credited).toBe(3120);
  });

  it('labels a holiday on an absent day with 0 undertime', () => {
    const r = withHolidays('783').rows[2]; // MARY ANN EGTAPEN 7/03: both sessions absent
    expect(r).toMatchObject({ label: 'REGULAR HOLIDAY', amIn: '', pmOut: '', undertime: 0 });
  });

  it('a holiday label hides time entries and drops their credit and undertime', () => {
    // RELITA 7/03: AM full (240 credit), PM missing arrival (240 undertime). July 1-15 without it: 3120, 240.
    const d = withHolidays('14');
    expect(d.rows[2]).toMatchObject({ label: 'REGULAR HOLIDAY', amIn: '', amOut: '', pmIn: '', pmOut: '', undertime: 0 });
    expect([d.credited, d.days, d.totalUndertime]).toEqual([2880, 6, 0]);
  });

  it('a weekend label hides a punch and gives no credit', () => {
    const punches = [{ acNo: '1', name: 'X', date: '2026-07-04', session: 'AM', onDuty: '08:00', offDuty: '12:00', in: '08:00', out: '12:00' }];
    const d = computeDtr({ punches, year: 2026, month: 7, half: 'full', graceMinutes: 15 });
    expect(d.rows[3]).toMatchObject({ label: 'SATURDAY', amIn: '', amOut: '' });
    expect(d.credited).toBe(0);
  });

  it('no credit and no undertime on a holiday or weekend', () => {
    const sat = { acNo: '1', name: 'X', date: '2026-07-04', session: 'AM', onDuty: '08:00', offDuty: '12:00', in: '08:00', out: '' };
    const hol = { acNo: '1', name: 'X', date: '2026-07-03', session: 'AM', onDuty: '08:00', offDuty: '12:00', in: '09:00', out: '12:00' };
    const d = computeDtr({ punches: [sat, hol], year: 2026, month: 7, half: 'full', graceMinutes: 15, holidays });
    expect(d.rows[3].undertime).toBe(0); // Saturday, departure missing
    expect(d.rows[2].undertime).toBe(0); // holiday, 1h late
    expect([d.credited, d.totalUndertime]).toEqual([0, 0]);
  });

  it('JOANNE July: a 7/01 holiday drops one full day', () => {
    // 6 full days (2880) + 7/09 PM (240) = 3120 → 6 days; 7/09 AM missing departure → 240 undertime.
    const joanne = (h) => computeDtr({ punches: of('218'), year: 2026, month: 7, half: 'full', graceMinutes: 15, holidays: h });
    const before = joanne({});
    expect([before.credited, before.days, before.totalUndertime]).toEqual([3120, 6, 240]);
    const after = joanne({ '2026-07-01': { date: '2026-07-01', name: 'x', type: 'Special Non-Working Holiday' } });
    expect(after.rows[0]).toMatchObject({ label: 'SPECIAL NON-WORKING HOLIDAY', amIn: '' });
    expect([after.credited, after.days, after.totalUndertime]).toEqual([2640, 5, 240]);
  });

  it('a malformed holiday entry still labels instead of crashing', () => {
    const bad = { '2026-07-03': { date: '2026-07-03', name: 'X' } };
    expect(withHolidays('783', 'first', bad).rows[2].label).toBe('HOLIDAY');
  });

  it('a holiday on a weekend shows the holiday', () => {
    const h = { '2026-07-04': { date: '2026-07-04', name: 'X', type: 'Local Holiday' } };
    expect(withHolidays('14', 'first', h).rows[3].label).toBe('LOCAL HOLIDAY');
  });

  it('no labels outside the period or the month', () => {
    expect(withHolidays('14', 'second').rows[3].label).toBe(''); // July 4 is in 1-15
    const sept = computeDtr({ punches: [], year: 2026, month: 9, half: 'full', graceMinutes: 15 });
    expect(sept.rows[30].label).toBe(''); // no September 31
    expect(sept.rows[4].label).toBe('SATURDAY'); // September 5, 2026
  });
});

describe('adjustments', () => {
  const AT = '2026-11-09T02:00:00.000Z';
  const adj = {
    'HRMO|568|2026-07-01|AM': { in: '08:00', out: '12:00', onDuty: '08:00', offDuty: '12:00', reason: 'WFH', at: AT },
    'HRMO|568|2026-07-01|PM': { in: '13:00', out: '17:00', onDuty: '13:00', offDuty: '17:00', reason: 'WFH', at: AT },
  };
  const ronie = (adjustments, holidays = {}) => computeDtr({
    punches: effectivePunches(of('568'), adjustments, 'HRMO', '568'), year: 2026, month: 7, half: 'first', graceMinutes: 15, holidays,
  });

  it('before: RONIE July 1-15 credits 1200 min (2 days), undertime 1200', () => {
    // 7/02 480 + 7/03 480 + 7/06 AM 240; undertime 7/01 240, 7/06 240, 7/07 480, 7/08 240.
    const d = ronie({});
    expect([d.credited, d.days, d.totalUndertime]).toEqual([1200, 2, 1200]);
  });

  it('after a work-from-home fix on 7/01: 1680 min (3 days), undertime 960, 3 marked cells', () => {
    const d = ronie(adj);
    expect(d.rows[0]).toMatchObject({ amIn: '8:00', amOut: '12:00', pmIn: '1:00', pmOut: '5:00', undertime: 0, adjusted: ['amOut', 'pmIn', 'pmOut'] });
    expect([d.credited, d.days, d.totalUndertime]).toEqual([1680, 3, 960]);
  });

  it('adds a punch on a day with no device rows', () => {
    const extra = { 'HRMO|568|2026-07-13|AM': { in: '08:00', out: '12:00', onDuty: '08:00', offDuty: '12:00', reason: 'WFH', at: AT } };
    expect(ronie(extra).rows[12]).toMatchObject({ amIn: '8:00', amOut: '12:00', adjusted: ['amIn', 'amOut'] });
  });

  it('ignores other employees and other offices', () => {
    expect(effectivePunches(of('568'), { 'ACCT|568|2026-07-01|AM': adj['HRMO|568|2026-07-01|AM'] }, 'HRMO', '568')).toEqual(of('568'));
  });

  it('a cleared cell counts as adjusted', () => {
    const cleared = { 'HRMO|568|2026-07-01|AM': { in: '', out: '', onDuty: '08:00', offDuty: '12:00', reason: 'Wrong punch', at: AT } };
    expect(ronie(cleared).rows[0]).toMatchObject({ amIn: '', undertime: 0, adjusted: ['amIn'] });
  });

  it('a holiday label hides adjusted times and their credit', () => {
    // With the 7/01 fix: 1680, undertime 960. The holiday removes 7/01's 480 credit.
    const h = { '2026-07-01': { date: '2026-07-01', name: 'X', type: 'Local Holiday' } };
    const d = ronie(adj, h);
    expect(d.rows[0]).toMatchObject({ label: 'LOCAL HOLIDAY', amOut: '', undertime: 0, adjusted: [] });
    expect([d.credited, d.days, d.totalUndertime]).toEqual([1200, 2, 960]);
  });
});

// US-13 night shift. Hand-derived from sample_data/NIGHT_shift.xls (EFREN ALCANTARA #479), grace 0:
// a shift is the P.M. row (17:00-23:59, Clock In) plus the next day's A.M. row (01:00-06:00, Clock Out),
// credited straight through midnight: start row up to 24:00, end row from 00:00 to 06:00.
describe('night shift (US-13)', () => {
  const efren = parseRows(readSheetRows(fs.readFileSync('sample_data/NIGHT_shift.xls'))).records;
  const sept = (punches, half = 'first', holidays = {}) =>
    computeDtr({ punches, year: 2026, month: 9, half, graceMinutes: 0, holidays });
  const onDates = (...dates) => efren.filter((p) => dates.includes(p.date));
  const night = (date, session, onDuty, offDuty, inT, outT) =>
    ({ acNo: '479', name: 'EFREN ALCANTARA', date, session, onDuty, offDuty, in: inT, out: outT });

  it('September 1-15: 4,613 credited min = 9 days, 1,147 min undertime', () => {
    const d = sept(efren);
    expect([d.credited, d.days, d.totalUndertime]).toEqual([4613, 9, 1147]);
  });

  it('9/02 17:12 to 9/03 06:01 credits 408 + 360 and is 12 min late', () => {
    const d = sept(onDates('2026-09-02', '2026-09-03'));
    expect(d.credited).toBe(768);
    expect(d.rows[1]).toMatchObject({ pmIn: '5:12', pmOut: '', undertime: 12, night: true });
    expect(d.rows[2]).toMatchObject({ amIn: '', amOut: '6:01', undertime: 0, night: true });
  });

  it('16:44 on Friday to 06:00 Saturday credits 780, and Saturday shows its time', () => {
    const d = sept(onDates('2026-09-04', '2026-09-05'));
    expect(d.credited).toBe(780);
    expect(d.rows[4]).toMatchObject({ label: '', amOut: '6:00', undertime: 0, night: true });
  });

  it('a missing departure gives the whole 13h shift as undertime on the start row', () => {
    const d = sept(onDates('2026-09-14', '2026-09-15'));
    expect(d.credited).toBe(0);
    expect(d.rows[13]).toMatchObject({ pmIn: '5:11', undertime: 780 });
    expect(d.rows[14].undertime).toBe(0);
  });

  it('9/01 departure with no 8/31 data: day rule, 0 credit and 5h undertime', () => {
    const d = sept(onDates('2026-09-01'));
    expect(d.credited).toBe(0);
    expect(d.rows[0]).toMatchObject({ amOut: '6:00', undertime: 300 });
  });

  it('9/01 pairs with an 8/31 arrival when August is imported', () => {
    const d = sept([night('2026-08-31', 'PM', '17:00', '23:59', '17:00', ''), ...onDates('2026-09-01')]);
    expect(d.credited).toBe(360);
    expect(d.rows[0]).toMatchObject({ amOut: '6:00', undertime: 0, night: true });
  });

  it('a holiday keeps the night times and their credit', () => {
    const holidays = { '2026-09-08': { date: '2026-09-08', name: 'Test', type: 'Regular Holiday' } };
    const d = sept(efren, 'first', holidays);
    expect(d.rows[7]).toMatchObject({ label: '', pmIn: '4:52' });
    expect(d.credited).toBe(4613);
  });

  it('a weekend night row with no times still shows the label', () => {
    const d = sept([night('2026-09-19', 'PM', '17:00', '23:59', '', ''), night('2026-09-20', 'AM', '01:00', '06:00', '', '')], 'second');
    expect(d.rows[18]).toMatchObject({ label: 'SATURDAY', pmIn: '' });
    expect(d.rows[19]).toMatchObject({ label: 'SUNDAY' });
  });

  it('a shift over the period edge credits each half its own row', () => {
    const p = [night('2026-09-15', 'PM', '17:00', '23:59', '17:00', ''), night('2026-09-16', 'AM', '01:00', '06:00', '', '06:00')];
    expect(sept(p, 'first').credited).toBe(420);
    expect(sept(p, 'second').credited).toBe(360);
  });

  it('official hours come from the data', () => {
    expect(officialHours(efren, 2026, 9)).toBe('1:00-6:00, 5:00-11:59');
  });
});
