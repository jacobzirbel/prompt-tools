// Tools — picker shell.

const TOOLS = [
  { id: 'glob-builder',  label: 'Glob Builder' },
  { id: 'token-counter', label: 'Token Counter' },
];

function ToolsPage({ showToast }) {
  const [activeTool, setActiveTool] = useState(() => {
    return localStorage.getItem('toolsActiveTool') || TOOLS[0].id;
  });

  function selectTool(id) {
    setActiveTool(id);
    try { localStorage.setItem('toolsActiveTool', id); } catch {}
  }

  return (
    <div className="tools-page">
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
      {activeTool === 'glob-builder'  && <GlobBuilderTool  showToast={showToast} />}
      {activeTool === 'token-counter' && <TokenCounterTool showToast={showToast} />}
    </div>
  );
}
