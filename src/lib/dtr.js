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
    const row = { day, amIn: '', amOut: '', pmIn: '', pmOut: '', undertime: 0, label: '', adjusted: [] };
    if (day >= from && day <= to) {
      const date = prefix + String(day).padStart(2, '0');
      // Non-working day: the label always wins, with no times, credit, or undertime.
      row.label = offDayLabel(date, holidays);
      if (!row.label) {
        const am = byKey.get(`${date}|AM`);
        const pm = byKey.get(`${date}|PM`);
        Object.assign(row, {
          amIn: formatTime(am?.in), amOut: formatTime(am?.out),
          pmIn: formatTime(pm?.in), pmOut: formatTime(pm?.out),
          adjusted: [[am, 'in', 'amIn'], [am, 'out', 'amOut'], [pm, 'in', 'pmIn'], [pm, 'out', 'pmOut']]
            .filter(([p, f]) => p?.adjusted?.[f]).map(([, , cell]) => cell),
        });
        for (const s of [session(am, graceMinutes), session(pm, graceMinutes)]) {
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
