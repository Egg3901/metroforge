# MetroForge Architecture

Decisions made 2026-07-07 with the owner. These **supersede** `docs/plans/fable-transit-game.md` wherever they conflict.

## Owner decisions

| Fork | Decision | Consequence |
|---|---|---|
| Native path | **True native rewrite later** | The web build is a *reference implementation*. The sim core is a deterministic, renderer-agnostic spec that a Rust/C++/engine client re-implements 1:1 against the same save format and command protocol. |
| Passenger model | **Hybrid: aggregate flows + sampled visual agents** | Economics/ridership computed from origin–destination flows (scales to any city size). A bounded pool of visual agents is *sampled* from flows purely for rendering. Agents never feed back into economics. |
| Geometry | **Continuous vector space** | Roads/tracks are polylines in continuous 2D world units (meters). No tile grid. Density, land value, and accessibility live on a coarse *field grid* used only as scalar fields, never as game geometry. |
| Art direction | **Stylized living map** | Clean vector city, bold transit lines, animated vehicles + passenger dots. WebGL (PixiJS) viewport; React only for panels. |

## Layering (hard boundaries)

```
src/core/      Deterministic simulation. Pure TypeScript.
               NO imports from render/, app/, pixi, react, or DOM/browser APIs.
               This directory IS the portable spec.
src/render/    PixiJS renderer. Reads render snapshots, never mutates sim.
src/app/       React shell, panels, Zustand mirror of UI-relevant state.
src/host/      Sim hosting: worker host (default) + local host (fallback/tests).
```

Enforced by ESLint `no-restricted-imports` on `src/core/**`. If a change in `core/` needs a browser API, the change is wrong.

## Determinism contract (what the native client must reproduce)

1. **Seeded PRNG only.** All randomness flows through `core/rng.ts` (xoshiro128**, 32-bit integer state). `Math.random`, `Date.now`, `crypto` are banned in core.
2. **Fixed timestep.** The sim advances in discrete ticks (`TICK_SECONDS = 1` game-second per tick at 1×; speed multiplies ticks-per-real-second, never dt). No frame-rate dependence.
3. **Command-driven mutation.** The *only* way to mutate sim state is `applyCommand(state, cmd)`. UI, tutorial, events, and replays all go through the same commands. `(seed, [commands with tick stamps])` fully determines a game — this is also the replay/desync-test mechanism for validating a native port.
4. **Ordered iteration.** Entity collections are arrays or insertion-ordered maps; no object-key-order dependence.
5. **Float policy.** Core math is float64 with a documented restriction: no transcendental-heavy accumulation in economic totals (sums use plain +), geometry uses sqrt/atan2 only for derived display values or precomputed-at-construction constants that are stored in the save. Cross-platform float drift is contained by (a) storing construction-time derived values instead of recomputing, and (b) golden replay tests with per-tick state hashes.
6. **Versioned saves.** `save/schema.ts` defines `SAVE_VERSION` and explicit migration functions. The save is plain JSON of core state only (no render/UI state).

## Simulation model

### World
- Continuous 2D, units are **meters**, city ~12×12 km centered on origin.
- **Field grid**: N×N cells at a fixed ~125 m/cell, holding scalar fields per cell: `population`, `jobs`, `landValue`, `terrainHeight`, `water`, `parks`, `nimby`. Fields are sampled bilinearly when point values are needed. Fields are data, not geometry.
- **Map size**: selectable Small / Medium / Large = 8 / 12 / 18 km edge → 64² / 96² / 144² cells (`core/city/presets.ts` `MAP_SIZE_METERS`; cell size is constant, so a bigger map is more city, not coarser). `createFieldGrid(worldSize)` derives the grid; `generateCity` reads `worldSize` off the fields.
- **City presets**: two kinds. (1) **Real OSM cities** (New York, Boston, marked `real`) import actual OpenStreetMap geometry — real roads + a baked water mask + a park mask — via `scripts/build-cities.ts`, bundled to `src/data/cities/<key>.json` and lazy-loaded (`core/city/osmRegistry.ts`). The generator lays procedural population/jobs/districts on the real land. (2) **Styled-procedural presets** (Chicago, LA, Atlanta, Cleveland, Random) tune the tensor generator — grid rigidity/bearing/noise (incl. a citywide `globalGrid` basis for coherent rectilinear cities), radial weight, coast/river/landlocked water, sprawl. Both are seed-deterministic. (`core/city/presets.ts`, consumed in `core/city/generator.ts`.)
- **OSM importer** (`scripts/build-cities.ts`, dev-only): Overpass fetch (roads + coastline + water ways/relations + parks) → equirectangular projection fit to the world square → Douglas–Peucker simplify → water mask from OSM's land-left/water-right coastline convention + inland water polygons → park mask → compact base64-masked bundle + a preview PNG.
- **Generation grader** (`npm run grade`, `scripts/grade.ts`): headless batch renderer (PNG via Node zlib) with connectivity/grid/water metrics and an HTML contact sheet.
- **Road network**: generated polyline graph (arterial → collector → local) used for city rendering, station snapping, and bus alignment. A junction-snap pass projects local street ends onto the nearest arterial so small streets form real intersections with main roads.

