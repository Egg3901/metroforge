/**
 * Smoke-test the bundled server verifier against a short procedural replay.
 * Run after `npm run build:verify`.
 */
import { applyCommand } from '../src/core/commands';
import { newGame } from '../src/core/newGame';
import { setBankruptDays, simTick } from '../src/core/sim';
import { stateHash } from '../src/core/save';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

setBankruptDays(0);
const seed = 99_001;
const live = newGame(seed, 'normal');
const picks = [...live.districts].sort((a, b) => b.population + b.jobs - (a.population + a.jobs));
const a = picks[0]!.centroid;
const b = picks[1]!.centroid;
const s1 = applyCommand(live, { kind: 'buildStation', mode: 'bus', pos: a });
const s2 = applyCommand(live, { kind: 'buildStation', mode: 'bus', pos: b });
if (!s1.ok || !s2.ok) throw new Error('station build failed');
applyCommand(live, {
  kind: 'buildTrack',
  mode: 'bus',
  grade: 'surface',
  fromStationId: s1.createdId!,
  toStationId: s2.createdId!,
  waypoints: [],
});
applyCommand(live, { kind: 'createRoute', mode: 'bus', stationIds: [s1.createdId!, s2.createdId!] });
for (let t = 0; t < 400; t++) simTick(live);

const req = {
  seed,
  difficulty: 'normal' as const,
  commandLog: live.commandLog,
  finalTick: live.tick,
  stateHash: stateHash(live),
};

const verifyPath = join(dirname(fileURLToPath(import.meta.url)), '../server/lib/verify.mjs');
const mod = await import(pathToFileURL(verifyPath).href) as {
  verifyReplay: (r: typeof req) => Promise<{ ok: boolean; error?: string; hash?: number }>;
};
const out = await mod.verifyReplay(req);
if (!out.ok) {
  console.error('VERIFY FAIL', out);
  process.exit(1);
}
console.log('VERIFY OK', out.hash);
