const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;
const BOTS_DIR = process.env.BOTS_DIR || '/home/youruser/bots';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const PANEL_USER = process.env.PANEL_USER || 'admin';
const PANEL_PASS_HASH = process.env.PANEL_PASS_HASH || '';
const MAX_BOTS = 5;

if (!fs.existsSync(BOTS_DIR)) fs.mkdirSync(BOTS_DIR, { recursive: true });

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json({ limit: '100mb' }));

// ---------- HELPERS ----------
function authMiddleware(req, res, next) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '');
  try { jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'unauthorized' }); }
}

function safePath(bot, rel = '') {
  const base = path.join(BOTS_DIR, bot);
  const full = path.normalize(path.join(base, rel));
  if (!full.startsWith(base)) throw new Error('path escape');
  return full;
}

function metaPath(bot) {
  return path.join(BOTS_DIR, bot, '.panel-meta.json');
}

function readMeta(bot) {
  try { return JSON.parse(fs.readFileSync(metaPath(bot), 'utf8')); }
  catch { return { disabled: [] }; }
}

function writeMeta(bot, meta) {
  fs.writeFileSync(metaPath(bot), JSON.stringify(meta, null, 2));
}

function pm2List() {
  try { return JSON.parse(execSync('pm2 jlist').toString()); }
  catch { return []; }
}

// ---------- AUTH ----------
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (username !== PANEL_USER) return res.status(401).json({ error: 'bad credentials' });
  const ok = await bcrypt.compare(password, PANEL_PASS_HASH);
  if (!ok) return res.status(401).json({ error: 'bad credentials' });
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

// ---------- BOTS ----------
app.get('/api/bots', authMiddleware, (req, res) => {
  const names = fs.readdirSync(BOTS_DIR).filter(n =>
    fs.statSync(path.join(BOTS_DIR, n)).isDirectory()
  );
  const list = pm2List();
  res.json(names.map(name => {
    const proc = list.find(p => p.name === name);
    return {
      name,
      status: proc ? proc.pm2_env.status : 'stopped',
      cpu: proc?.monit?.cpu || 0,
      memory: proc?.monit?.memory || 0,
      uptime: proc?.pm2_env?.pm_uptime || 0,
    };
  }));
});

app.post('/api/bots', authMiddleware, (req, res) => {
  const { name } = req.body;
  if (!name || !/^[a-zA-Z0-9_-]+$/.test(name))
    return res.status(400).json({ error: 'invalid name' });

  const current = fs.readdirSync(BOTS_DIR).filter(n =>
    fs.statSync(path.join(BOTS_DIR, n)).isDirectory()
  );
  if (current.length >= MAX_BOTS)
    return res.status(400).json({ error: `Maximum ${MAX_BOTS} bots reached` });

  const dir = path.join(BOTS_DIR, name);
  if (fs.existsSync(dir)) return res.status(400).json({ error: 'exists' });

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.js'),
    "console.log('bot starting...');\nsetInterval(()=>console.log('alive'), 30000);\n");
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name, version: '1.0.0', main: 'index.js',
    scripts: { start: 'node index.js' }
  }, null, 2));
  writeMeta(name, { disabled: [] });
  res.json({ ok: true });
});

