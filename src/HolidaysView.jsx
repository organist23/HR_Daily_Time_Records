import { useCallback, useState } from 'react';
import HolidayDialog from './HolidayDialog.jsx';
import { MONTHS } from './lib/dtr.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export default function HolidaysView({ holidays, onSave, onDelete }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [yearText, setYearText] = useState(String(today.getFullYear()));
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [dialog, setDialog] = useState(null); // { holiday, defaultDate }
  const close = useCallback(() => setDialog(null), []);

  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = iso(year, month, 1).slice(0, 8);
  const inMonth = Object.values(holidays).filter((h) => h.date.startsWith(prefix)).sort((a, b) => a.date.localeCompare(b.date));

  const save = async (h, originalDate) => {
    await onSave(h, originalDate);
    setDialog(null);
  };
  const remove = async (date) => {
    await onDelete(date);
    setDialog(null);
  };

  return (
    <section className="holidays" aria-label="Holidays">
      <div className="controls">
        <label>
          Month{' '}
          <select aria-label="Month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </label>
        <label>
          Year{' '}
          <input aria-label="Year" type="number" min="2000" max="2100" value={yearText}
            onChange={(e) => {
              setYearText(e.target.value);
              const y = Number(e.target.value);
              if (y >= 2000 && y <= 2100) setYear(y);
            }} />
        </label>
        <button className="primary" onClick={() => setDialog({ holiday: null, defaultDate: iso(year, month, 1) })}>
          Add holiday
        </button>
      </div>

      <div className="calendar">
        {WEEKDAYS.map((w) => <div key={w} className="weekday" aria-hidden="true">{w}</div>)}
        {Array.from({ length: firstWeekday }, (_, i) => <div key={`blank-${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const day = i + 1;
          const date = iso(year, month, day);
          const h = holidays[date];
          const weekend = (firstWeekday + i) % 7 === 0 || (firstWeekday + i) % 7 === 6;
          return (
            <button
              key={date}
              className={`day${h ? ' has-holiday' : ''}${weekend ? ' weekend' : ''}`}
              aria-label={`${MONTHS[month - 1]} ${day}, ${year}`}
              onClick={() => setDialog({ holiday: h ?? null, defaultDate: date })}
            >
              <span className="num">{day}</span>
              {h && <span className="hname">{h.name}</span>}
              {h && <span className="htype">{h.type}</span>}
            </button>
          );
        })}
      </div>

      <div className="holiday-list">
        <h2>Holidays in {MONTHS[month - 1]} {year}</h2>
        {inMonth.length === 0 ? (
          <p className="muted">No holidays this month.</p>
        ) : (
          <ul>
            {inMonth.map((h) => (
              <li key={h.date}>
                <span>{MONTHS[month - 1]} {Number(h.date.slice(8))} — {h.name} ({h.type})</span>
                <button onClick={() => setDialog({ holiday: h, defaultDate: h.date })} aria-label={`Edit ${h.name}`}>Edit</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {dialog && (
        <HolidayDialog holiday={dialog.holiday} defaultDate={dialog.defaultDate} onSave={save} onDelete={remove} onCancel={close} />
      )}
    </section>
  );
}
