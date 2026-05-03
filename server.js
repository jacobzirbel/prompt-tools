const express = require('express');
const fs = require('fs');
const path = require('path');
const fg = require('fast-glob');
const { encode } = require('gpt-tokenizer');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const MODEL_PRICING_FILE = path.join(DATA_DIR, 'model-pricing.json');
const CONVOS_FILE = path.join(DATA_DIR, 'convos.json');

const DEFAULT_SETTINGS = {
  defaultAgent: 'builder',
  visibleModels: ['GPT-4.1', 'Claude Sonnet 4.5'],
  workspaces: []
};

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SETTINGS_FILE)) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Token counting ──
function countTokens(text) {
  try { return encode(text || '').length; }
  catch { return Math.ceil((text || '').length / 4); }
}

// ── Path validation ──
function validPath(p) {
  if (!p || typeof p !== 'string') return null;
  const abs = path.resolve(p);
  try {
    if (!fs.existsSync(abs)) return null;
    if (!fs.statSync(abs).isDirectory()) return null;
    return abs;
  } catch { return null; }
}

// ── Settings ──
app.get('/api/settings', (req, res) => {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    res.json({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
  } catch (e) {
    res.status(500).json({ error: 'Failed to read settings.json', detail: e.message });
  }
});

app.put('/api/settings', (req, res) => {
  const body = req.body || {};
  const next = {
    defaultAgent: typeof body.defaultAgent === 'string' && body.defaultAgent
      ? body.defaultAgent : DEFAULT_SETTINGS.defaultAgent,
    visibleModels: Array.isArray(body.visibleModels)
      ? body.visibleModels.filter(m => typeof m === 'string' && m.trim()).map(m => m.trim())
      : DEFAULT_SETTINGS.visibleModels.slice(),
    workspaces: Array.isArray(body.workspaces)
      ? body.workspaces
          .filter(w => w && typeof w.id === 'string' && typeof w.name === 'string' && typeof w.path === 'string')
          .map(w => ({ id: w.id, name: w.name, path: w.path }))
      : []
  };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
  res.json(next);
});

// ── Agents config ──
app.get('/api/config/agents', (req, res) => {
  try {
    const raw = fs.readFileSync(AGENTS_FILE, 'utf8');
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(500).json({ error: 'Failed to read agents.json', detail: e.message });
  }
});

// ── Model pricing ──
app.get('/api/model-pricing', (req, res) => {
  try {
    const raw = fs.readFileSync(MODEL_PRICING_FILE, 'utf8');
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(500).json({ error: 'Failed to read model-pricing.json', detail: e.message });
  }
});

// ── Conversations (read-only; for past entries lookup in Builder) ──
function readConvos() {
  try { return JSON.parse(fs.readFileSync(CONVOS_FILE, 'utf8')); }
  catch { return []; }
}
app.get('/api/conversations', (req, res) => {
  const convos = readConvos();
  res.json(convos.map(c => ({
    id: c.id,
    name: c.name,
    agentType: c.agentType,
    createdAt: c.createdAt,
    messageCount: (c.messages || []).length
  })));
});
app.get('/api/conversations/:id', (req, res) => {
  const c = readConvos().find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(c);
});

// ── File tree (Glob Builder) ──
app.get('/api/filetree', (req, res) => {
  const root = validPath(req.query.path);
  if (!root) return res.json({ error: 'Invalid path' });

  const SKIP = new Set(['node_modules', '.git', 'dist', '.next', 'build', '.claude', 'coverage']);
  const MAX_DEPTH = 6;

  function walk(dirPath, depth) {
    if (depth > MAX_DEPTH) return [];
    let entries;
    try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); } catch { return []; }
    const dirs = [], files = [];
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const rel = path.relative(root, path.join(dirPath, e.name));
      if (e.isDirectory()) {
        dirs.push({ name: e.name, path: rel, type: 'dir',
          children: walk(path.join(dirPath, e.name), depth + 1) });
      } else {
        files.push({ name: e.name, path: rel, type: 'file' });
      }
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return [...dirs, ...files];
  }

  res.json({ root, children: walk(root, 0) });
});

