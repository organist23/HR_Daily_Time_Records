import { useMemo, useState } from 'react';
import { checkDate } from './lib/dtr.js';

const todayIso = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

// Who worked on one date: each employee's 4 times and a status. onOpen(key) opens that DTR.
export default function DateCheckView({ data, offices, onOpen }) {
  const [date, setDate] = useState(todayIso);
  const [office, setOffice] = useState('');
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const rows = useMemo(
    () => (valid ? checkDate(data, date).filter((r) => !office || r.office === office) : []),
    [data, date, office, valid],
  );

  return (
    <section className="date-check" aria-label="Date check">
      <div className="controls">
        <label>
          Date{' '}
          <input aria-label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Office{' '}
          <select aria-label="Office" value={office} onChange={(e) => setOffice(e.target.value)}>
            <option value="">All offices</option>
            {offices.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      </div>
      {!valid ? (
        <p className="muted">Pick a date.</p>
      ) : rows.length === 0 ? (
        <p className="muted">No records yet.</p>
      ) : (
        <table className="check-table">
          <thead>
            <tr>
              <th>Office</th><th>Name</th><th>AC-No</th>
              <th>A.M. arrival</th><th>A.M. departure</th><th>P.M. arrival</th><th>P.M. departure</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} data-key={r.key}>
                <td>{r.office}</td>
                <td><button type="button" className="link-btn" onClick={() => onOpen(r.key)}>{r.name}</button></td>
                <td>{r.acNo}</td>
                <td>{r.amIn}</td><td>{r.amOut}</td><td>{r.pmIn}</td><td>{r.pmOut}</td>
                <td className={`status ${r.status === 'Present' ? 'ok' : r.status === 'Incomplete' || r.status === 'Absent' ? 'err' : 'muted'}`}>
                  {r.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
