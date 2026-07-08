/**
 * MetroForge backend — accounts + leaderboards. Self-hosted on Hetzner.
 * Zero external deps: Node's built-in http + node:sqlite + node:crypto.
 *
 *   node --experimental-sqlite server/index.mjs
 *
 * Fronted by Caddy at transit.ahousedividedgame.com/api/* → localhost:3403.
 */
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PORT = 3403;
const DIR = dirname(fileURLToPath(import.meta.url));
const SECRET = process.env.MF_SECRET || 'metroforge-dev-secret-change-me';

const db = new DatabaseSync(join(DIR, 'data.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL COLLATE NOCASE,
    hash TEXT NOT NULL, salt TEXT NOT NULL, created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, scenario TEXT NOT NULL,
    value REAL NOT NULL, city TEXT, created INTEGER NOT NULL,
    UNIQUE(user_id, scenario));
  CREATE INDEX IF NOT EXISTS idx_scores_scenario ON scores(scenario, value DESC);
`);

// ── auth helpers ──
const hashPw = (pw, salt) => scryptSync(pw, salt, 32).toString('hex');
const b64u = (b) => Buffer.from(b).toString('base64url');
const sign = (payload) => {
  const body = b64u(JSON.stringify(payload));
  const sig = createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
};
const verify = (token) => {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const exp = createHmac('sha256', SECRET).update(body).digest('base64url');
  if (exp.length !== sig.length || !timingSafeEqual(Buffer.from(exp), Buffer.from(sig))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (p.exp && p.exp < Date.now()) return null;
    return p;
  } catch { return null; }
};
const tokenFor = (u) => sign({ uid: u.id, name: u.name, exp: Date.now() + 1000 * 60 * 60 * 24 * 90 });

// ── http helpers ──
const json = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET, POST, OPTIONS' });
  res.end(JSON.stringify(obj));
};
const readBody = (req) => new Promise((resolve) => {
  let d = ''; req.on('data', (c) => { d += c; if (d.length > 1e5) req.destroy(); });
  req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
});
const cleanName = (n) => String(n ?? '').trim().slice(0, 20);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname.replace(/^\/api/, '') || '/';
  if (req.method === 'OPTIONS') return json(res, 204, {});

  try {
    if (req.method === 'POST' && (path === '/register' || path === '/login')) {
      const { name, password } = await readBody(req);
      const nm = cleanName(name);
      if (nm.length < 2 || !password || String(password).length < 4) return json(res, 400, { error: 'Name (2+) and password (4+) required.' });
      if (path === '/register') {
        if (db.prepare('SELECT 1 FROM users WHERE name = ?').get(nm)) return json(res, 409, { error: 'That name is taken.' });
        const salt = randomBytes(16).toString('hex');
        const info = db.prepare('INSERT INTO users (name, hash, salt, created) VALUES (?,?,?,?)').run(nm, hashPw(String(password), salt), salt, Date.now());
        const u = { id: info.lastInsertRowid, name: nm };
        return json(res, 200, { token: tokenFor(u), name: nm });
      } else {
        const u = db.prepare('SELECT * FROM users WHERE name = ?').get(nm);
        if (!u || hashPw(String(password), u.salt) !== u.hash) return json(res, 401, { error: 'Wrong name or password.' });
        return json(res, 200, { token: tokenFor(u), name: u.name });
      }
    }

    if (req.method === 'POST' && path === '/score') {
      const auth = verify((req.headers.authorization || '').replace(/^Bearer /, ''));
      if (!auth) return json(res, 401, { error: 'Sign in first.' });
      const { scenario, value, city } = await readBody(req);
      if (!scenario || typeof value !== 'number' || !isFinite(value)) return json(res, 400, { error: 'bad score' });
      // keep the best (highest) value per user per scenario
      db.prepare(`INSERT INTO scores (user_id, scenario, value, city, created) VALUES (?,?,?,?,?)
        ON CONFLICT(user_id, scenario) DO UPDATE SET value=max(value, excluded.value), created=excluded.created`)
        .run(auth.uid, String(scenario), value, city ? String(city) : null, Date.now());
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET' && path === '/leaderboard') {
      const scenario = url.searchParams.get('scenario');
      if (!scenario) return json(res, 400, { error: 'scenario required' });
      const rows = db.prepare(`SELECT u.name, s.value, s.created FROM scores s JOIN users u ON u.id = s.user_id
        WHERE s.scenario = ? ORDER BY s.value DESC LIMIT 20`).all(scenario);
      return json(res, 200, { scenario, entries: rows });
    }

    if (path === '/health') return json(res, 200, { ok: true });
    return json(res, 404, { error: 'not found' });
  } catch (e) {
    return json(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`MetroForge backend on :${PORT}`));
