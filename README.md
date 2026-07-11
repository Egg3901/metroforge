# MetroForge

A single-player transit network builder set in a procedurally generated city that grows in response to your network. Place stations, draw tracks, run routes, balance the budget — watch neighborhoods densify around good service.

**Status:** native desktop game in active development; the web build is a **Cleveland marketing toy** (place stations → draw one route → watch vehicles) that shares the deterministic sim core. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the portability contract and [`docs/WEB_TOY.md`](docs/WEB_TOY.md) for the storefront teaser scope and untestable seams.

## Design pillars

- **Deterministic sim core** (`src/core/`): pure TypeScript, seeded RNG, fixed timestep, command-driven mutation. `(seed, command stream)` fully determines a game. No browser APIs — this directory is the portable spec.
- **Hybrid passenger model**: economics come from aggregate origin–destination flows (gravity demand → Dijkstra assignment → logit mode split); visual passengers are sampled from flows for presentation only.
- **Continuous vector geometry**: roads and tracks are polylines in meters; density/land value live on a coarse scalar field grid.
- **Worker-hosted sim**: the simulation runs in a Web Worker behind a message protocol shaped like a future native FFI boundary; the renderer consumes typed-array snapshots.
- **WebGL renderer** (PixiJS v8): baked static layers, dynamic vehicles/agents, pan/zoom camera.

## Run

```bash
npm install
npm run dev        # storefront toy (Cleveland) + download page at /download.html
npm test           # golden determinism + jsdom mount smoke
npm run build      # typecheck (strict) + vite build → dist/
```

## Play (browser toy)

Open `/` for the Cleveland toy: bus only, coach for stations → track → route → riders. After two minutes a non-blocking download banner points at the desktop build. The full multi-city campaign runs in the native client — start from [`/download.html`](public/download.html).

Keys in the toy: `S` station, `T` track, `R` route, `Enter` finish route, `Space` pause.
