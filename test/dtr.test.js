import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { readSheetRows, parseRows } from '../src/lib/parse.js';
import { computeDtr, formatTime, periodLabel } from '../src/lib/dtr.js';

const all = parseRows(readSheetRows(fs.readFileSync('sample_data/HRMO.xls'))).records;
const of = (acNo) => all.filter((r) => r.acNo === acNo);
const july = (acNo, half = 'first', graceMinutes = 15) =>
  computeDtr({ punches: of(acNo), year: 2026, month: 7, half, graceMinutes });

describe('computeDtr', () => {
  it('missing punch = 4h undertime, absent session = blank', () => {
    const r = july('568').rows[0]; // RONIE 7/01: AM 08:00 in only, PM absent
    expect(r).toEqual({ day: 1, amIn: '8:00', amOut: '', pmIn: '', pmOut: '', undertime: 240 });
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
    expect(d.rows[0]).toEqual({ day: 1, amIn: '', amOut: '', pmIn: '', pmOut: '', undertime: 0 });
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
