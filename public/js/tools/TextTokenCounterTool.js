// Text Token Counter — paste text, get live token count + cost.

function TextTokenCounterTool({ showToast }) {
  const [text, setText]               = useState('');
  const [tokens, setTokens]           = useState(0);
  const [loading, setLoading]         = useState(false);
  const [pricing, setPricing]         = useState([]);
  const [visibleModels, setVisibleModels] = useState([]);
  const debounceRef = useRef(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/model-pricing').then(r => r.ok ? r.json() : { prices: [] }),
      fetch('/api/settings').then(r => r.ok ? r.json() : {})
    ]).then(([p, s]) => {
      setPricing(Array.isArray(p?.prices) ? p.prices : []);
      setVisibleModels(Array.isArray(s?.visibleModels) ? s.visibleModels : []);
    }).catch(() => {});
  }, []);

  function handleChange(e) {
    const val = e.target.value;
    setText(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      fetch('/api/tokenize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: val })
      })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => setTokens(typeof d.tokens === 'number' ? d.tokens : 0))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 300);
  }

  return (
    <div className="tools-tool-body">
      <textarea
        className="tools-text-input"
        placeholder="Paste or type text here…"
        value={text}
        onChange={handleChange}
      />
      <div className="tools-text-footer">
        <div className="tools-text-token-count">
          {loading
            ? <span className="tools-text-loading">counting…</span>
            : <span>{tokens.toLocaleString()} <span className="label">tok</span></span>
          }
        </div>
        <CostFooter
          tokens={tokens}
          pricing={pricing}
          visibleModels={visibleModels}
          totalLabel="input"
          hideTotal
        />
      </div>
    </div>
  );
}
