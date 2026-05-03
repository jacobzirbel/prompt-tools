// Shared file tree component.
// Props:
//   tree:           { children: [{ name, path, type, tokens?, children? }] }
//   mode:           'assign' (L/M buttons) | 'select' (checkboxes)
//   state:          assignments object { [path]: 'legacy'|'modern' }  OR  Set of selected paths
//   onStateChange:  callback receiving the new state
//   showTokens:     boolean — render token count column
//   filter:         optional (file) => bool, hides files that don't match (used by GlobBuilder ext filter)
function FileTree({ tree, mode, state, onStateChange, showTokens, filter }) {
  const [expanded, setExpanded] = useState(() => new Set());

  function toggleExpand(p) {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(p)) n.delete(p); else n.add(p);
      return n;
    });
  }

  // ── Effective state lookup ──
  function effective(nodePath) {
    if (mode === 'assign') {
      if (state[nodePath]) return state[nodePath];
      const parts = nodePath.split('/');
      for (let i = parts.length - 1; i > 0; i--) {
        const parent = parts.slice(0, i).join('/');
        if (state[parent]) return state[parent];
      }
      return 'legacy';
    }
    // select mode
    if (state.has(nodePath)) return true;
    const parts = nodePath.split('/');
    for (let i = parts.length - 1; i > 0; i--) {
      const parent = parts.slice(0, i).join('/');
      if (state.has(parent)) return true;
    }
    return false;
  }

  function isExplicit(nodePath) {
    if (mode === 'assign') return !!state[nodePath];
    return state.has(nodePath);
  }

  function assign(nodePath, side) {
    const next = { ...state };
    if (next[nodePath] === side) {
      delete next[nodePath];
    } else {
      next[nodePath] = side;
      const prefix = nodePath + '/';
      for (const k of Object.keys(next)) {
        if (k !== nodePath && k.startsWith(prefix)) delete next[k];
      }
    }
    onStateChange(next);
  }

  function toggleSelect(nodePath) {
    const next = new Set(state);
    if (next.has(nodePath)) {
      next.delete(nodePath);
    } else {
      const prefix = nodePath + '/';
      for (const k of [...next]) if (k.startsWith(prefix)) next.delete(k);
      next.add(nodePath);
    }
    onStateChange(next);
  }

  function renderRow(node, depth, isDir, isOpen) {
    const eff = effective(node.path);
    const explicit = isExplicit(node.path);
    let cls = 'tools-row';
    if (mode === 'assign' && eff) {
      cls += ' tools-row-' + eff;
      if (!explicit) cls += ' tools-row-inherited';
    } else if (mode === 'select') {
      cls += ' tools-token-row';
      if (eff) cls += ' tools-token-row-on';
      if (eff && !explicit) cls += ' tools-row-inherited';
    }
    const tok = showTokens ? (node.tokens || 0) : null;
    return (
      <div className={cls}
           key={node.path}
           style={{ paddingLeft: 8 + depth * 14 }}>
        {isDir ? (
          <button className="tools-chev" onClick={() => toggleExpand(node.path)}>
            {isOpen ? '▼' : '▶'}
          </button>
        ) : (
          <span className="tools-chev tools-chev-spacer" />
        )}
        {mode === 'select' && (
          <input
            type="checkbox"
            className="tools-token-check"
            checked={!!eff}
            onChange={() => toggleSelect(node.path)}
            onClick={e => e.stopPropagation()}
          />
        )}
        <span className={'tools-name ' + (isDir ? 'tools-name-dir' : 'tools-name-file')}
              onClick={() => isDir && toggleExpand(node.path)}>
          {isDir ? '📁 ' : ''}{node.name}
        </span>
        {showTokens && (
          <span className="tools-token-tok">{tok.toLocaleString()} tok</span>
        )}
        {mode === 'assign' && (
          <div className="tools-row-actions">
            <button
              className={'tools-lm-btn tools-lm-l' + (eff === 'legacy' ? ' active' : '')}
              title="Assign legacy"
              onClick={e => { e.stopPropagation(); assign(node.path, 'legacy'); }}
            >L</button>
            <button
              className={'tools-lm-btn tools-lm-m' + (eff === 'modern' ? ' active' : '')}
              title="Assign modern"
              onClick={e => { e.stopPropagation(); assign(node.path, 'modern'); }}
            >M</button>
          </div>
        )}
      </div>
    );
  }

  function renderNode(node, depth = 0) {
    if (node.type === 'file') {
      if (filter && !filter(node)) return null;
      return <div key={node.path}>{renderRow(node, depth, false, false)}</div>;
    }
    const childNodes = (node.children || [])
      .map(c => renderNode(c, depth + 1))
      .filter(Boolean);
    if (filter && childNodes.length === 0 && depth > 0) return null;
    const isOpen = expanded.has(node.path);
    return (
      <div key={node.path}>
        {renderRow(node, depth, true, isOpen)}
        {isOpen && <div>{childNodes}</div>}
      </div>
    );
  }

  return (
    <div className="tools-tree">
      {(tree?.children || []).map(c => renderNode(c, 0))}
    </div>
  );
}
