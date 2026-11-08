import './dtr-form.css';

// Undertime cells stay blank when there is none, as on the handwritten reference.
const hours = (min) => (min ? String(Math.floor(min / 60)) : '');
const mins = (min) => (min ? String(min % 60) : '');

// onDayClick (app view only) makes day numbers buttons; dayName(day) gives their label, e.g. "July 1, 2026".
export default function DtrForm({ name, periodText, officialHours, half, result, inCharge, onDayClick, dayName }) {
  const cls = (r, key, extra = '') => [extra, r.adjusted.includes(key) && 'adjusted'].filter(Boolean).join(' ') || undefined;
  // The form keeps the template's printed rows (16-31 even in a 30-day month).
  // computeDtr already blanks days outside the period, so only the half is chosen here.
  const rows = result.rows.filter((r) => (half === 'first' ? r.day <= 15 : half === 'second' ? r.day >= 16 : true));
  const split = periodText.indexOf(' of ') + 4;

  return (
    <article className="dtr-form">
      <p className="csf">Civil Service Form No. 48</p>
      <h2 className="title">DAILY TIME RECORD</h2>
      <p className="divider">-----o0o-----</p>

      <div className="name-line">{name}</div>
      <p className="caption">(Name)</p>

      <table className="meta">
        <tbody>
          <tr>
            <td className="label" colSpan={2}>{periodText.slice(0, split)}</td>
            <td className="line" colSpan={2}>{periodText.slice(split)}</td>
          </tr>
          <tr>
            <td className="official" rowSpan={2}>Official hours for arrival and departure</td>
            <td className="label right">Regular days</td>
            <td className="line" colSpan={2}>{officialHours}</td>
          </tr>
          <tr>
            <td className="label right">Saturdays</td>
            <td className="line" colSpan={2}></td>
          </tr>
        </tbody>
      </table>

      <table className="grid">
        <colgroup>
          <col style={{ width: '10.16%' }} />
          {[0, 1, 2, 3, 4].map((i) => <col key={i} style={{ width: '15.625%' }} />)}
          <col style={{ width: '11.72%' }} />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2} className="day sep">Day</th>
            <th colSpan={2} className="group sep">A.M.</th>
            <th colSpan={2} className="group sep">P.M.</th>
            <th colSpan={2} className="group">Undertime</th>
          </tr>
          <tr className="sub">
            <th>Arrival</th>
            <th className="sep">Depar-ture</th>
            <th>Arrival</th>
            <th className="sep">Depar-ture</th>
            <th>Hours</th>
            <th>Min-utes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.day} data-day={r.day}>
              <td className="day sep">
                {onDayClick && dayName(r.day) ? (
                  <button type="button" className="day-btn" aria-label={`Adjust ${dayName(r.day)}`} onClick={() => onDayClick(r.day)}>
                    {r.day}
                  </button>
                ) : r.day}
              </td>
              {r.label ? (
                <td colSpan={4} className="label-cell sep">{r.label}</td>
              ) : (
                <>
                  <td className={cls(r, 'amIn')}>{r.amIn}</td>
                  <td className={cls(r, 'amOut', 'sep')}>{r.amOut}</td>
                  <td className={cls(r, 'pmIn')}>{r.pmIn}</td>
                  <td className={cls(r, 'pmOut', 'sep')}>{r.pmOut}</td>
                </>
              )}
              <td>{hours(r.undertime)}</td>
              <td>{mins(r.undertime)}</td>
            </tr>
          ))}
          <tr className="total">
            <td colSpan={5}>
              <div className="total-line">
                <span>Total</span>
                <span className="days">{result.days} days</span>
              </div>
            </td>
            <td>{hours(result.totalUndertime)}</td>
            <td>{mins(result.totalUndertime)}</td>
          </tr>
        </tbody>
      </table>

      <p className="certify">
        I certify on my honor that the above is a true and correct report of the hours of work performed,
        record of which was made daily at the time of arrival and departure from office.
      </p>

      <div className="sign-line">{name}</div>
      <p className="caption">SIGNATURE OVER PRINTED NAME</p>

      <p className="verified">VERIFIED as to the prescribed office hours:</p>

      <div className="sign-line in-charge-name">{inCharge}</div>
      <p className="caption in-charge">In Charge</p>
    </article>
  );
}
