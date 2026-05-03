// Token Counter — checkbox tree with token counts and cost footer.

function TokenCounterTool({ workspacePath, showToast }) {
  const [tree, setTree]               = useState(null);
  const [loading, setLoading]         = useState(false);
  const [selection, setSelection]     = useState(() => {
    try {
      const raw = localStorage.getItem('tokenCounterSelection');
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  });
  const [exclusions, setExclusions]   = useState(() => {
    try {
      const raw = localStorage.getItem('tokenCounterExclusions');
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
    try { localStorage.setItem('tokenCounterExclusions', JSON.stringify([...exclusions])); } catch {}
  }, [exclusions]);
  useEffect(() => {
    try { localStorage.setItem('tokenCounterContextWindow', String(contextWindow)); } catch {}
  }, [contextWindow]);

  function loadTree(p) {
    if (!p) return;
    setLoading(true);
    fetch('/api/tokentree?path=' + encodeURIComponent(p))
      .then(r => r.json())
      .then(data => {
        if (data && data.error) { setTree(null); }
        else { setTree(data); }
      })
      .catch(() => setTree(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadTree(workspacePath);
    Promise.all([
      fetch('/api/model-pricing').then(r => r.ok ? r.json() : { prices: [] }),
      fetch('/api/settings').then(r => r.ok ? r.json() : {})
    ]).then(([p, s]) => {
      setPricing(Array.isArray(p?.prices) ? p.prices : []);
      setVisibleModels(Array.isArray(s?.visibleModels) ? s.visibleModels : []);
    }).catch(() => {});
  }, [workspacePath]);

  function getEffective(nodePath) {
    const parts = nodePath.split('/');
    let selected = false;
    for (let i = parts.length; i > 0; i--) {
      const p = parts.slice(0, i).join('/');
      if (exclusions.has(p)) return false;
      if (selection.has(p)) selected = true;
    }
    return selected;
  }

  function toggle(nodePath) {
    const explicitSel  = selection.has(nodePath);
    const explicitExcl = exclusions.has(nodePath);
    const prefix = nodePath + '/';

    if (explicitSel) {
      setSelection(prev => { const n = new Set(prev); n.delete(nodePath); return n; });
      setExclusions(prev => { const n = new Set(prev); for (const k of [...n]) if (k.startsWith(prefix)) n.delete(k); return n; });
    } else if (explicitExcl) {
      setExclusions(prev => { const n = new Set(prev); n.delete(nodePath); for (const k of [...n]) if (k.startsWith(prefix)) n.delete(k); return n; });
    } else if (getEffective(nodePath)) {
      setExclusions(prev => new Set([...prev, nodePath]));
    } else {
      setSelection(prev => { const n = new Set(prev); for (const k of [...n]) if (k.startsWith(prefix)) n.delete(k); n.add(nodePath); return n; });
      setExclusions(prev => { const n = new Set(prev); for (const k of [...n]) if (k.startsWith(prefix)) n.delete(k); return n; });
    }
  }

  function clearAll() {
    setSelection(new Set());
    setExclusions(new Set());
  }

  const selectedTokens = useMemo(() => {
    if (!tree) return 0;
    function walk(node, on, excluded) {
      const selfSel    = selection.has(node.path);
      const selfExcl   = exclusions.has(node.path);
      const nowExcluded = !selfSel && (selfExcl || excluded);
      const nowOn       = selfSel || (on && !nowExcluded);
      const effective   = nowOn && !nowExcluded;
      if (node.type === 'file') return effective ? (node.tokens || 0) : 0;
      let t = 0;
      for (const c of (node.children || [])) t += walk(c, nowOn, nowExcluded);
      return t;
    }
    let total = 0;
    for (const c of (tree.children || [])) total += walk(c, false, false);
    return total;
  }, [tree, selection, exclusions]);

  const pct = contextWindow > 0 ? (selectedTokens / contextWindow) * 100 : 0;
  const overflow = pct > 100;

  return (
    <div className="tools-tool-body">
      <div className="tools-token-toolbar">
        <span className="tools-token-toolbar-label">workspace total</span>
        <span className="tools-token-toolbar-val">{(tree?.tokens || 0).toLocaleString()} tok</span>
        <div className="spacer"></div>
        <button className="tools-side-action" onClick={() => loadTree(workspacePath)}>↻ rescan</button>
        <button className="tools-side-action" onClick={clearAll}
                disabled={selection.size === 0 && exclusions.size === 0}>clear</button>
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
              getEffective={getEffective}
              onToggle={toggle}
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
    </div>
  );
}
