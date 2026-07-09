/**
 * Client for the MetroForge backend (accounts + leaderboards + campaign sync),
 * served at /api on the same origin via Caddy. Token + name persist in localStorage.
 */
import type { ReplayPayload } from '@host/protocol';
import type { StarMap } from '@content/campaign';

const BASE = '/api';
const KEY = 'metroforge:account';

export interface Account { name: string; token: string; }
export interface LeaderEntry { name: string; value: number; created: number; verified?: boolean; }

export function loadAccount(): Account | null {
  try { const s = localStorage.getItem(KEY); return s ? (JSON.parse(s) as Account) : null; } catch { return null; }
}
function saveAccount(a: Account | null): void {
  if (a) localStorage.setItem(KEY, JSON.stringify(a)); else localStorage.removeItem(KEY);
}

async function post(path: string, body: unknown, token?: string): Promise<any> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function get(path: string, token?: string): Promise<any> {
  const res = await fetch(BASE + path, {
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function authenticate(kind: 'register' | 'login', name: string, password: string): Promise<Account> {
  const data = await post(`/${kind}`, { name, password });
  const acct: Account = { name: data.name, token: data.token };
  saveAccount(acct);
  return acct;
}

export function signOut(): void { saveAccount(null); }

export interface ScoreSubmission {
  scenario: string;
  value: number;
  city: string;
  replay: ReplayPayload;
}

/** Submit a score with its command-log replay for server-side re-sim verification. */
export async function submitScore(token: string, sub: ScoreSubmission): Promise<{ verified: boolean }> {
  const data = await post('/score', {
    scenario: sub.scenario,
    value: sub.value,
    city: sub.city,
    seed: sub.replay.seed,
    stateHash: sub.replay.stateHash,
    finalTick: sub.replay.finalTick,
    commandCount: sub.replay.commandLog.length,
    commandLog: sub.replay.commandLog,
    difficulty: sub.replay.difficulty,
    presetKey: sub.replay.presetKey,
    size: sub.replay.size,
    rules: sub.replay.rules,
  }, token);
  return { verified: !!data.verified };
}

export async function fetchLeaderboard(scenario: string): Promise<LeaderEntry[]> {
  const res = await fetch(`${BASE}/leaderboard?scenario=${encodeURIComponent(scenario)}`);
  const data = await res.json().catch(() => ({ entries: [] }));
  return (data.entries ?? []) as LeaderEntry[];
}

export async function fetchDailyMeta(): Promise<{ challengeId: string; dayKey: string } | null> {
  try {
    const res = await fetch(`${BASE}/daily`);
    if (!res.ok) return null;
    return (await res.json()) as { challengeId: string; dayKey: string };
  } catch {
    return null;
  }
}

/** Pull campaign stars from the account; merge with local bests. */
export async function fetchCampaign(token: string): Promise<StarMap> {
  const data = await get('/campaign', token);
  return (data.stars && typeof data.stars === 'object' ? data.stars : {}) as StarMap;
}

/** Push local stars; server keeps the max per scenario and returns the merged map. */
export async function pushCampaign(token: string, stars: StarMap): Promise<StarMap> {
  const data = await post('/campaign', { stars }, token);
  return (data.stars && typeof data.stars === 'object' ? data.stars : stars) as StarMap;
}

const SCORE_QUEUE_KEY = 'metroforge:score-queue';

function loadScoreQueue(): ScoreSubmission[] {
  try {
    const raw = localStorage.getItem(SCORE_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as ScoreSubmission[]) : [];
  } catch {
    return [];
  }
}

function saveScoreQueue(q: ScoreSubmission[]): void {
  try {
    if (q.length === 0) localStorage.removeItem(SCORE_QUEUE_KEY);
    else localStorage.setItem(SCORE_QUEUE_KEY, JSON.stringify(q.slice(-8)));
  } catch {
    /* ignore */
  }
}

/** Queue a score for later when the network/API is unavailable. */
export function enqueueScore(sub: ScoreSubmission): void {
  const q = loadScoreQueue();
  q.push(sub);
  saveScoreQueue(q);
}

/** Flush any offline score submissions. Returns how many succeeded. */
export async function flushScoreQueue(token: string): Promise<number> {
  const q = loadScoreQueue();
  if (q.length === 0) return 0;
  const remaining: ScoreSubmission[] = [];
  let ok = 0;
  for (const sub of q) {
    try {
      await submitScore(token, sub);
      ok++;
    } catch {
      remaining.push(sub);
    }
  }
  saveScoreQueue(remaining);
  return ok;
}
