import { useEffect, useRef, useState } from 'react';

const baseName = (p) => p.split(/[\\/]/).pop();
const stem = (p) => baseName(p).replace(/\.[^.]+$/, '');

export default function ImportDialog({ paths, offices, onImport, onCancel }) {
  const [names, setNames] = useState(() => paths.map(stem));
  const first = useRef(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const submit = (e) => {
    e.preventDefault();
    onImport(paths.map((path, i) => ({ path, office: names[i] })));
  };

  return (
    <div className="backdrop">
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="import-title" onSubmit={submit}>
        <h2 id="import-title">Import Excel files</h2>
        <p className="muted">Choose the office for each file.</p>
        <datalist id="office-list">
          {offices.map((o) => <option key={o} value={o} />)}
        </datalist>
        {paths.map((p, i) => (
          <label key={p} className="file-row">
            <span className="file-name">{baseName(p)}</span>
            <input
              ref={i === 0 ? first : null}
              aria-label={`Office for ${baseName(p)}`}
              list="office-list"
              required
              value={names[i]}
              onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))}
            />
          </label>
        ))}
        <div className="actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary">Import</button>
        </div>
      </form>
    </div>
  );
}
