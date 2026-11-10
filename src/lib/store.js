import fs from 'node:fs';
import path from 'node:path';
import { HOLIDAY_TYPES, offDayLabel, isDayKeyOf, isNightStart, shiftDate } from './dtr.js';

const FILE = 'dtr-data.json';

export function emptyData() {
  return { version: 2, offices: {}, employees: {}, punches: {}, holidays: {}, adjustments: {} };
}

// Version 1 data predates grace default 0 (US-5, 2026-11-10): every office goes to 0 once.
// Returns true when it changed the data.
export function migrateGrace(data) {
  if (data.version !== 1) return false;
  data.offices = Object.fromEntries(Object.entries(data.offices).map(([k, o]) => [k, { ...o, graceMinutes: 0 }]));
  data.version = 2;
  return true;
}

export function resolveOffice(data, typed) {
  const name = String(typed ?? '').trim();
  if (!name) throw new Error('Office name is required');
  if (name.includes('|')) throw new Error('Office name cannot contain |');
  return Object.keys(data.offices).find((o) => o.toLowerCase() === name.toLowerCase()) ?? name;
}

export function mergeImport(data, office, records) {
  // Own-key check and object-literal define, so names like "__proto__" are stored as plain keys.
  if (!Object.hasOwn(data.offices, office)) data.offices = { ...data.offices, [office]: { name: office, graceMinutes: 0 } };
  let added = 0;
  let updated = 0;
  for (const r of records) {
    const emp = `${office}|${r.acNo}`;
    // Keeps existing fields such as `archived` (a re-import never restores an archived employee).
    data.employees[emp] = { ...data.employees[emp], office, acNo: r.acNo, name: r.name };
    const key = `${office}|${r.acNo}|${r.date}|${r.session}`;
    if (data.punches[key]) updated++;
    else added++;
    data.punches[key] = { ...r, office };
  }
  return { added, updated };
}

// Archives (archived: true) or restores an employee when acNo is given, otherwise the office.
export function setArchived(data, { office, acNo, archived }) {
  const [map, key] = acNo === undefined ? ['offices', office] : ['employees', `${office}|${acNo}`];
  if (!Object.hasOwn(data[map], key)) throw new Error(acNo === undefined ? `Unknown office: ${office}` : 'Unknown employee');
  const { archived: _, ...rest } = data[map][key];
  data[map] = { ...data[map], [key]: archived ? { ...rest, archived: true } : rest };
}

// Removes every own key of obj that starts with prefix. Office names cannot contain '|', so 'HR|' never matches 'HRMO|'.
const without = (obj, prefix) => Object.fromEntries(Object.entries(obj ?? {}).filter(([k]) => !k.startsWith(prefix)));

export function deleteEmployee(data, { office, acNo }) {
  const key = `${office}|${acNo}`;
  if (!Object.hasOwn(data.employees, key)) throw new Error('Unknown employee');
  const { [key]: _, ...employees } = data.employees;
  data.employees = employees;
  const keep = (obj) => Object.fromEntries(Object.entries(obj ?? {}).filter(([k]) => !isDayKeyOf(k, office, acNo)));
  data.punches = keep(data.punches);
  data.adjustments = keep(data.adjustments);
}

// Removes the office, its employees, punches, adjustments, and settings. Holidays are global and stay.
export function deleteOffice(data, office) {
  if (!Object.hasOwn(data.offices, office)) throw new Error(`Unknown office: ${office}`);
  const { [office]: _, ...offices } = data.offices;
  data.offices = offices;
  data.employees = without(data.employees, `${office}|`);
  data.punches = without(data.punches, `${office}|`);
  data.adjustments = without(data.adjustments, `${office}|`);
}

export function loadData(dir) {
  const file = path.join(dir, FILE);
  if (!fs.existsSync(file)) return emptyData();
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Write to a temp file, then rename, so a crash mid-write keeps the previous file.
export function saveData(dir, data) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, FILE);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
  fs.renameSync(`${file}.tmp`, file);
}

export function updateOffice(data, office, { inCharge, graceMinutes }) {
  if (!Object.hasOwn(data.offices, office)) throw new Error(`Unknown office: ${office}`);
  const grace = typeof graceMinutes === 'number' ? graceMinutes
    : /^\d+$/.test(String(graceMinutes).trim()) ? Number(String(graceMinutes).trim()) : NaN;
  if (!Number.isInteger(grace) || grace < 0 || grace > 60) throw new Error('Grace minutes must be a whole number from 0 to 60');
  const name = String(inCharge ?? '').trim();
  if (name.length > 100) throw new Error('In-charge name is too long (max 100 characters)');
  data.offices = { ...data.offices, [office]: { ...data.offices[office], graceMinutes: grace, inCharge: name } };
}


const isIsoDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

