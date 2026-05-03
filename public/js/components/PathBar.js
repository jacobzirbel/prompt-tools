// Shared path input bar — pre-fills from localStorage, fires onLoad with new path.
// Props: { storageKey, placeholder, error, onLoad }
function PathBar({ storageKey, placeholder, error, onLoad }) {
  const [val, setVal] = useState(() => {
    try { return localStorage.getItem(storageKey) || ''; }
    catch { return ''; }
  });

  function submit() {
    const p = val.trim();
    if (!p) return;
    try { localStorage.setItem(storageKey, p); } catch {}
    onLoad(p);
  }

  return (
    <div className="path-bar">
      <input
        className="path-bar-input"
        placeholder={placeholder || '/absolute/path/to/workspace'}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
      />
      <button className="btn btn-primary" onClick={submit} disabled={!val.trim()}>
        Load
      </button>
      {error && <span className="path-bar-error">{error}</span>}
    </div>
  );
}

// Hook: manages path state synced to localStorage. Returns { path, setPath, hasInitial }.
function useStoredPath(storageKey) {
  const initial = (() => {
    try { return localStorage.getItem(storageKey) || ''; }
    catch { return ''; }
  })();
  const [path, setPath] = useState(initial);
  return { path, setPath, hasInitial: !!initial };
}
