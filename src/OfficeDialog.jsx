import { useRef, useState } from 'react';
import useDialogKeys from './useDialogKeys.js';

// onArchive and onDelete close this dialog first; delete then asks for confirmation.
export default function OfficeDialog({ office, settings, onSave, onCancel, onArchive, onDelete }) {
  const [inCharge, setInCharge] = useState(settings.inCharge ?? '');
  const [grace, setGrace] = useState(String(settings.graceMinutes ?? 15));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const first = useRef(null);

  useDialogKeys(first, onCancel, busy);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave({ inCharge, graceMinutes: grace });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="backdrop">
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="office-title" onSubmit={submit}>
        <h2 id="office-title">Office settings — {office}</h2>
        <label className="field">
          <span>In-charge name</span>
          <input ref={first} value={inCharge} maxLength={100} onChange={(e) => setInCharge(e.target.value)} />
        </label>
        <label className="field">
          <span>Grace minutes</span>
          <input inputMode="numeric" value={grace} onChange={(e) => setGrace(e.target.value)} />
        </label>
        {error && <p className="err" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" onClick={onArchive} disabled={busy}>Archive office</button>
          <button type="button" className="danger" onClick={onDelete} disabled={busy}>Delete office</button>
          <span className="spacer" />
          <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
