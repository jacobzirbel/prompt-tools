// Pure utilities + shared React hook destructuring.

const { useState, useEffect, useMemo, useCallback, useRef } = React;

function countTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function extractSection(content, sectionId) {
  const re = new RegExp(`## ${sectionId}\\n([\\s\\S]*?)(?=\\n## |$)`);
  const m = content.match(re);
  return m ? m[1].trim() : null;
}

function formatCost(n) {
  if (n === 0) return '$0';
  if (n < 0.0001) return '<$0.0001';
  if (n < 0.01) return '$' + n.toFixed(4);
  return '$' + n.toFixed(2);
}

const ROUTES = ['builder', 'tools', 'settings'];

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  return ROUTES.includes(raw) ? raw : 'builder';
}
