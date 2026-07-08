/**
 * Client for the MetroForge backend (accounts + leaderboards), served at /api
 * on the same origin via Caddy. Token + name persist in localStorage.
 */
const BASE = '/api';
const KEY = 'metroforge:account';

export interface Account { name: string; token: string; }
export interface LeaderEntry { name: string; value: number; created: number; }

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

export async function submitScore(token: string, scenario: string, value: number, city: string): Promise<void> {
  await post('/score', { scenario, value, city }, token);
}

export async function fetchLeaderboard(scenario: string): Promise<LeaderEntry[]> {
  const res = await fetch(`${BASE}/leaderboard?scenario=${encodeURIComponent(scenario)}`);
  const data = await res.json().catch(() => ({ entries: [] }));
  return (data.entries ?? []) as LeaderEntry[];
}
