// Token Counter — checkbox tree with token counts and cost footer.

function TokenCounterTool({ showToast }) {
  const STORAGE_KEY = 'tokenCounterPath';
  const [path, setPath]               = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
  });
  const [tree, setTree]               = useState(null);
  const [hasLoaded, setHasLoaded]     = useState(false);
  const [error, setError]             = useState(null);
  const [loading, setLoading]         = useState(false);

  const [selection, setSelection]     = useState(() => {
    try {
      const raw = localStorage.getItem('tokenCounterSelection');
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  });
  const [contextWindow, setContextWindow] = useState(() => {
    const raw = parseInt(localStorage.getItem('tokenCounterContextWindow') || '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 200000;
  });
  const [pricing, setPricing]         = useState([]);
  const [visibleModels, setVisibleModels] = useState([]);

  useEffect(() => {
    try { localStorage.setItem('tokenCounterSelection', JSON.stringify([...selection])); } catch {}
  }, [selection]);
  useEffect(() => {
    try { localStorage.setItem('tokenCounterContextWindow', String(contextWindow)); } catch {}
  }, [contextWindow]);

  function loadTree(p) {
    setLoading(true); setError(null);
    fetch('/api/tokentree?path=' + encodeURIComponent(p))
      .then(r => r.json())
      .then(data => {
        if (data && data.error) {
          setError("Couldn't load — check the path");
          setTree(null);
        } else {
          setTree(data);
          setHasLoaded(true);
        }
      })
      .catch(() => setError("Couldn't load — check the path"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (path) loadTree(path);
    Promise.all([
      fetch('/api/model-pricing').then(r => r.ok ? r.json() : { prices: [] }),
      fetch('/api/settings').then(r => r.ok ? r.json() : {})
    ]).then(([p, s]) => {
      setPricing(Array.isArray(p?.prices) ? p.prices : []);
      setVisibleModels(Array.isArray(s?.visibleModels) ? s.visibleModels : []);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onLoad(p) { setPath(p); loadTree(p); }

  function clearAll() { setSelection(new Set()); }

  // Sum tokens of files whose effective selection is true. No double counting.
  const selectedTokens = useMemo(() => {
    if (!tree) return 0;
    function walk(node, inherited) {
      const on = inherited || selection.has(node.path);
      if (node.type === 'file') return on ? (node.tokens || 0) : 0;
      let t = 0;
      for (const c of (node.children || [])) t += walk(c, on);
      return t;
    }
    let total = 0;
    for (const c of (tree.children || [])) total += walk(c, false);
    return total;
  }, [tree, selection]);

  const pct = contextWindow > 0 ? (selectedTokens / contextWindow) * 100 : 0;
  const overflow = pct > 100;

  return (
    <div className="tools-tool-body">
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
          <div className="tools-token-toolbar">
            <span className="tools-token-toolbar-label">workspace total</span>
            <span className="tools-token-toolbar-val">{(tree?.tokens || 0).toLocaleString()} tok</span>
            <div className="spacer"></div>
            <button className="tools-side-action" onClick={() => path && loadTree(path)}>↻ rescan</button>
            <button className="tools-side-action" onClick={clearAll}
                    disabled={selection.size === 0}>clear</button>
          </div>

          <div className="tools-token-body">
            <div className="tools-tree-panel">
              {loading ? (
                <div className="tools-loading">Counting tokens…</div>
              ) : !tree ? (
                <div className="tools-loading">No data.</div>
              ) : (
                <FileTree
                  tree={tree}
                  mode="select"
                  state={selection}
                  onStateChange={setSelection}
                  showTokens
                />
              )}
            </div>

            <div className="tools-token-footer">
              <div className="tools-token-selected">
                <span className="label">selected · </span>
                <span>{selectedTokens.toLocaleString()}</span>
                <span className="label"> tok</span>
              </div>

              <div className="tools-token-window-row">
                <span className="label">context window:</span>
                <input
                  type="number"
                  className="tools-token-window-input"
                  value={contextWindow}
                  min={1}
                  onChange={e => {
                    const v = parseInt(e.target.value, 10);
                    setContextWindow(Number.isFinite(v) && v > 0 ? v : 1);
                  }}
                />
                <span className="label">tok</span>
                <span className={'tools-token-pct' + (overflow ? ' overflow' : '')}>
                  {pct.toFixed(1)}%
                </span>
              </div>

              <CostFooter
                tokens={selectedTokens}
                pricing={pricing}
                visibleModels={visibleModels}
                hideTotal
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
