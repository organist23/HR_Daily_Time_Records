export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const daysIn = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

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

export function computeDtr({ punches, year, month, half, graceMinutes, holidays = {} }) {
  const [from, to] = periodRange(year, month, half);
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const byKey = new Map(punches.map((p) => [`${p.date}|${p.session}`, p]));

  let totalUndertime = 0;
  let credited = 0;
  const rows = [];
  for (let day = 1; day <= 31; day++) {
    const row = { day, amIn: '', amOut: '', pmIn: '', pmOut: '', undertime: 0, label: '' };
    if (day >= from && day <= to) {
      const date = prefix + String(day).padStart(2, '0');
      const am = byKey.get(`${date}|AM`);
      const pm = byKey.get(`${date}|PM`);
      Object.assign(row, {
        amIn: formatTime(am?.in), amOut: formatTime(am?.out),
        pmIn: formatTime(pm?.in), pmOut: formatTime(pm?.out),
      });
      for (const s of [session(am, graceMinutes), session(pm, graceMinutes)]) {
        row.undertime += s.undertime;
        credited += s.credited;
      }
      totalUndertime += row.undertime;
      // Holiday or weekend label only when the day has no times (work on those days still shows).
      if (!row.amIn && !row.amOut && !row.pmIn && !row.pmOut) {
        const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
        row.label = Object.hasOwn(holidays, date) ? holidays[date].type.toUpperCase()
          : weekday === 6 ? 'SATURDAY' : weekday === 0 ? 'SUNDAY' : '';
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
