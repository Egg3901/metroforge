/**
 * Node-side entry for replay verification. Bundled to server/lib/verify.mjs
 * so the zero-dep HTTP server can dynamic-import it and re-sim OSM cities.
 */
import { replay } from '../core/replay';
import type { ReplayInput, ReplayResult } from '../core/replay';
import type { ScenarioRules } from '../core/scenarioRules';
import type { Command, Difficulty } from '../core/types';

export interface VerifyRequest {
  seed: number;
  difficulty: Difficulty;
  presetKey?: string;
  size?: 'small' | 'medium' | 'large';
  rules?: ScenarioRules;
  commandLog: { tick: number; cmd: Command }[];
  finalTick: number;
  stateHash: number;
}

export interface VerifyResponse {
  ok: boolean;
  error?: string;
  hash?: number;
  failed?: ReplayResult['failed'];
  tick?: number;
}

export async function verifyReplay(req: VerifyRequest): Promise<VerifyResponse> {
  if (!Array.isArray(req.commandLog)) return { ok: false, error: 'commandLog required for full verify' };
  if (typeof req.seed !== 'number' || typeof req.stateHash !== 'number') {
    return { ok: false, error: 'seed and stateHash required' };
  }
  const input: ReplayInput = {
    seed: req.seed,
    difficulty: req.difficulty ?? 'normal',
    commandLog: req.commandLog,
    finalTick: req.finalTick,
  };
  if (req.presetKey !== undefined) input.presetKey = req.presetKey;
  if (req.size !== undefined) input.size = req.size;
  if (req.rules !== undefined) input.rules = req.rules;

  try {
    const result = await replay(input);
    if (result.hash !== req.stateHash) {
      return {
        ok: false,
        error: `hash mismatch: got ${result.hash}, expected ${req.stateHash}`,
        hash: result.hash,
        failed: result.failed,
        tick: result.state.tick,
      };
    }
    return { ok: true, hash: result.hash, failed: result.failed, tick: result.state.tick };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'replay failed' };
  }
}

/** CLI: node server/lib/verify.mjs < verify.json → prints VerifyResponse JSON */
async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'empty stdin' }));
    process.exit(1);
  }
  const req = JSON.parse(raw) as VerifyRequest;
  const out = await verifyReplay(req);
  process.stdout.write(JSON.stringify(out));
  process.exit(out.ok ? 0 : 2);
}

const isCli =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('verify.mjs') || process.argv[1].endsWith('verifyEntry.ts'));

if (isCli) {
  void main();
}
