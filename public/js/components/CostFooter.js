// Shared cost-per-model footer.
// Props: { tokens, pricing, visibleModels, totalLabel, hideTotal }
function CostFooter({ tokens, pricing, visibleModels, totalLabel, hideTotal }) {
  const visiblePrices = (pricing || []).filter(p => (visibleModels || []).includes(p.label));
  return (
    <div className="cost-footer">
      {!hideTotal && (
        <div className="cost-total">
          <span className="label">{totalLabel || 'tokens'} · </span>
          <span>{(tokens || 0).toLocaleString()}</span>
          <span className="label"> tok</span>
        </div>
      )}
      {visiblePrices.map(p => {
        const cost = tokens * (p.input / 1_000_000);
        const cachedCost = typeof p.cachedInput === 'number'
          ? tokens * (p.cachedInput / 1_000_000)
          : null;
        return (
          <div key={p.label} className="cost-row">
            <span className="cost-row-model">{p.label}</span>
            <span className="cost-row-val">{formatCost(cost)}</span>
            {cachedCost !== null && (
              <span className="cost-row-cached">({formatCost(cachedCost)} cached)</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
