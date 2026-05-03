function SettingsPage({ showToast }) {
  const [settings, setSettings] = useState(null);
  const [original, setOriginal] = useState(null);
  const [agents, setAgents]     = useState([]);
  const [pricing, setPricing]   = useState(null);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/config/agents').then(r => r.json())
    ]).then(([s, a]) => {
      if (cancelled) return;
      setSettings(s);
      setOriginal(s);
      setAgents(a);
    }).catch(() => showToast('Failed to load settings'));
    fetch('/api/model-pricing')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(p => { if (!cancelled) setPricing(Array.isArray(p?.prices) ? p.prices : []); })
      .catch(() => { if (!cancelled) setPricing([]); });
    return () => { cancelled = true; };
  }, [showToast]);

  function toggleVisibleModel(label) {
    setSettings(s => {
      const cur = Array.isArray(s.visibleModels) ? s.visibleModels : [];
      const next = cur.includes(label) ? cur.filter(x => x !== label) : [...cur, label];
      return { ...s, visibleModels: next };
    });
  }

  if (!settings) {
    return (
      <div className="settings-page">
        <div className="settings-loading">Loading…</div>
      </div>
    );
  }

  const dirty = JSON.stringify(settings) !== JSON.stringify(original);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (!res.ok) throw new Error('save failed');
      const saved = await res.json();
      setSettings(saved);
      setOriginal(saved);
      showToast('Settings saved ✓');
    } catch {
      showToast('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-scroll">
        <div className="settings-section">
          <label className="settings-label">Default agent</label>
          <p className="settings-hint">Selected when the Builder page loads.</p>
          <select
            className="agent-select"
            value={settings.defaultAgent}
            onChange={e => setSettings(s => ({ ...s, defaultAgent: e.target.value }))}
            disabled={!agents.length}>
            {!agents.find(a => a.agentType === settings.defaultAgent) && (
              <option value={settings.defaultAgent}>{settings.defaultAgent}</option>
            )}
            {agents.map(a => (
              <option key={a.agentType} value={a.agentType}>{a.label}</option>
            ))}
          </select>
        </div>

        <div className="settings-section">
          <label className="settings-label">Cost estimate models</label>
          <p className="settings-hint">Models shown in cost breakdowns across the app.</p>
          {pricing === null ? (
            <div className="settings-loading">Loading…</div>
          ) : pricing.length === 0 ? (
            <div className="settings-muted">Could not load model list.</div>
          ) : (
            <div className="settings-checklist">
              {pricing.map(p => {
                const checked = (settings.visibleModels || []).includes(p.label);
                return (
                  <label key={p.label} className="settings-check-row">
                    <input type="checkbox"
                           checked={checked}
                           onChange={() => toggleVisibleModel(p.label)} />
                    <span>{p.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="settings-footer">
        <span className={'settings-status' + (dirty ? ' dirty' : '')}>
          {dirty ? 'Unsaved changes' : 'Saved'}
        </span>
        <div className="spacer"></div>
        <button className="btn btn-primary"
                onClick={save}
                disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
