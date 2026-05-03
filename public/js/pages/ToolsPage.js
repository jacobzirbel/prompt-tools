// Tools — workspace picker + tool picker shell.

const TOOLS = [
  { id: 'glob-builder',    label: 'Glob Builder' },
  { id: 'token-counter',   label: 'Token Counter' },
  { id: 'context-auditor', label: 'Context Auditor' },
];

function ToolsPage({ showToast }) {
  const [workspaces, setWorkspaces]   = useState([]);
  const [activeWsId, setActiveWsId]   = useState(() => {
    try { return localStorage.getItem('activeWorkspaceId') || ''; } catch { return ''; }
  });
  const [activeTool, setActiveTool]   = useState(() => {
    return localStorage.getItem('toolsActiveTool') || TOOLS[0].id;
  });

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.ok ? r.json() : {})
      .then(s => {
        const ws = Array.isArray(s.workspaces) ? s.workspaces : [];
        setWorkspaces(ws);
        // Validate stored ID still exists; fall back to first
        setActiveWsId(prev => {
          const valid = ws.find(w => w.id === prev);
          const next = valid ? prev : (ws[0]?.id || '');
          try { localStorage.setItem('activeWorkspaceId', next); } catch {}
          return next;
        });
      })
      .catch(() => {});
  }, []);

  function selectWorkspace(id) {
    setActiveWsId(id);
    try { localStorage.setItem('activeWorkspaceId', id); } catch {}
  }

  function selectTool(id) {
    setActiveTool(id);
    try { localStorage.setItem('toolsActiveTool', id); } catch {}
  }

  const activeWorkspace = workspaces.find(w => w.id === activeWsId);
  const workspacePath   = activeWorkspace?.path || '';

  return (
    <div className="tools-page">
      <div className="tools-workspace-bar">
        {workspaces.length === 0 ? (
          <span className="tools-workspace-empty">
            No workspaces configured — add one in Settings.
          </span>
        ) : (
          <select
            className="tools-picker-select"
            value={activeWsId}
            onChange={e => selectWorkspace(e.target.value)}>
            {workspaces.map(w => (
              <option key={w.id} value={w.id}>{w.name || w.path}</option>
            ))}
          </select>
        )}
      </div>

      {workspaces.length > 0 && (
        <>
          <div className="tools-picker-bar">
            <select
              className="tools-picker-select"
              value={activeTool}
              onChange={e => selectTool(e.target.value)}>
              {TOOLS.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
          {activeTool === 'glob-builder'    && <GlobBuilderTool    workspacePath={workspacePath} showToast={showToast} />}
          {activeTool === 'token-counter'   && <TokenCounterTool   workspacePath={workspacePath} showToast={showToast} />}
          {activeTool === 'context-auditor' && <ContextAuditorTool workspacePath={workspacePath} showToast={showToast} />}
        </>
      )}
    </div>
  );
}
