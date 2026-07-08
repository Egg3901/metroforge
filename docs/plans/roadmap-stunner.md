# MetroForge — Roadmap to a Stunner

Goal: turn a correct-but-flat transit sim into a game that is both **beautiful**
and **deep** — a recognizable, living real-world city you build transit into and
compete on. This plan does *all* of it, sequenced so every step ships something
visibly better and nothing is half-done.

Status baseline (v1.1.x): real OSM cities (NYC, Boston) with crisp water/parks,
real road networks, working sim core (OD-flow demand, mode choice, economy),
traffic congestion overlay, in-game clock, headless screenshot QA
(`scripts/shoot.ts`) and a generation grader (`scripts/grade.ts`).

## Identity

We commit to the **Living City** direction (rich 2.5D), and we borrow the
*discipline* of the Elegant Transit Canvas throughout: restrained palette, clean
typography, readable line work, buttery motion. "Alive" is the north star;
"tasteful" is the constraint. Every phase is verified against a screenshot, not
vibes.

## Guiding principles

1. **Thin vertical slices.** Each phase is shippable and visibly better.
2. **Verify on screen.** `scripts/shoot.ts` captures the real running game; no
   more shipping render changes blind.
3. **Keep the core pure.** All visual work lives in `render/` + `app/`; the
   deterministic sim core (`core/`) stays renderer-agnostic. This is also what
   makes an eventual native/3D renderer a swap, not a rewrite.
4. **Leverage the OSM pipeline.** `scripts/build-cities.ts` already fetches,
   projects, simplifies, and bakes masks — buildings/land-use are the same shape.

---

## Track A — Graphics (the "stunner")

### G1 · Real building footprints  ⟶ biggest single win
Import OSM `building=*` polygons (same pipeline as roads/water). Replace the
guessed squares in `renderer.ts drawBuildings` with real footprints, colored by
land use (`building`, `amenity`, sampled jobs/pop). Bundle as a compact polygon
list per city. **Effort: M.** Depends on: OSM pipeline (done).

### G2 · Faux-3D extrusion + sun shadows
Extrude footprints by height (OSM `building:levels` / `height`, else land-use
heuristic). Render as offset-and-fill prisms in Pixi with a single consistent
light direction and soft drop shadows. Instant depth and "city." **Effort: M.**
Depends on: G1.

### G3 · Day/night + lighting
Drive a time-of-day cycle from the clock already in the HUD. Scene-wide ambient
tint (dawn/day/dusk/night), building windows glow at night, warm street l+ cool
shadow. This is the phase that makes it feel *alive*. **Effort: M.** Pixi color
matrix / lighting layer. Depends on: G2.

### G4 · Materials
Animated water shader (ripple + depth gradient + shoreline foam — replaces the
flat navy), textured ground, park foliage, road surface + lane markings on
arterials. **Effort: M–L.** Pixi custom filters (WebGL). Depends on: renderer.

### G5 · Motion & FX
Transit vehicles with headlights along routes; passenger-flow particles on busy
links; bloom on lights, subtle vignette + grain post; smooth camera with a slight
tilt/parallax for depth. **Effort: M.** Depends on: G2/G3.

### G6 · UI/HUD system
A cohesive visual system: type scale, iconography, panel styling, motion. Make
the chrome feel as considered as the map. **Effort: M**, continuous.

---

## Track B — Game depth (a stunner *game*, not just a map)

### D1 · Progression & goals
Objectives, milestone rewards, richer unlock cadence (modes already unlock by
population). Give the sandbox a spine. **Effort: M.**

### D2 · Events & dynamics
Rush-hour demand curve (partly present), disruptions (floods on the real water,
strikes, breakdowns), and *visible* citizen-happiness feedback tied to coverage /
crowding / commute time. **Effort: M–L.**

### D3 · Real-city scenarios + history
The signature hook. Era-based starts with real stakes: "NYC 1904 — build the
first subway," "Rebuild the MBTA." Win/lose conditions per city. Real cities +
real history is a pitch nobody else has. **Effort: L.** Depends on: OSM cities,
D1.

### D4 · Economy depth
Fare/subsidy tuning, land-value + transit-oriented-development feedback loops
(partly present in `sim.ts runGrowth`), farebox-recovery goals. **Effort: M.**

---

## Track C — Platform / social

### P1 · Accounts (#8)
Auth + persistence backend. Decision needed: managed (Supabase/Auth0) vs
self-hosted on the existing ops box. Currently the app is static/no-backend.
**Effort: M**, gated on a backend decision.

### P2 · Leaderboards (#9)
Rank runs (ridership / mode share / coverage / approval at a milestone) per real
city. **Anti-cheat is a solved problem here**: the sim is deterministic and
replay-verifiable (`save/stateHash` + optional command log) — the server replays
the command log to validate a score. Strong, honest leaderboards. **Effort: M.**
Depends on: P1.

### P3 · Cloud saves, sharing, more cities
Shareable city/network permalinks, cloud saves, and a growing roster of imported
OSM cities (Chicago/LA/Atlanta/Cleveland next; pipeline is a bbox + a re-run).
**Effort: S–M each.**

---

## Cross-cutting cleanup (existing issues)
- #10 map labels (street / park / water names) — render zoom-gated labels.
- #1 / #2 procedural generation cleanup — moot for OSM cities, still for stylized.
- More OSM cities (#P3).

---

## Technical strategy: the Pixi ceiling

Push Pixi v8 (WebGL) through **G1–G5** — extrusion, shadows, lighting, day/night,
water/material shaders, and motion all work in 2.5D without a 3D engine. The
trigger to move to a real 3D renderer (Three.js / deck.gl / native) is when we
want *true volumetric* buildings, a free-tilt camera, or agent counts a 2D scene
graph can't hold. Defer that until we've hit the 2.5D ceiling. The deterministic,
renderer-agnostic core (and the command-log determinism contract in
`docs/ARCHITECTURE.md`) is exactly the bridge that makes it a renderer swap, not a
rewrite.

---

## Milestones (recommended interleave)

**M1 — "It looks like a city"**: G1 + G2 + G3 (real buildings, shadows,
day/night). The transformative visual milestone. Start here.

**M2 — "It feels alive"**: G4 + G5 (materials, motion, FX) + G6 UI pass.

**M3 — "It's a game"**: D1 + D3 + P1 + P2 (progression, real-city history
scenarios, accounts, leaderboards).

**Continuous**: more OSM cities, label rendering (#10), economy/depth tuning,
generation cleanup.

## Open decisions
1. Backend for P1/P2: managed vs self-hosted on the ops box.
2. Building height source confidence (OSM levels coverage varies) — heuristic
   fallback by land use.
3. When to start the 3D/native track (proposed: after M2).
