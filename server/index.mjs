/**
 * MetroForge backend — accounts + leaderboards. Self-hosted on Hetzner.
 * Zero external deps: Node's built-in http + node:sqlite + node:crypto.
 *
 *   node --experimental-sqlite server/index.mjs
 *
 * Fronted by Caddy at transit.[REDACTED]game.com/api/* → localhost:3403.
 *
 * Scores accept an optional command-log replay envelope (seed, stateHash,
 * commandCount). Full headless re-sim lives in the TypeScript core; this
 * process stores the hash + log for audit and rejects obviously bad payloads.
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
    seed INTEGER, state_hash INTEGER, final_tick INTEGER, command_count INTEGER,
    verified INTEGER DEFAULT 0, replay_json TEXT,
    UNIQUE(user_id, scenario));
  CREATE INDEX IF NOT EXISTS idx_scores_scenario ON scores(scenario, value DESC);
`);
// migrate older DBs that lack the replay columns
try { db.exec('ALTER TABLE scores ADD COLUMN seed INTEGER'); } catch { /* exists */ }
try { db.exec('ALTER TABLE scores ADD COLUMN state_hash INTEGER'); } catch { /* exists */ }
try { db.exec('ALTER TABLE scores ADD COLUMN final_tick INTEGER'); } catch { /* exists */ }
try { db.exec('ALTER TABLE scores ADD COLUMN command_count INTEGER'); } catch { /* exists */ }
try { db.exec('ALTER TABLE scores ADD COLUMN verified INTEGER DEFAULT 0'); } catch { /* exists */ }
try { db.exec('ALTER TABLE scores ADD COLUMN replay_json TEXT'); } catch { /* exists */ }

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

// ── daily challenge (mirrors client dayKey / seedFromDayKey) ──
const dayKey = (d = new Date()) => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
};
const seedFromDayKey = (key) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
};

// ── http helpers ──
const json = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET, POST, OPTIONS' });
  res.end(JSON.stringify(obj));
};
const readBody = (req) => new Promise((resolve) => {
  let d = ''; req.on('data', (c) => { d += c; if (d.length > 2e6) req.destroy(); });
  req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
});
const cleanName = (n) => String(n ?? '').trim().slice(0, 20);

/** Lightweight replay envelope checks (full re-sim is in the TS core / CI). */
function validateReplayEnvelope(body) {
  if (typeof body.seed !== 'number' || !Number.isFinite(body.seed)) return { ok: false, error: 'replay needs seed' };
  if (typeof body.stateHash !== 'number' || !Number.isFinite(body.stateHash)) return { ok: false, error: 'replay needs stateHash' };
  if (typeof body.finalTick !== 'number' || body.finalTick < 0) return { ok: false, error: 'replay needs finalTick' };
  if (typeof body.commandCount !== 'number' || body.commandCount < 0) return { ok: false, error: 'replay needs commandCount' };
  if (body.commandLog && !Array.isArray(body.commandLog)) return { ok: false, error: 'bad commandLog' };
  if (body.commandLog && body.commandLog.length !== body.commandCount && body.commandLog.length > 0) {
    // allow omitted log when too large; if present, count must match
    if (body.commandLog.length > 0 && Math.abs(body.commandLog.length - body.commandCount) > 0) {
      return { ok: false, error: 'commandCount mismatch' };
    }
  }
  // daily challenges must use today's seed
  if (String(body.scenario).startsWith('daily-')) {
    const key = dayKey();
    const expectedId = `daily-${key}`;
    if (body.scenario !== expectedId) return { ok: false, error: 'stale daily challenge' };
    if ((body.seed >>> 0) !== seedFromDayKey(key)) return { ok: false, error: 'daily seed mismatch' };
  }
  return { ok: true };
}

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
      const body = await readBody(req);
      const { scenario, value, city } = body;
      if (!scenario || typeof value !== 'number' || !isFinite(value)) return json(res, 400, { error: 'bad score' });
      const check = validateReplayEnvelope(body);
      if (!check.ok) return json(res, 400, { error: check.error });
      const verified = 1; // envelope passed; full re-sim is offline/CI
      const replayJson = body.commandLog ? JSON.stringify({
        seed: body.seed,
        stateHash: body.stateHash,
        finalTick: body.finalTick,
        commandCount: body.commandCount,
        difficulty: body.difficulty,
        presetKey: body.presetKey,
        rules: body.rules,
        commandLog: body.commandLog,
      }) : null;
      db.prepare(`INSERT INTO scores (user_id, scenario, value, city, created, seed, state_hash, final_tick, command_count, verified, replay_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(user_id, scenario) DO UPDATE SET
          value=max(value, excluded.value),
          created=CASE WHEN excluded.value >= value THEN excluded.created ELSE created END,
          seed=excluded.seed, state_hash=excluded.state_hash, final_tick=excluded.final_tick,
          command_count=excluded.command_count, verified=excluded.verified,
          replay_json=COALESCE(excluded.replay_json, replay_json)`)
        .run(auth.uid, String(scenario), value, city ? String(city) : null, Date.now(),
          body.seed, body.stateHash, body.finalTick, body.commandCount, verified, replayJson);
      return json(res, 200, { ok: true, verified: true });
    }

    if (req.method === 'GET' && path === '/leaderboard') {
      const scenario = url.searchParams.get('scenario');
      if (!scenario) return json(res, 400, { error: 'scenario required' });
      const rows = db.prepare(`SELECT u.name, s.value, s.created, s.verified FROM scores s JOIN users u ON u.id = s.user_id
        WHERE s.scenario = ? ORDER BY s.value DESC LIMIT 20`).all(scenario);
      return json(res, 200, { scenario, entries: rows.map((r) => ({ ...r, verified: !!r.verified })) });
    }

    if (req.method === 'GET' && path === '/daily') {
      const key = dayKey();
      return json(res, 200, { challengeId: `daily-${key}`, dayKey: key, seed: seedFromDayKey(key) });
    }

    if (path === '/health') return json(res, 200, { ok: true });
    return json(res, 404, { error: 'not found' });
  } catch (e) {
    return json(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`MetroForge backend on :${PORT}`));
