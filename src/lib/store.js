import fs from 'node:fs';
import path from 'node:path';
import { HOLIDAY_TYPES } from './dtr.js';

const FILE = 'dtr-data.json';

export function emptyData() {
  return { version: 1, offices: {}, employees: {}, punches: {}, holidays: {} };
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
