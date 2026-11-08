import * as XLSX from 'xlsx';

const REQUIRED = ['AC-No.', 'Name', 'Date', 'Timetable', 'On duty', 'Off duty', 'Clock In', 'Clock Out'];
const SESSIONS = { morning: 'AM', afternoon: 'PM' };
// 24h "8:05" / "08:05:00", or 12h "8:05 AM" as Excel formats real time cells.
const TIME = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?\s*([AaPp][Mm])?$/;

export function readSheetRows(buffer) {
  const wb = XLSX.read(buffer);
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
}

// '' stays '' (missing punch); invalid returns null.
function parseTime(value, allowEmpty) {
  const s = String(value).trim();
  if (s === '') return allowEmpty ? '' : null;
  const m = TIME.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0);
  } else if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

function parseDate(value) {
  const s = String(value).trim();
  let y, mo, d, m;
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/.exec(s))) [, mo, d, y] = m;
  else if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) [, y, mo, d] = m;
  else return null;
  if (y.length === 2) y = `20${y}`; // Excel date cells format as m/d/yy
  const date = new Date(Date.UTC(+y, +mo - 1, +d));
  if (date.getUTCMonth() !== +mo - 1 || date.getUTCDate() !== +d) return null;
  return date.toISOString().slice(0, 10);
}

export function parseRows(rows) {
  const header = (rows[0] || []).map((h) => String(h).trim().toLowerCase());
  const col = Object.fromEntries(REQUIRED.map((name) => [name, header.indexOf(name.toLowerCase())]));
  const missing = REQUIRED.filter((name) => col[name] < 0);
  if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`);

  const records = [];
  let skipped = 0;
  for (const row of rows.slice(1)) {
    if (row.every((c) => String(c).trim() === '')) continue;
    const get = (name) => row[col[name]] ?? '';
    const rec = {
      acNo: String(get('AC-No.')).trim(),
      name: String(get('Name')).trim(),
      date: parseDate(get('Date')),
      session: SESSIONS[String(get('Timetable')).trim().toLowerCase()],
      onDuty: parseTime(get('On duty'), false),
      offDuty: parseTime(get('Off duty'), false),
      in: parseTime(get('Clock In'), true),
      out: parseTime(get('Clock Out'), true),
    };
    if (!rec.acNo || Object.values(rec).some((v) => v === null || v === undefined)) skipped++;
    else records.push(rec);
  }
  return { records, skipped };
}
