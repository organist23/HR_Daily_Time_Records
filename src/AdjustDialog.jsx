import { useRef, useState } from 'react';
import useDialogKeys from './useDialogKeys.js';
import { formatTime } from './lib/dtr.js';

const FIELDS = [['am', 'in', 'A.M. arrival'], ['am', 'out', 'A.M. departure'], ['pm', 'in', 'P.M. arrival'], ['pm', 'out', 'P.M. departure']];

// device / current: { am: { in, out }, pm: { in, out } } as HH:MM or ''. last: { reason, at } of the stored adjustment.
export default function AdjustDialog({ dateLabel, device, current, last, onSave, onRevert, onCancel }) {
  const [values, setValues] = useState(current);
  const [reason, setReason] = useState(last?.reason ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const first = useRef(null);
  useDialogKeys(first, onCancel, busy);

  const run = async (action) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const set = (s, f, v) => setValues({ ...values, [s]: { ...values[s], [f]: v } });

  return (
    <div className="backdrop">
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adjust-title"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => onSave({ ...values, reason }));
        }}
      >
        <h2 id="adjust-title">Adjust time — {dateLabel}</h2>
        <p className="muted">Leave a time empty to clear it. Device punches are kept and can be restored.</p>
        <div className="time-grid">
          {FIELDS.map(([s, f, label], i) => (
            <label key={label} className="field">
              <span>{label}</span>
              <input ref={i === 0 ? first : null} type="time" value={values[s][f]} onChange={(e) => set(s, f, e.target.value)} />
              <small className="muted">Device: {device[s][f] ? formatTime(device[s][f]) : 'none'}</small>
            </label>
          ))}
        </div>
        <label className="field">
          <span>Reason</span>
          <input value={reason} maxLength={200} placeholder="e.g. Work from home, official business" onChange={(e) => setReason(e.target.value)} />
        </label>
        {last && (
          <p className="muted">Adjusted {new Date(last.at).toLocaleString()} — {last.reason}</p>
        )}
        {error && <p className="err" role="alert">{error}</p>}
        <div className="actions">
          {last && (
            <button type="button" className="danger" disabled={busy} onClick={() => run(onRevert)}>
              Revert to device times
            </button>
          )}
          <span className="spacer" />
          <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
