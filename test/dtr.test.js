import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { readSheetRows, parseRows } from '../src/lib/parse.js';
import { computeDtr, formatTime, periodLabel, officialHours } from '../src/lib/dtr.js';

const all = parseRows(readSheetRows(fs.readFileSync('sample_data/HRMO (3).xls'))).records;
const of = (acNo) => all.filter((r) => r.acNo === acNo);
const july = (acNo, half = 'first', graceMinutes = 15) =>
  computeDtr({ punches: of(acNo), year: 2026, month: 7, half, graceMinutes });

describe('computeDtr', () => {
  it('missing punch = 4h undertime, absent session = blank', () => {
    const r = july('568').rows[0]; // RONIE 7/01: AM 08:00 in only, PM absent
    expect(r).toEqual({ day: 1, amIn: '8:00', amOut: '', pmIn: '', pmOut: '', undertime: 240, label: '' });
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
    for (let day = 1; day <= 7; day++) {
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
    expect(d.rows[0]).toEqual({ day: 1, amIn: '', amOut: '', pmIn: '', pmOut: '', undertime: 0, label: '' });
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

  it('keeps times on a holiday with time entries', () => {
    const r = withHolidays('14').rows[2]; // RELITA 7/03 has punches
    expect(r.label).toBe('');
    expect(r.pmOut).toBe('5:00');
  });

  it('shows times on a weekend with a punch', () => {
    const punches = [{ acNo: '1', name: 'X', date: '2026-07-04', session: 'AM', onDuty: '08:00', offDuty: '12:00', in: '08:00', out: '12:00' }];
    const r = computeDtr({ punches, year: 2026, month: 7, half: 'full', graceMinutes: 15 }).rows[3];
    expect(r).toMatchObject({ label: '', amIn: '8:00' });
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
