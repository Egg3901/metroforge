# MetroForge

A single-player transit network builder set in a procedurally generated city that grows in response to your network. Place stations, draw tracks, run routes, balance the budget — watch neighborhoods densify around good service.

**Status: playable vertical slice.** Web prototype architected as a reference implementation for a future native client — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the decisions and the determinism contract. The original design prompt lives in [`docs/plans/fable-transit-game.md`](docs/plans/fable-transit-game.md); the architecture doc supersedes it where they conflict.

## Design pillars

- **Deterministic sim core** (`src/core/`): pure TypeScript, seeded RNG, fixed timestep, command-driven mutation. `(seed, command stream)` fully determines a game. No browser APIs — this directory is the portable spec.
- **Hybrid passenger model**: economics come from aggregate origin–destination flows (gravity demand → Dijkstra assignment → logit mode split); visual passengers are sampled from flows for presentation only.
- **Continuous vector geometry**: roads and tracks are polylines in meters; density/land value live on a coarse scalar field grid.
- **Worker-hosted sim**: the simulation runs in a Web Worker behind a message protocol shaped like a future native FFI boundary; the renderer consumes typed-array snapshots.
- **WebGL renderer** (PixiJS v8): baked static layers, dynamic vehicles/agents, pan/zoom camera.

## Run

```bash
npm install
npm run dev        # dev server
npm test           # golden determinism tests (the native-port acceptance suite)
npm run build      # typecheck (strict) + production build → dist/
node scripts/smoke.mjs   # headless browser smoke test (needs `npx vite preview --port 4180` running)
```

## Play

Start with buses; grow the city to unlock trams (50k), metro (150k), commuter rail (300k). Keys: `1–4` mode, `S` station, `T` track, `R` route, `B` bulldoze, `Space` pause, `Enter` finish route, right-click cancel. Build where the amber density glow is bright — coverage of dense districts is what earns riders.

Hosting target: `transit.ahousedividedgame.com` (static, no backend; localStorage saves).
