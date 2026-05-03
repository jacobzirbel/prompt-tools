// Context — instruction file context manager.

function _singleGlobOverlap(a, b) {
  const universal = ['**', '**/*', '*'];
  if (universal.includes(a) || universal.includes(b)) return true;
  function extOf(g) { const m = g.match(/\*\.(\w+)$/); return m ? m[1].toLowerCase() : null; }
  const extA = extOf(a), extB = extOf(b);
  if (extA && extB) return extA === extB;
  return true;
}

function globsOverlap(a, b) {
  if (!a) return false;
  if (!b) return true;
  const partsA = a.split(',').map(s => s.trim()).filter(Boolean);
  const partsB = b.split(',').map(s => s.trim()).filter(Boolean);
  return partsA.some(pa => partsB.some(pb => _singleGlobOverlap(pa, pb)));
}

function ContextPage({ showToast }) {
  const STORAGE_KEY = 'contextPath';
  const [path, setPath]               = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
  });
  const [files, setFiles]             = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [scannedAt, setScannedAt]     = useState(null);
  const [hasLoaded, setHasLoaded]     = useState(false);
  const [contextGlobs, setContextGlobs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('contextGlobs')) || []; }
    catch { return []; }
  });
  const [globInput, setGlobInput]     = useState('');
  const [pricing, setPricing]         = useState([]);
  const [visibleModels, setVisibleModels] = useState([]);

  useEffect(() => {
    try { localStorage.setItem('contextGlobs', JSON.stringify(contextGlobs)); } catch {}
  }, [contextGlobs]);

  useEffect(() => {
    Promise.all([
      fetch('/api/model-pricing').then(r => r.ok ? r.json() : { prices: [] }),
      fetch('/api/settings').then(r => r.ok ? r.json() : {})
    ]).then(([p, s]) => {
      setPricing(Array.isArray(p?.prices) ? p.prices : []);
      setVisibleModels(Array.isArray(s?.visibleModels) ? s.visibleModels : []);
    }).catch(() => {});
  }, []);

  function loadInstructions(p) {
    setLoading(true);
    setError(null);
    fetch('/api/instructions?path=' + encodeURIComponent(p))
      .then(r => r.json())
      .then(data => {
        if (data && data.error) {
          setError("Couldn't load — check the path");
          setFiles([]);
          setScannedAt(null);
        } else {
          setFiles(Array.isArray(data?.files) ? data.files : []);
          setScannedAt(data?.scannedAt || null);
          setHasLoaded(true);
        }
      })
      .catch(() => setError("Couldn't load — check the path"))
      .finally(() => setLoading(false));
  }

  // Auto-fetch on mount if path saved
  useEffect(() => {
    if (path) loadInstructions(path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onLoad(p) {
    setPath(p);
    loadInstructions(p);
  }

  function fmtScannedAt(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function addGlob() {
    const p = globInput.trim();
    if (!p) return;
    if (contextGlobs.some(g => g.pattern === p)) { setGlobInput(''); return; }
    setContextGlobs(prev => [...prev, { pattern: p, active: true }]);
    setGlobInput('');
  }
  function toggleGlob(pattern) {
    setContextGlobs(prev => prev.map(g => g.pattern === pattern ? { ...g, active: !g.active } : g));
  }
  function removeGlob(pattern) {
    setContextGlobs(prev => prev.filter(g => g.pattern !== pattern));
  }

  const totalTokens   = files.reduce((s, f) => s + (f.tokens || 0), 0);
  const anyGlobActive = contextGlobs.some(g => g.active);
  const matchedTokens = anyGlobActive
    ? files
        .filter(f => contextGlobs.some(g => g.active && globsOverlap(f.applyTo, g.pattern)))
        .reduce((s, f) => s + (f.tokens || 0), 0)
    : 0;
  const costTokens = anyGlobActive ? matchedTokens : totalTokens;

  return (
    <div className="context-page">
      <PathBar
        storageKey={STORAGE_KEY}
        placeholder="/absolute/path/to/workspace"
        error={error}
        onLoad={onLoad}
      />

      {!hasLoaded && !loading && !error && (
        <div className="path-empty">Enter a workspace path above and hit Load.</div>
      )}

      {(hasLoaded || loading) && (
        <>
          <div className="ctx-scan-bar">
            <button className="btn btn-ghost"
                    onClick={() => path && loadInstructions(path)}
                    disabled={loading || !path}>
              {loading ? 'Scanning…' : '↻ Refresh'}
            </button>
            {scannedAt && (
              <span className="ctx-scanned-at">scanned {fmtScannedAt(scannedAt)}</span>
            )}
          </div>

          <div className="context-list">
            {!loading && files.length === 0 && (
              <div className="ctx-empty-state">
                No instruction files found at this path.
              </div>
            )}
            {files.length > 0 && (
              <div className="ctx-location-group">
                <div className="ctx-location-header">Workspace</div>
                {files.map(f => {
                  const matchClass = anyGlobActive
                    ? (contextGlobs.some(g => g.active && globsOverlap(f.applyTo, g.pattern))
                        ? ' matched' : ' unmatched')
                    : '';
                  return (
                    <div key={f.path} className={'ctx-file-card' + matchClass}>
                      {f.applyTo ? (
                        <span className="ctx-applyto-pill">{f.applyTo}</span>
                      ) : (
                        <span className="ctx-applyto-none">no applyTo</span>
                      )}
                      <span className="ctx-file-name" title={f.source || f.path}>{f.name}</span>
                      <span className="ctx-file-tokens">{(f.tokens || 0).toLocaleString()} tok</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {files.length > 0 && (
            <div className="ctx-glob-section">
              <div className="ctx-glob-header">context globs</div>
              <div className="ctx-glob-input-row">
                <input
                  className="ctx-glob-input"
                  placeholder="e.g. src/**/*.tsx"
                  value={globInput}
                  onChange={e => setGlobInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGlob(); } }}
                />
                <button className="btn btn-primary" onClick={addGlob} disabled={!globInput.trim()}>
                  Add
                </button>
              </div>
              {contextGlobs.length > 0 && (
                <div className="ctx-glob-list">
                  {contextGlobs.map(g => (
                    <div key={g.pattern} className="ctx-glob-row">
                      <span className="ctx-glob-pattern">{g.pattern}</span>
                      <button
                        className={'ctx-glob-toggle' + (g.active ? ' active' : '')}
                        onClick={() => toggleGlob(g.pattern)}>
                        {g.active ? 'active' : 'off'}
                      </button>
                      <button className="icon-btn delete" title="Remove"
                              onClick={() => removeGlob(g.pattern)}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {files.length > 0 && (
            <CostFooter
              tokens={costTokens}
              pricing={pricing}
              visibleModels={visibleModels}
              totalLabel={anyGlobActive ? 'matched' : 'context'}
            />
          )}
        </>
      )}
    </div>
  );
}
