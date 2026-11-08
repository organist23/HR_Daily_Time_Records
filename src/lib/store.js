import fs from 'node:fs';
import path from 'node:path';
import { HOLIDAY_TYPES } from './dtr.js';

const FILE = 'dtr-data.json';

export function emptyData() {
  return { version: 1, offices: {}, employees: {}, punches: {}, holidays: {}, adjustments: {} };
}

export function resolveOffice(data, typed) {
  const name = String(typed ?? '').trim();
  if (!name) throw new Error('Office name is required');
  if (name.includes('|')) throw new Error('Office name cannot contain |');
  return Object.keys(data.offices).find((o) => o.toLowerCase() === name.toLowerCase()) ?? name;
}

export function mergeImport(data, office, records) {
  // Own-key check and object-literal define, so names like "__proto__" are stored as plain keys.
  if (!Object.hasOwn(data.offices, office)) data.offices = { ...data.offices, [office]: { name: office, graceMinutes: 15 } };
  let added = 0;
  let updated = 0;
  for (const r of records) {
    data.employees[`${office}|${r.acNo}`] = { office, acNo: r.acNo, name: r.name };
    const key = `${office}|${r.acNo}|${r.date}|${r.session}`;
    if (data.punches[key]) updated++;
    else added++;
    data.punches[key] = { ...r, office };
  }
  return { added, updated };
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

// Session hours for a day without a device row: the employee's other punches, else 8-12 / 1-5.
function sessionHours(data, office, acNo, session) {
  const prefix = `${office}|${acNo}|`;
  const p = Object.entries(data.punches).find(([k, v]) => k.startsWith(prefix) && v.session === session)?.[1];
  return p ? [p.onDuty, p.offDuty] : DEFAULT_HOURS[session];
}

// Sets both sessions of one day. Values equal to the device punch remove that session's adjustment.
export function adjustDay(data, { office, acNo, date, am, pm, reason }, at) {
  if (!Object.hasOwn(data.employees, `${office}|${acNo}`)) throw new Error('Unknown employee');
  if (!isIsoDate(date)) throw new Error('Invalid date');
  const sessions = { AM: am ?? {}, PM: pm ?? {} };
  for (const [s, v] of Object.entries(sessions)) {
    for (const t of [v.in ?? '', v.out ?? '']) if (t !== '' && !HHMM.test(t)) throw new Error(`Invalid time: ${t}`);
    if (v.in && v.out && v.out <= v.in) throw new Error(`${s === 'AM' ? 'A.M.' : 'P.M.'} departure must be later than arrival`);
  }
  const next = { ...(data.adjustments ?? {}) };
  let changed = false;
  for (const [s, v] of Object.entries(sessions)) {
    const key = `${office}|${acNo}|${date}|${s}`;
    const device = data.punches[key];
    const value = { in: v.in ?? '', out: v.out ?? '' };
    if (value.in === (device?.in ?? '') && value.out === (device?.out ?? '')) {
      delete next[key];
      continue;
    }
    changed = true;
    const [onDuty, offDuty] = device ? [device.onDuty, device.offDuty] : sessionHours(data, office, acNo, s);
    next[key] = { ...value, onDuty, offDuty, reason: String(reason ?? '').trim(), at };
  }
  if (changed) {
    const r = String(reason ?? '').trim();
    if (!r) throw new Error('Reason is required');
    if (r.length > 200) throw new Error('Reason is too long (max 200 characters)');
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