// ── Token tree (Token Counter) ──
app.get('/api/tokentree', (req, res) => {
  const root = validPath(req.query.path);
  if (!root) return res.json({ error: 'Invalid path' });

  const SKIP_DIRS = new Set([
    'node_modules', '.git', '.svn',
    'dist', 'build', 'out', 'output',
    '.next', '.nuxt', '.svelte-kit',
    'coverage', '.nyc_output',
    'bin', 'obj',
    'wwwroot',
    '.cache', '.parcel-cache', '.turbo',
    'vendor',
  ]);

  const IGNORE = [
    '**/node_modules', '**/node_modules/**',
    '**/.git', '**/.git/**',
    '**/dist', '**/dist/**',
    '**/build', '**/build/**',
    '**/out', '**/out/**',
    '**/.next', '**/.next/**',
    '**/coverage', '**/coverage/**',
    '**/bin', '**/bin/**',
    '**/obj', '**/obj/**',
    '**/wwwroot', '**/wwwroot/**',
    '**/.cache', '**/.cache/**',
    '**/.turbo', '**/.turbo/**',
    '**/vendor', '**/vendor/**',
    '**/*.min.js', '**/*.min.css', '**/*.map',
  ];

  const MAX_FILE_BYTES = 1_000_000;

  let relPaths;
  try {
    relPaths = fg.sync(['**/*'], {
      cwd: root,
      onlyFiles: true,
      ignore: IGNORE,
      dot: false,
      followSymbolicLinks: false,
      deep: (dirPath) => !SKIP_DIRS.has(path.basename(dirPath)),
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to walk directory', detail: e.message });
  }

  const treeRoot = { name: '', path: '', type: 'dir', children: [], tokens: 0 };

  for (const rel of relPaths) {
    const abs = path.join(root, rel);
    let tokens = 0;
    try {
      const st = fs.statSync(abs);
      if (st.size <= MAX_FILE_BYTES) {
        const content = fs.readFileSync(abs, 'utf8');
        tokens = countTokens(content);
      }
    } catch { continue; }

    const parts = rel.split('/');
    let cur = treeRoot;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (isLast) {
        cur.children.push({ name: part, path: rel, type: 'file', tokens });
      } else {
        const childPath = parts.slice(0, i + 1).join('/');
        let child = cur.children.find(c => c.type === 'dir' && c.name === part);
        if (!child) {
          child = { name: part, path: childPath, type: 'dir', children: [], tokens: 0 };
          cur.children.push(child);
        }
        cur = child;
      }
    }
  }

  function finalize(node) {
    if (node.type === 'file') return node.tokens || 0;
    let t = 0;
    for (const c of node.children) t += finalize(c);
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.tokens = t;
    return t;
  }
  finalize(treeRoot);

  res.json({ root, children: treeRoot.children, tokens: treeRoot.tokens });
});

// ── Instructions scanner ──
function parseInstructionFile(absPath) {
  let raw;
  try { raw = fs.readFileSync(absPath, 'utf8'); }
  catch { return null; }
  const parts = raw.split(/^---$/m);
  let frontmatter = null, content = raw;
  if (parts.length >= 3) {
    frontmatter = parts[1];
    content = parts.slice(2).join('---').trim();
  }
  function field(name) {
    if (!frontmatter) return null;
    const m = frontmatter.match(new RegExp('^\\s*' + name + ':\\s*(.+?)\\s*$', 'mi'));
    return m ? m[1].replace(/^["']|["']$/g, '').trim() : null;
  }
  function list(name) {
    if (!frontmatter) return null;
    const inline = frontmatter.match(new RegExp('^\\s*' + name + ':\\s*\\[([^\\]]*)\\]\\s*$', 'm'));
    if (inline) return inline[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    const block = frontmatter.match(new RegExp('^\\s*' + name + ':\\s*\\n((?:\\s*-\\s*.+\\n?)+)', 'm'));
    if (block) return block[1].split(/\n/).map(l => l.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    return null;
  }
  let applyTo = field('applyTo');
  if (!applyTo) {
    const paths = list('paths');
    if (paths && paths.length) applyTo = paths.join(',');
  }
  return {
    applyTo: applyTo || null,
    description: field('description'),
    tokens: countTokens(content)
  };
}

app.get('/api/instructions', (req, res) => {
  const root = validPath(req.query.path);
  if (!root) return res.json({ error: 'Invalid path' });

  const fixed = [
    '.github/copilot-instructions.md',
    'AGENTS.md',
    'CLAUDE.md',
    'CLAUDE.local.md',
    '.claude/CLAUDE.md'
  ];
  const patterns = [
    '.github/instructions/**/*.instructions.md',
    '**/*.instructions.md',
    '.claude/rules/**/*.md',
    'prompts/**/*.md',
    'instructions/**/*.md'
  ];

  const seen = new Set();
  const out = [];

  function push(absPath, sourceRel) {
    if (seen.has(absPath)) return;
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) return;
    const parsed = parseInstructionFile(absPath);
    if (!parsed) return;
    seen.add(absPath);
    out.push({
      name: path.basename(absPath),
      path: absPath,
      location: 'workspace',
      applyTo: parsed.applyTo,
      description: parsed.description,
      tokens: parsed.tokens,
      source: sourceRel
    });
  }

  for (const rel of fixed) push(path.join(root, rel), rel);
  try {
    const matches = fg.sync(patterns, {
      cwd: root, onlyFiles: true, dot: true,
      ignore: ['node_modules/**', '.git/**']
    });
    for (const rel of matches) push(path.join(root, rel), rel);
  } catch { /* ignore */ }

  res.json({
    files: out,
    scannedAt: new Date().toISOString(),
    workspaceRoot: root
  });
});

app.listen(PORT, () => {
  console.log(`prompt-tools → http://localhost:${PORT}`);
});
