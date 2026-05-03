// Glob Builder — assign files to legacy/modern, generate consolidated globs.

function GlobBuilderTool({ workspacePath, showToast }) {
  const [tree, setTree]               = useState(null);
  const [loading, setLoading]         = useState(false);
  const [assignments, setAssignments] = useState(() => {
    try {
      const raw = localStorage.getItem('toolsAssignments');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const [extensions, setExtensions]   = useState(() => {
    try {
      const raw = localStorage.getItem('toolsExtensions');
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) && parsed.length ? parsed : ['.ts', '.html'];
    } catch { return ['.ts', '.html']; }
  });
  const [extInput, setExtInput]       = useState('');
  const [copiedKey, setCopiedKey]     = useState(null);

  useEffect(() => {
    try { localStorage.setItem('toolsExtensions', JSON.stringify(extensions)); } catch {}
  }, [extensions]);
  useEffect(() => {
    try { localStorage.setItem('toolsAssignments', JSON.stringify(assignments)); } catch {}
  }, [assignments]);

  function loadTree(p) {
    if (!p) return;
    setLoading(true);
    fetch('/api/filetree?path=' + encodeURIComponent(p))
      .then(r => r.json())
      .then(data => {
        if (data && data.error) { setTree(null); }
        else { setTree(data); }
      })
      .catch(() => setTree(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadTree(workspacePath); }, [workspacePath]);

  function addExtension() {
    let v = extInput.trim();
    if (!v) return;
    if (!v.startsWith('.')) v = '.' + v;
    if (extensions.includes(v)) { setExtInput(''); return; }
    setExtensions([...extensions, v]);
    setExtInput('');
  }
  function removeExtension(e) { setExtensions(extensions.filter(x => x !== e)); }

  function fileMatches(node) {
    return extensions.some(ext => node.name.endsWith(ext));
  }

  // ── Glob output ──
  const globsByExt = useMemo(() => {
    if (!tree) return {};

    function getEff(p) {
      if (assignments[p]) return assignments[p];
      const parts = p.split('/');
      for (let i = parts.length - 1; i > 0; i--) {
        const parent = parts.slice(0, i).join('/');
        if (assignments[parent]) return assignments[parent];
      }
      return 'legacy';
    }
    function countExtIn(node, ext) {
      if (node.type === 'file') return node.name.endsWith(ext) ? 1 : 0;
      return (node.children || []).reduce((s, c) => s + countExtIn(c, ext), 0);
    }
    function countMatchedIn(node, ext, matchSet) {
      if (node.type === 'file') return matchSet.has(node.path) ? 1 : 0;
      return (node.children || []).reduce((s, c) => s + countMatchedIn(c, ext, matchSet), 0);
    }
    function consolidate(node, ext, matchSet) {
      if (node.type === 'file') {
        if (!node.name.endsWith(ext)) return [];
        return matchSet.has(node.path) ? [{ glob: node.path, count: 1 }] : [];
      }
      const total = countExtIn(node, ext);
      if (total === 0) return [];
      const matched = countMatchedIn(node, ext, matchSet);
      if (matched === 0) return [];
      if (matched === total) {
        return [{ glob: (node.path ? node.path + '/' : '') + '**/*' + ext, count: matched }];
      }
      return (node.children || []).flatMap(c => consolidate(c, ext, matchSet));
    }

    const out = {};
    for (const ext of extensions) {
      out[ext] = { legacy: [], modern: [] };
      for (const side of ['legacy', 'modern']) {
        const matchSet = new Set();
        function collect(node) {
          if (node.type === 'file') {
            if (node.name.endsWith(ext) && getEff(node.path) === side) matchSet.add(node.path);
          } else for (const c of (node.children || [])) collect(c);
        }
        for (const c of (tree.children || [])) collect(c);
        if (matchSet.size === 0) continue;
        for (const c of (tree.children || [])) {
          out[ext][side].push(...consolidate(c, ext, matchSet));
        }
      }
    }
    return out;
  }, [tree, assignments, extensions]);

  function copyExtSide(ext, side) {
    const list = globsByExt[ext]?.[side] || [];
    if (!list.length) return;
    navigator.clipboard.writeText(list.map(g => g.glob).join(','))
      .then(() => showToast(`${side} ${ext} copied (${list.length} glob${list.length === 1 ? '' : 's'})`))
      .catch(() => showToast('Copy failed'));
  }
  async function copyGlob(key, glob) {
    try {
      await navigator.clipboard.writeText(glob);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(k => k === key ? null : k), 1100);
    } catch { showToast('Copy failed'); }
  }
  function clearSide(side) {
    setAssignments(prev => {
      const next = {};
      for (const k of Object.keys(prev)) if (prev[k] !== side) next[k] = prev[k];
      return next;
    });
  }

  return (
    <div className="tools-tool-body">
      <div className="tools-extensions">
        <span className="tools-ext-label">extensions</span>
        {extensions.map(ext => (
          <span key={ext} className="tools-ext-pill">
            {ext}
            <button className="tools-ext-x" title="Remove" onClick={() => removeExtension(ext)}>✕</button>
          </span>
        ))}
        <input
          className="tools-ext-input"
          placeholder="add ext (.tsx)"
          value={extInput}
          onChange={e => setExtInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExtension(); } }}
        />
      </div>

      <div className="tools-body">
        <div className="tools-tree-panel">
          {loading ? (
            <div className="tools-loading">Loading workspace…</div>
          ) : !tree ? (
            <div className="tools-loading">No data.</div>
          ) : (
            <FileTree
              tree={tree}
              mode="assign"
              state={assignments}
              onStateChange={setAssignments}
              filter={fileMatches}
            />
          )}
        </div>

        <div className="tools-output-panel">
          <div className="tools-ext-grid-header">
            <div className="tools-ext-grid-ext-col"></div>
            <div className="tools-ext-grid-side-col tools-side-legacy-label">legacy</div>
            <div className="tools-ext-grid-side-col tools-side-modern-label">modern</div>
          </div>
          {extensions.map(ext => (
            <div key={ext} className="tools-ext-row">
              <div className="tools-ext-row-label">{ext}</div>
              {['legacy', 'modern'].map(side => {
                const list = globsByExt[ext]?.[side] || [];
                return (
                  <div key={side} className={'tools-ext-cell tools-ext-cell-' + side}>
                    {list.length === 0 ? (
                      <div className="tools-glob-empty-cell">—</div>
                    ) : (
                      <>
                        <button
                          className="tools-copy-ext-btn"
                          title={`Copy all ${side} ${ext} globs`}
                          onClick={() => copyExtSide(ext, side)}>
                          copy {list.length > 1 ? `(${list.length})` : ''}
                        </button>
                        {list.map((g, i) => {
                          const key = side + ':' + ext + ':' + i;
                          const flashed = copiedKey === key;
                          return (
                            <button key={key}
                                    className={'tools-glob-chip' + (flashed ? ' copied' : '')}
                                    title="Click to copy"
                                    onClick={() => copyGlob(key, g.glob)}>
                              <span className="tools-glob-text">{g.glob}</span>
                              <span className="tools-glob-count">{g.count}</span>
                              {flashed && <span className="tools-glob-flash">✓</span>}
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          <div className="tools-output-actions">
            <button className="tools-side-action"
                    disabled={!Object.values(assignments).includes('modern')}
                    onClick={() => clearSide('modern')}>clear modern</button>
          </div>
        </div>
      </div>
    </div>
  );
}
