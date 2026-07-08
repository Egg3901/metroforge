/**
 * Bundle the TypeScript replay verifier + OSM city JSON into a single ESM
 * file the Node HTTP server can dynamic-import (no Vite runtime on Hetzner).
 *
 *   npx vite-node scripts/build-verify.ts
 *   → server/lib/verify.mjs
 */
import * as esbuild from 'esbuild';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outfile = join(root, 'server/lib/verify.mjs');
mkdirSync(dirname(outfile), { recursive: true });

await esbuild.build({
  entryPoints: [join(root, 'src/server/verifyEntry.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  // city JSON is imported by osmRegistry — keep it inline
  loader: { '.json': 'json' },
  logLevel: 'info',
});

console.log('wrote', outfile);
