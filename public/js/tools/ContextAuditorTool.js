// Context Auditor — instruction file scanner, driven by workspace path from ToolsPage.

function ContextAuditorTool({ workspacePath, showToast }) {
  const [files, setFiles]             = useState([]);
  const [loading, setLoading]         = useState(false);
  const [scannedAt, setScannedAt]     = useState(null);
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
    if (!p) return;
    setLoading(true);
    fetch('/api/instructions?path=' + encodeURIComponent(p))
      .then(r => r.json())
      .then(data => {
        if (data && data.error) {
          setFiles([]);
          setScannedAt(null);
        } else {
          setFiles(Array.isArray(data?.files) ? data.files : []);
          setScannedAt(data?.scannedAt || null);
        }
      })
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadInstructions(workspacePath); }, [workspacePath]);

  function fmtScannedAt(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
    <div className="tools-tool-body context-page">
      <div className="ctx-scan-bar">
        <button className="btn btn-ghost"
                onClick={() => loadInstructions(workspacePath)}
                disabled={loading || !workspacePath}>
          {loading ? 'Scanning…' : '↻ Refresh'}
        </button>
        {scannedAt && (
          <span className="ctx-scanned-at">scanned {fmtScannedAt(scannedAt)}</span>
        )}
      </div>

      <div className="context-list">
        {!loading && files.length === 0 && (
          <div className="ctx-empty-state">
            No instruction files found in this workspace.
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
    </div>
  );
}
