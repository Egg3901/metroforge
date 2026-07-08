/**
 * End-to-end: build a short replay, POST /api/score, expect verified:true.
 * Assumes server is already running on :3403 with verify.mjs built.
 */
import { applyCommand } from '../src/core/commands';
import { newGame } from '../src/core/newGame';
import { setBankruptDays, simTick } from '../src/core/sim';
import { stateHash } from '../src/core/save';

const BASE = process.env.MF_API || 'http://127.0.0.1:3403/api';

setBankruptDays(0);
const seed = 77_001;
const live = newGame(seed, 'normal');
const picks = [...live.districts].sort((a, b) => b.population + b.jobs - (a.population + a.jobs));
const s1 = applyCommand(live, { kind: 'buildStation', mode: 'bus', pos: { ...picks[0]!.centroid } });
const s2 = applyCommand(live, { kind: 'buildStation', mode: 'bus', pos: { ...picks[1]!.centroid } });
if (!s1.ok || !s2.ok) throw new Error('stations failed');
applyCommand(live, {
  kind: 'buildTrack',
  mode: 'bus',
  grade: 'surface',
  fromStationId: s1.createdId!,
  toStationId: s2.createdId!,
  waypoints: [],
});
applyCommand(live, { kind: 'createRoute', mode: 'bus', stationIds: [s1.createdId!, s2.createdId!] });
for (let i = 0; i < 300; i++) simTick(live);

const name = `bot${Date.now().toString(36).slice(-6)}`;
const reg = await fetch(`${BASE}/register`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name, password: 'test1234' }),
});
const { token } = (await reg.json()) as { token: string };
if (!token) throw new Error('register failed');

const scoreRes = await fetch(`${BASE}/score`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({
    scenario: 'smoke-e2e',
    value: Math.round(live.stats.dailyTransitTrips),
    city: 'Test',
    seed,
    stateHash: stateHash(live),
    finalTick: live.tick,
    commandCount: live.commandLog.length,
    commandLog: live.commandLog,
    difficulty: 'normal',
  }),
});
const scoreBody = await scoreRes.json();
console.log('score', scoreRes.status, scoreBody);
if (!scoreRes.ok || !scoreBody.verified) {
  process.exit(1);
}

const camp = await fetch(`${BASE}/campaign`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ stars: { 'nyc-1904': 2 } }),
});
const campBody = await camp.json();
console.log('campaign', camp.status, campBody);
if (!campResOk(camp.status) || campBody.stars?.['nyc-1904'] !== 2) process.exit(1);
console.log('E2E OK');

function campResOk(s: number): boolean {
  return s >= 200 && s < 300;
}
