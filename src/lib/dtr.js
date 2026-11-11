export const HOLIDAY_TYPES = ['Regular Holiday', 'Special Non-Working Holiday', 'Local Holiday', 'Work Suspension'];

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
export const daysIn = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export function formatTime(hhmm) {
  if (!hhmm) return '';
  const h = Number(hhmm.slice(0, 2)) % 12 || 12;
  return `${h}:${hhmm.slice(3)}`;
}

// First and last day of the period. 'second' ends on the month's last day.
export function periodRange(year, month, half) {
  const last = daysIn(year, month);
  return half === 'first' ? [1, 15] : half === 'second' ? [16, last] : [1, last];
}

export function periodLabel(year, month, half) {
  const name = MONTHS[month - 1];
  if (half === 'full') return `For the month of ${name} ${year}`;
  const [from, to] = periodRange(year, month, half);
  return `For the period of ${name} ${from}-${to}, ${year}`;
}

// Returns { undertime, credited } in minutes for one Morning/Afternoon session.
function session(p, graceMinutes) {
  if (!p || (!p.in && !p.out)) return { undertime: 0, credited: 0 }; // absent: leave, not undertime
  const length = minutes(p.offDuty) - minutes(p.onDuty);
  if (!p.in || !p.out) return { undertime: length, credited: 0 };
  const lateBy = minutes(p.in) - minutes(p.onDuty);
  const late = lateBy > graceMinutes ? lateBy : 0;
  const early = Math.max(0, minutes(p.offDuty) - minutes(p.out));
  const undertime = Math.min(length, late + early);
  return { undertime, credited: length - undertime };
}

// US-15: arrival later than on-duty + grace. Set from the arrival alone, so a late arrival with no departure counts.
const isLate = (p, graceMinutes) => Boolean(p?.in) && minutes(p.in) - minutes(p.onDuty) > graceMinutes;

// ISO date plus n days.
export const shiftDate = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// US-13: a P.M. row ending at 23:59 starts a night shift that ends on the next day's A.M. row.
export const isNightStart = (p) => p?.session === 'PM' && p.offDuty === '23:59';

// One night shift, credited straight through midnight: start row up to 24:00, end row from 00:00.
// Missing arrival or departure: the whole shift is undertime on the start row.
function nightShift(start, end, graceMinutes) {
  const zero = { undertime: 0, credited: 0 };
  const startLen = 1440 - minutes(start.onDuty);
  const endLen = end ? minutes(end.offDuty) : 0;
  if (!start.in && !end?.out) return { start: zero, end: zero }; // absent
  if (!start.in || !end?.out) return { start: { undertime: startLen + endLen, credited: 0 }, end: zero };
  const lateBy = minutes(start.in) - minutes(start.onDuty);
  const late = Math.min(startLen, lateBy > graceMinutes ? lateBy : 0);
  const early = Math.min(endLen, Math.max(0, minutes(end.offDuty) - minutes(end.out)));
  return {
    start: { undertime: late, credited: startLen - late },
    end: { undertime: early, credited: endLen - early },
  };
}

// Device punches with the admin's adjustments laid over them. adjusted.in/out mark changed cells.
export function effectivePunches(punches, adjustments, office, acNo) {
  const prefix = `${office}|${acNo}|`;
  const byKey = new Map(punches.map((p) => [`${p.date}|${p.session}`, p]));
  for (const [key, a] of Object.entries(adjustments ?? {})) {
    if (!key.startsWith(prefix)) continue;
    const [date, session] = key.slice(prefix.length).split('|');
    const device = byKey.get(`${date}|${session}`);
    byKey.set(`${date}|${session}`, {
      ...(device ?? { acNo, name: '', date, session, onDuty: a.onDuty, offDuty: a.offDuty }),
      in: a.in,
      out: a.out,
      adjusted: { in: a.in !== (device?.in ?? ''), out: a.out !== (device?.out ?? '') },
    });
  }
  return [...byKey.values()];
}