### Demand & assignment (the hybrid core)
- The city is partitioned into **districts** (clusters of field cells, ~150–400 of them). Demand is an origin–destination matrix over districts, regenerated when land use or network changes materially (dirty-flag, not every tick): gravity model `T_ij = k · P_i · A_j · f(cost_ij)`.
- **Transit assignment**: build a time-expanded-ish graph — walk links (district centroid → stations within walk radius), board/alight links (wait cost = headway/2 + transfer penalty), ride links (in-vehicle time from route geometry + speed + dwell). Multi-source Dijkstra per origin district. Compare generalized transit cost vs car cost → logit mode split per OD pair.
- Assignment yields per-route, per-segment **flow volumes** → ridership, revenue, crowding, station load. All economics derive from flows.
- **Road congestion** (`core/transit/traffic.ts`): the car-mode residual of each OD pair is rasterized as a desire line into a grid and divided by a road-capacity field (cached per road network) to produce a 0..1 congestion field plus ranked bottleneck hotspots. Recomputed whenever the assignment reruns. Presentation/analytics only — it never feeds back into the economy — and is transient (stripped from saves, recomputed on load).
- **Visual agents** (≤ ~3,000): sampled proportionally from active flows, animated along their assigned paths. Pure presentation; despawn/resample freely under camera or budget pressure. Agent positions are NOT part of the save or the determinism contract.

### Vehicles
Vehicles are simulated individually (they're few): position = distance along route polyline, dwell at stops, capacity from flow-based boarding rates. Crowding on a vehicle = flow volume on its segment / (capacity × frequency).

### Time
1 tick = 1 game-second. A game day = 20 real minutes at 1×, compressed clock with a demand curve (AM peak / midday / PM peak / night) scaling the OD matrix.

## Host protocol (worker boundary = future native boundary)

The sim runs in a Web Worker by default. The message protocol is deliberately the same shape a native core would expose over FFI:

```
→ init { seed, difficulty, size?, presetKey? } | loadSave { json } | setSpeed { s } | command { tick?, cmd }
← ready { staticCity }                    // geometry that never changes per-tick
← fields { payload }                       // land-use field textures, re-baked on growth
← traffic { payload }                      // congestion field + hotspots, on assignment change
← frame { tick, renderSnapshot }          // typed-array positions: vehicles, agents
← ui { ... }                               // low-frequency UI state
← saved { json }
```

`renderSnapshot` uses transferable `Float32Array`s (id, x, y, heading, occupancy per vehicle/agent) so 60 fps rendering never touches structured clone of the world. The `traffic` payload likewise transfers its congestion `Float32Array`. (Ambient cars were removed in 1.0 — road load is shown via the congestion overlay, not sprites.)

## Rendering

- PixiJS v8 (WebGL2). Layers bottom→top: terrain/water → land-use tint (field grid rendered once to a texture, re-baked on growth ticks) → local streets + building fabric → roads → transit tracks/lines (bold polylines, route colors) → data overlay + congestion-hotspot markers → stations/labels → vehicles → agent dots → construction ghost.
- **Map overlays** (single swappable layer): `density`, `traffic` (green→amber→red congestion heat + animated pulse markers on bottleneck hotspots), `value`, `coverage` (station walk-reach), `nimby`. Toggled from the HUD; on small screens a dedicated mobile Layers strip exposes the same set.
- **Building fabric** is presentation-only, placed along local streets by land use, with per-road keep-out radii and a footprint-occupancy grid so lots never sit on a street or overlap.
- Static layers are cached (`cacheAsTexture` / render-to-texture); per-frame work is only dynamic sprites + camera transform.
- Camera: pan (drag / middle mouse), wheel zoom 0.25×–8× toward cursor, inertial, clamped.

## Save format

`{ version, seed, tick, fields, roads, districts, stations, tracks, routes, vehicles, budget, stats, eventState, commandLog? }` — localStorage keys `metroforge:save:<slot>`, plus export/import as file. The optional command log enables full replay verification.

## Testing

- Vitest on `core/` only. Golden tests: fixed seed → generate city → hash; fixed seed + scripted commands → run 10k ticks → per-100-tick state hashes. These hashes are the acceptance suite for the future native port.