app.delete('/api/bots/:bot', authMiddleware, (req, res) => {
  const dir = path.join(BOTS_DIR, req.params.bot);
  exec(`pm2 delete ${req.params.bot}`, () => {});
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- FILES ----------
app.get('/api/bots/:bot/files', authMiddleware, (req, res) => {
  try {
    const dir = safePath(req.params.bot, req.query.path || '');
    const meta = readMeta(req.params.bot);
    const items = fs.readdirSync(dir, { withFileTypes: true }).map(d => {
      const rel = req.query.path ? `${req.query.path}/${d.name}` : d.name;
      return {
        name: d.name,
        isDir: d.isDirectory(),
        size: d.isDirectory() ? 0 : fs.statSync(path.join(dir, d.name)).size,
        active: !meta.disabled.includes(rel),
        path: rel,
      };
    });
    res.json(items);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/bots/:bot/file', authMiddleware, (req, res) => {
  try {
    const file = safePath(req.params.bot, req.query.path);
    res.json({ content: fs.readFileSync(file, 'utf8') });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bots/:bot/file', authMiddleware, (req, res) => {
  try {
    const file = safePath(req.params.bot, req.body.path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, req.body.content ?? '');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/bots/:bot/file', authMiddleware, (req, res) => {
  try {
    const file = safePath(req.params.bot, req.query.path);
    fs.rmSync(file, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bots/:bot/rename', authMiddleware, (req, res) => {
  try {
    const { from, to } = req.body;
    const src = safePath(req.params.bot, from);
    const dst = safePath(req.params.bot, to);
    fs.renameSync(src, dst);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bots/:bot/toggle', authMiddleware, (req, res) => {
  try {
    const { filePath } = req.body;
    const meta = readMeta(req.params.bot);
    if (meta.disabled.includes(filePath))
      meta.disabled = meta.disabled.filter(f => f !== filePath);
    else
      meta.disabled.push(filePath);
    writeMeta(req.params.bot, meta);
    res.json({ ok: true, active: !meta.disabled.includes(filePath) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- UPLOAD ----------
const upload = multer({ dest: '/tmp/uploads/' });
app.post('/api/bots/:bot/upload', authMiddleware, upload.array('files'), (req, res) => {
  try {
    const targetDir = safePath(req.params.bot, req.body.path || '');
    fs.mkdirSync(targetDir, { recursive: true });
    req.files.forEach(f => {
      fs.renameSync(f.path, path.join(targetDir, f.originalname));
    });
    res.json({ ok: true, count: req.files.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- BOT CONTROL ----------
app.post('/api/bots/:bot/start', authMiddleware, (req, res) => {
  const dir = path.join(BOTS_DIR, req.params.bot);
  const candidates = ['index.js', 'main.js', 'bot.js', 'app.js', 'start.js'];
  let mainFile = null;
  for (const c of candidates)
    if (fs.existsSync(path.join(dir, c))) { mainFile = c; break; }
  if (!mainFile) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.main) mainFile = pkg.main;
    } catch {}
  }
  if (!mainFile) return res.status(400).json({ error: 'No entry file found' });

  exec(`cd ${dir} && npm install --omit=dev`, (err1) => {
    if (err1) return res.status(500).json({ error: err1.message });
    exec(`pm2 start ${mainFile} --name ${req.params.bot}`,
      (err2, stdout, stderr) => {
        if (err2) return res.status(500).json({ error: stderr });
        res.json({ ok: true, output: stdout, mainFile });
      });
  });
});

app.post('/api/bots/:bot/stop', authMiddleware, (req, res) => {
  exec(`pm2 stop ${req.params.bot}`, () => res.json({ ok: true }));
});

app.post('/api/bots/:bot/restart', authMiddleware, (req, res) => {
  exec(`pm2 restart ${req.params.bot}`, () => res.json({ ok: true }));
});

app.get('/api/bots/:bot/logs', authMiddleware, (req, res) => {
  exec(`pm2 logs ${req.params.bot} --lines 200 --nostream`,
    (err, stdout) => res.json({ logs: stdout || '' }));
});

// LIVE STREAM via SSE
app.get('/api/bots/:bot/logs/stream', (req, res) => {
  const token = req.query.token || (req.headers['authorization'] || '').replace('Bearer ', '');
  try { jwt.verify(token, JWT_SECRET); }
  catch { return res.status(401).end(); }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const child = exec(`pm2 logs ${req.params.bot} --lines 50`);
  child.stdout.on('data', d => res.write(`data: ${JSON.stringify(d.toString())}\n\n`));
  child.stderr.on('data', d => res.write(`data: ${JSON.stringify(d.toString())}\n\n`));

  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => { clearInterval(ping); child.kill(); });
});

app.listen(PORT, () => console.log(`Panel API on :${PORT}`));