// Day keys of one employee: `${office}|${acNo}|YYYY-MM-DD|AM|PM`. Matching the whole tail, not just the prefix,
// keeps AC-No '14' from matching AC-No '14|2'.
export const isDayKeyOf = (key, office, acNo) => {
  const prefix = `${office}|${acNo}|`;
  return key.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}\|(AM|PM)$/.test(key.slice(prefix.length));
};

// Adjustments are stored per session (…|date|AM, …|date|PM). This counts the days they cover.
export const adjustedDayCount = (keys) => new Set(keys.map((k) => k.slice(0, k.lastIndexOf('|')))).size;

// Label of a holiday (its type) or weekend for an ISO date, or '' for a workday.
export function offDayLabel(date, holidays = {}) {
  const holiday = Object.hasOwn(holidays, date) ? holidays[date] : null;
  if (holiday) return String(holiday.type || 'Holiday').toUpperCase();
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday === 6 ? 'SATURDAY' : weekday === 0 ? 'SUNDAY' : '';
}

export function computeDtr({ punches, year, month, half, graceMinutes, holidays = {} }) {
  const [from, to] = periodRange(year, month, half);
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const byKey = new Map(punches.map((p) => [`${p.date}|${p.session}`, p]));

  let totalUndertime = 0;
  let credited = 0;
  const rows = [];
  for (let day = 1; day <= 31; day++) {
    const row = { day, amIn: '', amOut: '', pmIn: '', pmOut: '', undertime: 0, label: '', adjusted: [], late: [] };
    if (day >= from && day <= to) {
      const date = prefix + String(day).padStart(2, '0');
      const am = byKey.get(`${date}|AM`);
      const pm = byKey.get(`${date}|PM`);
      // A night shift starts on this P.M. row, or ended on this A.M. row (started the day before).
      const prevPm = byKey.get(`${shiftDate(date, -1)}|PM`);
      const nextAm = byKey.get(`${shiftDate(date, 1)}|AM`);
      const amNight = isNightStart(prevPm);
      const pmNight = isNightStart(pm);
      if (amNight || pmNight) row.night = true;
      const hasTimes = (p) => Boolean(p && (p.in || p.out));
      // Non-working day: the label wins, with no times, credit, or undertime, unless night-shift times exist.
      // A start row counts its shift's departure too, so a missing arrival still charges the shift.
      const nightTimes = (amNight && hasTimes(am)) || (pmNight && (hasTimes(pm) || hasTimes(nextAm)));
      row.label = nightTimes ? '' : offDayLabel(date, holidays);
      if (!row.label) {
        Object.assign(row, {
          amIn: formatTime(am?.in), amOut: formatTime(am?.out),
          pmIn: formatTime(pm?.in), pmOut: formatTime(pm?.out),
          adjusted: [[am, 'in', 'amIn'], [am, 'out', 'amOut'], [pm, 'in', 'pmIn'], [pm, 'out', 'pmOut']]
            .filter(([p, f]) => p?.adjusted?.[f]).map(([, , cell]) => cell),
          // Night-shift arrivals stay unmarked (admin decision 2026-11-11).
          late: [[am, amNight, 'amIn'], [pm, pmNight, 'pmIn']]
            .filter(([p, night]) => !night && isLate(p, graceMinutes)).map(([, , cell]) => cell),
        });
        const amPart = amNight ? nightShift(prevPm, am, graceMinutes).end : session(am, graceMinutes);
        const pmPart = pmNight ? nightShift(pm, nextAm, graceMinutes).start : session(pm, graceMinutes);
        for (const s of [amPart, pmPart]) {
          row.undertime += s.undertime;
          credited += s.credited;
        }
        totalUndertime += row.undertime;
      }
    }
    rows.push(row);
  }
  return { rows, totalUndertime, credited, days: Math.floor(credited / 480) };
}

// "8:00-12:00, 1:00-5:00" from the shown month's punches; other months fill gaps.
export function officialHours(punches, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const inMonth = punches.filter((p) => p.date.startsWith(prefix));
  const pick = (s) => inMonth.find((p) => p.session === s) ?? punches.find((p) => p.session === s);
  return [pick('AM'), pick('PM')].filter(Boolean)
    .map((p) => `${formatTime(p.onDuty)}-${formatTime(p.offDuty)}`).join(', ');
}
