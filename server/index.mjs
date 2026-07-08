/**
 * MetroForge backend — accounts, leaderboards, campaign sync, replay verify.
 * Zero external deps at runtime: Node http + sqlite + crypto.
 * Replay verification dynamic-imports server/lib/verify.mjs (built from TS).
 *
 *   npm run build:verify   # once, or after core/city changes
 *   node --experimental-sqlite server/index.mjs
 */
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { access } from 'node:fs/promises';

const PORT = 3403;
const DIR = dirname(fileURLToPath(import.meta.url));
const SECRET = process.env.MF_SECRET || 'metroforge-dev-secret-change-me';
const VERIFY_PATH = join(DIR, 'lib/verify.mjs');

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
  CREATE TABLE IF NOT EXISTS campaign (
    user_id INTEGER PRIMARY KEY,
    stars_json TEXT NOT NULL,
    updated INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_scores_scenario ON scores(scenario, value DESC);
`);
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

// ── daily challenge ──
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

// ── replay verifier (lazy-loaded) ──
let verifyReplayFn = null;
let verifyLoadError = null;
async function getVerifier() {
  if (verifyReplayFn) return verifyReplayFn;
  if (verifyLoadError) return null;
  try {
    await access(VERIFY_PATH);
    const mod = await import(pathToFileURL(VERIFY_PATH).href);
    verifyReplayFn = mod.verifyReplay;
    console.log('replay verifier loaded');
    return verifyReplayFn;
  } catch (e) {
    verifyLoadError = e;
    console.warn('replay verifier unavailable:', e instanceof Error ? e.message : e);
    return null;
  }
}

function envelopeOk(body) {
  if (typeof body.seed !== 'number' || !Number.isFinite(body.seed)) return { ok: false, error: 'replay needs seed' };
  if (typeof body.stateHash !== 'number' || !Number.isFinite(body.stateHash)) return { ok: false, error: 'replay needs stateHash' };
  if (typeof body.finalTick !== 'number' || body.finalTick < 0) return { ok: false, error: 'replay needs finalTick' };
  if (typeof body.commandCount !== 'number' || body.commandCount < 0) return { ok: false, error: 'replay needs commandCount' };
  if (!Array.isArray(body.commandLog)) return { ok: false, error: 'commandLog required for verification' };
  if (body.commandLog.length !== body.commandCount) return { ok: false, error: 'commandCount mismatch' };
  if (String(body.scenario).startsWith('daily-')) {
    const key = dayKey();
    if (body.scenario !== `daily-${key}`) return { ok: false, error: 'stale daily challenge' };
    if ((body.seed >>> 0) !== seedFromDayKey(key)) return { ok: false, error: 'daily seed mismatch' };
  }
  return { ok: true };
}

function mergeStars(a, b) {
  const out = { ...a };
  for (const id of Object.keys(b || {})) {
    const v = Math.min(3, Math.max(out[id] || 0, Number(b[id]) || 0));
    if (v > 0) out[id] = v;
  }
  return out;
}

// ── http helpers ──
const json = (res, code, obj) => {
  res.writeHead(code, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(obj));
};
const readBody = (req) => new Promise((resolve) => {
  let d = '';
  req.on('data', (c) => { d += c; if (d.length > 8e6) req.destroy(); });
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
      const body = await readBody(req);
      const { scenario, value, city } = body;
      if (!scenario || typeof value !== 'number' || !isFinite(value)) return json(res, 400, { error: 'bad score' });
      const check = envelopeOk(body);
      if (!check.ok) return json(res, 400, { error: check.error });

      const verifier = await getVerifier();
      let verified = 0;
      if (verifier) {
        const result = await verifier({
          seed: body.seed,
          difficulty: body.difficulty || 'normal',
          presetKey: body.presetKey,
          size: body.size,
          rules: body.rules,
          commandLog: body.commandLog,
          finalTick: body.finalTick,
          stateHash: body.stateHash,
        });
        if (!result.ok) return json(res, 400, { error: result.error || 'replay rejected' });
        verified = 1;
      } else {
        // verifier bundle missing — accept envelope only (dev fallback)
        verified = 0;
      }

      const replayJson = JSON.stringify({
        seed: body.seed,
        stateHash: body.stateHash,
        finalTick: body.finalTick,
        commandCount: body.commandCount,
        difficulty: body.difficulty,
        presetKey: body.presetKey,
        size: body.size,
        rules: body.rules,
        commandLog: body.commandLog,
      });
      db.prepare(`INSERT INTO scores (user_id, scenario, value, city, created, seed, state_hash, final_tick, command_count, verified, replay_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(user_id, scenario) DO UPDATE SET
          value=max(value, excluded.value),
          created=CASE WHEN excluded.value >= value THEN excluded.created ELSE created END,
          seed=excluded.seed, state_hash=excluded.state_hash, final_tick=excluded.final_tick,
          command_count=excluded.command_count, verified=excluded.verified,
          replay_json=excluded.replay_json`)
        .run(auth.uid, String(scenario), value, city ? String(city) : null, Date.now(),
          body.seed, body.stateHash, body.finalTick, body.commandCount, verified, replayJson);
      return json(res, 200, { ok: true, verified: verified === 1 });
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

    if (req.method === 'GET' && path === '/campaign') {
      const auth = verify((req.headers.authorization || '').replace(/^Bearer /, ''));
      if (!auth) return json(res, 401, { error: 'Sign in first.' });
      const row = db.prepare('SELECT stars_json FROM campaign WHERE user_id = ?').get(auth.uid);
      let stars = {};
      try { stars = row ? JSON.parse(row.stars_json) : {}; } catch { stars = {}; }
      return json(res, 200, { stars });
    }

    if (req.method === 'POST' && path === '/campaign') {
      const auth = verify((req.headers.authorization || '').replace(/^Bearer /, ''));
      if (!auth) return json(res, 401, { error: 'Sign in first.' });
      const body = await readBody(req);
      const incoming = body.stars && typeof body.stars === 'object' ? body.stars : {};
      const row = db.prepare('SELECT stars_json FROM campaign WHERE user_id = ?').get(auth.uid);
      let existing = {};
      try { existing = row ? JSON.parse(row.stars_json) : {}; } catch { existing = {}; }
      const merged = mergeStars(existing, incoming);
      db.prepare(`INSERT INTO campaign (user_id, stars_json, updated) VALUES (?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET stars_json=excluded.stars_json, updated=excluded.updated`)
        .run(auth.uid, JSON.stringify(merged), Date.now());
      return json(res, 200, { stars: merged });
    }

    if (path === '/health') {
      const verifier = await getVerifier();
      return json(res, 200, { ok: true, verify: !!verifier });
    }
    return json(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`MetroForge backend on :${PORT}`));
