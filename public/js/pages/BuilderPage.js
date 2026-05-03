// Builder — prompt composition scratchpad. No conversation logging.

function BuilderPage({ showToast }) {
  const [agents, setAgents]                 = useState([]);
  const [agentType, setAgentType]           = useState(null);
  const [defaultAgent, setDefaultAgent]     = useState(null);
  const [values, setValues]                 = useState({});
  const [activeSwitches, setActiveSwitches] = useState(new Set());
  const [pastFor, setPastFor]               = useState(null);
  const [pastEntries, setPastEntries]       = useState({}); // cache by `${agentType}:${fieldId}`

  // Load agents + default agent
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/config/agents').then(r => r.json()),
      fetch('/api/settings').then(r => r.json())
    ]).then(([list, settings]) => {
      if (cancelled) return;
      setAgents(Array.isArray(list) ? list : []);
      const def = settings?.defaultAgent;
      setDefaultAgent(def);
      const pick = (Array.isArray(list) && list.find(a => a.agentType === def))
        ? def
        : (Array.isArray(list) && list[0] ? list[0].agentType : null);
      setAgentType(pick);
    }).catch(() => showToast('Failed to load agents'));
    return () => { cancelled = true; };
  }, [showToast]);

  const currentAgent = agents.find(a => a.agentType === agentType);

  const visibleFields = useMemo(() => {
    if (!currentAgent) return [];
    const seen = new Set();
    const out = [];
    (currentAgent.alwaysShown || []).forEach(f => {
      if (!seen.has(f.id)) { seen.add(f.id); out.push(f); }
    });
    (currentAgent.switches || []).forEach(sw => {
      if (activeSwitches.has(sw.id)) {
        (sw.reveals || []).forEach(f => {
          if (!seen.has(f.id)) { seen.add(f.id); out.push(f); }
        });
      }
    });
    return out;
  }, [currentAgent, activeSwitches]);

  const assembled = useMemo(() => {
    if (!currentAgent) return '';
    const parts = [];
    visibleFields.forEach(f => {
      const v = (values[f.id] || '').trim();
      if (v) parts.push(`## ${f.id}\n${v}`);
    });
    return parts.join('\n\n');
  }, [values, visibleFields, currentAgent]);

  const promptTokens = countTokens(assembled);

  function onAgentChange(e) {
    setAgentType(e.target.value);
    setActiveSwitches(new Set());
    setPastFor(null);
  }

  function toggleSwitch(id) {
    setActiveSwitches(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function onFieldChange(id, val) {
    setValues(v => ({ ...v, [id]: val }));
  }

  async function copyPrompt() {
    if (!assembled.trim()) { showToast('Fill in at least one section first.'); return; }
    try {
      await navigator.clipboard.writeText(assembled);
      showToast('Copied ✓');
    } catch {
      showToast('Copy failed');
    }
  }

  function openPast(fieldId) {
    if (pastFor === fieldId) { setPastFor(null); return; }
    setPastFor(fieldId);
    const cacheKey = `${agentType}:${fieldId}`;
    if (pastEntries[cacheKey]) return;
    fetch('/api/conversations')
      .then(r => r.json())
      .then(summaries => Promise.all(
        (Array.isArray(summaries) ? summaries : [])
          .filter(c => c.agentType === agentType)
          .map(c => fetch(`/api/conversations/${c.id}`).then(r => r.ok ? r.json() : null).catch(() => null))
      ))
      .then(details => {
        const out = [];
        (details || []).forEach(d => {
          if (!d) return;
          const userMsgs = (d.messages || []).filter(m => m.role === 'user');
          for (let i = userMsgs.length - 1; i >= 0; i--) {
            const content = extractSection(userMsgs[i].content, fieldId);
            if (content) {
              out.push({ convoName: d.name, timestamp: userMsgs[i].timestamp, content });
              break;
            }
          }
        });
        out.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setPastEntries(p => ({ ...p, [cacheKey]: out }));
      })
      .catch(() => setPastEntries(p => ({ ...p, [cacheKey]: [] })));
  }

  return (
    <div id="builder">
      <div id="builder-scroll">
        <div id="agent-row">
          <select className="agent-select"
                  value={agentType || ''}
                  onChange={onAgentChange}
                  disabled={!agents.length}>
            {agents.map(a => (
              <option key={a.agentType} value={a.agentType}>{a.label}</option>
            ))}
          </select>
          <span className="agent-desc">{currentAgent?.desc || ''}</span>
        </div>

        {currentAgent?.switches?.length > 0 && (
          <div id="switches-row">
            {currentAgent.switches.map(sw => {
              const isOn = activeSwitches.has(sw.id);
              return (
                <button key={sw.id}
                        className={'switch-btn' + (isOn ? ' active' : '')}
                        title={sw.hint}
                        onClick={() => toggleSwitch(sw.id)}>
                  <span>{sw.emoji}</span>
                  <span className="switch-label">{sw.label}</span>
                  <span className="switch-count">· {sw.reveals.length}</span>
                </button>
              );
            })}
          </div>
        )}

        {visibleFields.map(f => {
          const isOpen = pastFor === f.id;
          const cacheKey = `${agentType}:${f.id}`;
          const entries = pastEntries[cacheKey];
          return (
            <div key={f.id} className="section-field">
              <div className="section-label-row">
                <span className="section-label">## {f.id}</span>
                <button className="past-link" onClick={() => openPast(f.id)}>
                  {isOpen ? '↓ hide past' : '↑ past entries'}
                </button>
              </div>
              <span className="section-hint">{f.hint}</span>
              <textarea
                rows={3}
                placeholder={f.hint}
                value={values[f.id] || ''}
                onChange={e => onFieldChange(f.id, e.target.value)}
              />
              {isOpen && (
                <div className="past-panel">
                  {entries === undefined ? (
                    <div className="past-empty">Loading…</div>
                  ) : entries.length === 0 ? (
                    <div className="past-empty">
                      No past <code>{f.id}</code> entries for {agentType}.
                    </div>
                  ) : entries.map((e, i) => {
                    const t = new Date(e.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })
                      + ' ' + new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    return (
                      <div key={i} className="past-entry">
                        <div className="past-entry-meta">
                          <span>{e.convoName}</span>
                          <span>{t}</span>
                        </div>
                        <div className="past-entry-content">{e.content}</div>
                        <div className="past-entry-actions">
                          <button className="btn btn-ghost"
                                  style={{ fontSize: 11, padding: '3px 10px' }}
                                  onClick={() => { onFieldChange(f.id, e.content); setPastFor(null); }}>
                            Insert
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div id="builder-footer">
        <div id="token-count">
          <span className="label">this prompt · </span>
          <span>{promptTokens.toLocaleString()}</span>
          <span className="label"> tok</span>
        </div>
        <div className="spacer"></div>
        <button className="btn btn-primary" onClick={copyPrompt}>Copy</button>
      </div>
    </div>
  );
}
