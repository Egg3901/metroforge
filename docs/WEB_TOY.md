# Web storefront toy

Cleveland-only teaser for the download page.

**Scope:** place stations, draw one route, watch vehicles (~2 minutes).
Campaign / daily / multi-city free play are desktop-only; the web shell no
longer mounts those surfaces.

Config constants: `src/app/teaser.ts`.

## Verification

- `npm run build` — tsc + vite ship build
- `npm test` — vitest (sim determinism + jsdom mount smoke)

## Untestable seams (genuinely need a browser / GPU)

These are out of reach for jsdom / headless Node and are not covered by the
mount smoke. Use `scripts/smoke.mjs` + `vite preview` when you have Playwright
+ WebGL available:

1. **PixiJS / WebGL canvas** — `GameRenderer.init` needs a real WebGL context.
   jsdom has no WebGL; the smoke test stubs `GameCanvas`.
2. **Sim Web Worker** — `new Worker(new URL('./sim.worker.ts', …))` is stubbed
   in the mount smoke. Worker message round-trips and OSM city decode are
   covered indirectly by core tests (`scenarioEngine` loads Cleveland JSON
   in-process) but not through the worker boundary.
3. **Pointer → world hit-testing** — station/track/route clicks go through
   Pixi interaction. Core command paths are tested; the canvas pick path is
   not.
4. **Audio** — Web Audio unlock / SFX are presentation-only.
5. **2-minute CTA wall clock** — `useToyCta` is unit-tested with fake timers;
   real browser timer + layout is not.

Determinism suites (`test/determinism.test.ts`, `test/scenarioEngine.test.ts`)
exercise the shared sim core the worker imports — keep those green when
changing toy UI.
