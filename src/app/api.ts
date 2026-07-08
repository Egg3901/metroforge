/**
 * Client for the MetroForge backend (accounts + leaderboards), served at /api
 * on the same origin via Caddy. Token + name persist in localStorage.
 */
import type { ReplayPayload } from '@host/protocol';

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

/** Submit a score with its command-log replay for server-side storage / verification. */
export async function submitScore(token: string, sub: ScoreSubmission): Promise<void> {
  await post('/score', {
    scenario: sub.scenario,
    value: sub.value,
    city: sub.city,
    seed: sub.replay.seed,
    stateHash: sub.replay.stateHash,
    finalTick: sub.replay.finalTick,
    commandCount: sub.replay.commandLog.length,
    // keep the log under the body size cap — server stores hash; full log optional
    commandLog: sub.replay.commandLog.length <= 400 ? sub.replay.commandLog : undefined,
    difficulty: sub.replay.difficulty,
    presetKey: sub.replay.presetKey,
    rules: sub.replay.rules,
  }, token);
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