// One holiday per date (dates are the keys). originalDate is the date being edited, if any.
export function setHoliday(data, { date, name, type }, originalDate) {
  if (!isIsoDate(date)) throw new Error('Invalid date');
  const label = String(name ?? '').trim();
  if (!label || label.length > 100) throw new Error('Holiday name must be 1 to 100 characters');
  if (!HOLIDAY_TYPES.includes(type)) throw new Error('Unknown holiday type');
  const holidays = data.holidays ?? {};
  if (date !== originalDate && Object.hasOwn(holidays, date)) throw new Error(`A holiday already exists on ${date}`);
  const next = { ...holidays };
  if (originalDate && originalDate !== date) delete next[originalDate];
  next[date] = { date, name: label, type };
  data.holidays = next;
}

export function deleteHoliday(data, date) {
  if (!Object.hasOwn(data.holidays ?? {}, date)) throw new Error(`No holiday on ${date}`);
  const next = { ...(data.holidays ?? {}) };
  delete next[date];
  data.holidays = next;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_HOURS = { AM: ['08:00', '12:00'], PM: ['13:00', '17:00'] };
const dayNumber = (iso) => Date.parse(`${iso}T00:00:00Z`) / 86400000;

// Session hours for a day without a device row: the employee's nearest-dated punch, else 8-12 / 1-5.
function sessionHours(data, office, acNo, session, date) {
  const prefix = `${office}|${acNo}|`;
  let best = null;
  for (const [k, p] of Object.entries(data.punches)) {
    if (!k.startsWith(prefix) || p.session !== session) continue;
    const gap = Math.abs(dayNumber(p.date) - dayNumber(date));
    if (!best || gap < best.gap) best = { gap, p };
  }
  return best ? [best.p.onDuty, best.p.offDuty] : DEFAULT_HOURS[session];
}

// Sets both sessions of one day. A session equal to the device punch drops its adjustment;
// a session equal to its stored adjustment keeps that record (reason and time) unchanged.
export function adjustDay(data, { office, acNo, date, am, pm, reason }, at) {
  if (!Object.hasOwn(data.employees, `${office}|${acNo}`)) throw new Error('Unknown employee');
  if (!isIsoDate(date)) throw new Error('Invalid date');
  // Holidays and weekends always show their label, so their times cannot be adjusted,
  // except a guard's night-shift rows (a night shift starts that day or the day before, US-13).
  const pmOf = (d) => data.punches[`${office}|${acNo}|${d}|PM`];
  const night = isNightStart(pmOf(date)) || isNightStart(pmOf(shiftDate(date, -1)));
  if (!night && offDayLabel(date, data.holidays)) throw new Error(`${date} is a non-working day`);
  const sessions = { AM: am ?? {}, PM: pm ?? {} };
  for (const [s, v] of Object.entries(sessions)) {
    for (const t of [v.in ?? '', v.out ?? '']) {
      if (typeof t !== 'string' || (t !== '' && !HHMM.test(t))) throw new Error(`Invalid time: ${t}`);
    }
    if (v.in && v.out && v.out <= v.in) throw new Error(`${s === 'AM' ? 'A.M.' : 'P.M.'} departure must be later than arrival`);
  }
  const amOut = sessions.AM.out || sessions.AM.in;
  const pmIn = sessions.PM.in || sessions.PM.out;
  if (amOut && pmIn && amOut > pmIn) throw new Error('A.M. departure must not be later than P.M. arrival');
  const why = String(reason ?? '').trim();
  if (why.length > 200) throw new Error('Reason is too long (max 200 characters)');

  const next = { ...(data.adjustments ?? {}) };
  for (const [s, v] of Object.entries(sessions)) {
    const key = `${office}|${acNo}|${date}|${s}`;
    const device = data.punches[key];
    const value = { in: v.in ?? '', out: v.out ?? '' };
    const stored = next[key];
    if (value.in === (device?.in ?? '') && value.out === (device?.out ?? '')) delete next[key];
    else if (stored && stored.in === value.in && stored.out === value.out) continue;
    else {
      if (!why) throw new Error('Reason is required');
      const [onDuty, offDuty] = device ? [device.onDuty, device.offDuty] : sessionHours(data, office, acNo, s, date);
      next[key] = { ...value, onDuty, offDuty, reason: why, at };
    }
  }
  data.adjustments = next;
}

export function revertDay(data, { office, acNo, date }) {
  const keys = ['AM', 'PM'].map((s) => `${office}|${acNo}|${date}|${s}`).filter((k) => Object.hasOwn(data.adjustments ?? {}, k));
  if (!keys.length) throw new Error(`No adjustment on ${date}`);
  const next = { ...data.adjustments };
  keys.forEach((k) => delete next[k]);
  data.adjustments = next;
}

const BACKUP_FORMAT = 'dtr-analyzer-backup';

// The whole store as one backup file.
export function makeBackup(data, savedAt) {
  return JSON.stringify({ format: BACKUP_FORMAT, version: 1, savedAt, data });
}

// Parses and checks every record of a backup file. Throws 'Invalid backup: …' on the first problem,
// so a restore never applies a partly valid file.
export function readBackup(text) {
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error('Invalid backup: not a JSON file');
  }
  const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!isMap(file) || file.format !== BACKUP_FORMAT) throw new Error('Invalid backup: not a DTR Analyzer backup');
  if (file.version !== 1 || !isMap(file.data) || ![1, 2].includes(file.data.version)) throw new Error('Invalid backup: unsupported version');
  const d = file.data;
  for (const m of ['offices', 'employees', 'punches', 'adjustments', 'holidays']) {
    if (!isMap(d[m])) throw new Error(`Invalid backup: ${m} is missing or not a list`);
  }
  const fail = (what, key) => { throw new Error(`Invalid backup: ${what} (${key})`); };
  const str = (v, max = 200) => typeof v === 'string' && v.length <= max;
  const time = (v) => typeof v === 'string' && HHMM.test(v);
  const timeOrBlank = (v) => v === '' || time(v);
  const flag = (v) => v === undefined || v === true;

  // Same limits as the app's own edits: office names unique ignoring case, no '|' in names or AC-Nos.
  const seen = new Set();
  for (const [k, o] of Object.entries(d.offices)) {
    if (!isMap(o) || !k || k.includes('|') || k === '__proto__' || o.name !== k || seen.has(k.toLowerCase())
      || !Number.isInteger(o.graceMinutes) || o.graceMinutes < 0 || o.graceMinutes > 60
      || !(o.inCharge === undefined || str(o.inCharge, 100)) || !flag(o.archived)) fail('office', k);
    seen.add(k.toLowerCase());
  }
  for (const [k, e] of Object.entries(d.employees)) {
    if (!isMap(e) || !Object.hasOwn(d.offices, e.office) || !str(e.acNo) || !e.acNo || e.acNo.includes('|') || !str(e.name)
      || k !== `${e.office}|${e.acNo}` || !flag(e.archived)) fail('employee', k);
  }
  // Day keys are office|acNo|date|session, and the employee must exist.
  const dayKey = (k) => {
    const m = /^(.*)\|(\d{4}-\d{2}-\d{2})\|(AM|PM)$/.exec(k);
    return m && Object.hasOwn(d.employees, m[1]) && isIsoDate(m[2]) ? { emp: d.employees[m[1]], date: m[2], session: m[3] } : null;
  };
  for (const [k, p] of Object.entries(d.punches)) {
    const day = dayKey(k);
    if (!day || !isMap(p) || p.office !== day.emp.office || p.acNo !== day.emp.acNo || p.date !== day.date
      || p.session !== day.session || !str(p.name) || !time(p.onDuty) || !time(p.offDuty)
      || !timeOrBlank(p.in) || !timeOrBlank(p.out)) fail('punch', k);
  }
  for (const [k, a] of Object.entries(d.adjustments)) {
    // Adjustments on holidays and weekends are allowed: they stay stored when a holiday is added later (Phase 6).
    if (!dayKey(k) || !isMap(a) || !timeOrBlank(a.in) || !timeOrBlank(a.out) || (a.in && a.out && a.out <= a.in)
      || !time(a.onDuty) || !time(a.offDuty) || !str(a.reason) || !str(a.at, 40)) fail('adjustment', k);
  }
  for (const [k, h] of Object.entries(d.holidays)) {
    if (!isIsoDate(k) || !isMap(h) || h.date !== k || !str(h.name, 100) || !h.name || !HOLIDAY_TYPES.includes(h.type)) fail('holiday', k);
  }

  // Rebuilt from the checked fields only, so nothing else in the file is ever saved.
  const each = (map, pick) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, pick(v)]));
  const opt = (v, key) => (v[key] === undefined ? {} : { [key]: v[key] });
  const data = {
    version: d.version,
    offices: each(d.offices, (o) => ({ name: o.name, graceMinutes: o.graceMinutes, ...opt(o, 'inCharge'), ...opt(o, 'archived') })),
    employees: each(d.employees, (e) => ({ office: e.office, acNo: e.acNo, name: e.name, ...opt(e, 'archived') })),
    punches: each(d.punches, (p) => ({
      acNo: p.acNo, name: p.name, date: p.date, session: p.session, onDuty: p.onDuty, offDuty: p.offDuty, in: p.in, out: p.out, office: p.office,
    })),
    adjustments: each(d.adjustments, (a) => ({ in: a.in, out: a.out, onDuty: a.onDuty, offDuty: a.offDuty, reason: a.reason, at: a.at })),
    holidays: each(d.holidays, (h) => ({ date: h.date, name: h.name, type: h.type })),
  };
  migrateGrace(data);
  return { data, savedAt: String(file.savedAt ?? '') };
}
