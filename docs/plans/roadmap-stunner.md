# MetroForge — Roadmap to a Stunner

Goal: turn a correct-but-flat transit sim into a game that is both **beautiful**
and **deep** — a recognizable, living real-world city you build transit into and
compete on. This plan does *all* of it, sequenced so every step ships something
visibly better and nothing is half-done.

Status baseline (v1.1.x): real OSM cities (NYC, Boston) with crisp water/parks,
real road networks, working sim core (OD-flow demand, mode choice, economy),
traffic congestion overlay, in-game clock, headless screenshot QA
(`scripts/shoot.ts`) and a generation grader (`scripts/grade.ts`).

## Identity — Elegant Transit Canvas (chosen)

We commit to the **Elegant Transit Canvas**: the real city (real OSM coastlines
and streets) rendered as an *intentional, minimal, beautiful map* — think a
gorgeous printed transit map meets Mini Metro's motion. **Not** photoreal, no
extrusion, no faux-3D. The rules:

- **Transit is the hero.** The street grid is muted and backgrounded; the network
  you build — bold smooth colored lines, crisp interchange nodes, clean station
  icons — is what pops.
- **Restrained, cohesive palette.** A designed set of tokens (land / water / park
  / road / line colors) replaces today's muddy tones. Flat, elegant, high-contrast
  where it matters.
- **Motion is signature, not busy.** Animated passenger flows along lines; buttery
  camera; tasteful ambient life. Every moving thing earns its place.
- **Typography matters.** Map labels (streets, districts, water, parks) make it
  read as a designed object, not a diagram.

Why A over a Living-City 2.5D: it plays to a 2D Pixi renderer instead of fighting
it, is far harder to make ugly, ships faster, and is a sharper identity than a
budget city-builder. Every phase is verified against a screenshot, not vibes.

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

## Track A — Graphics (Elegant Transit Canvas)

### A1 · Visual system & palette  ⟶ biggest immediate win
Define a cohesive design-token palette (land / water / park / road / line / text)
and re-skin the base map: clean flat land, elegant flat water with a crisp
shoreline (the crisp OSM mask already supports this), muted **backgrounded** road
network with a refined arterial→local weight hierarchy. This is what kills the
"muddy / half-assed" look. **Effort: M.** Touches `renderer.ts` bakeGround +
drawRoads. Depends on: nothing.

### A2 · Transit as hero
Make the network beautiful: smooth rounded line geometry, colored casings +
halos, clean parallel-offset bundling where lines share a corridor, crisp
mode-distinct station icons, elegant interchange nodes. The thing you build should
be the most beautiful thing on screen. **Effort: M.** Depends on: A1.

### A3 · Animated passenger flows
The signature motion: elegant particles/dots flowing along active lines at a rate
tied to real ridership from the OD model (data we already compute). Restrained,
not busy. **Effort: M.** Depends on: A2 + flow data (done).

### A4 · Labels & typography (folds in #10)
Zoom-gated map labels for streets, districts, water bodies, and parks; refined
station labels; a considered type scale across the HUD/panels. Makes it read as a
designed object. **Effort: M.** Needs water/park/street names (partly generated in
`core/city/names.ts`; OSM names available for real cities).

### A5 · Motion & polish
Buttery camera (eased pan/zoom, momentum), smooth state transitions, tasteful
ambient life (subtle water shimmer, gentle line pulse on load), a light vignette
for focus, and a full consistency pass. **Effort: M.** Depends on: A1–A3.

### A6 · Building treatment (restrained)
Buildings as *flat, elegant* map fills, not 3D. Option 1: import real OSM
`building=*` footprints and render as subtle tinted shapes. Option 2: refined
density shading with no explicit buildings. Whichever reads cleaner without
stealing focus from transit — decide by screenshot. **Effort: S–M.**

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

## Technical strategy: 2D is the destination, not a stepping stone

The Elegant Transit Canvas lives entirely in Pixi v8 (WebGL) — palette, crisp
vector map, haloed transit lines, particle flows, labels, and eased camera are
all 2D-native and cheap. There is **no** planned 3D/native rewrite for this
direction; the renderer-agnostic core stays pure as good hygiene, but A does not
require escaping Pixi. That's a feature: the whole visual target is reachable and
performant on the current stack.

---

## Milestones (recommended interleave)

**M1 — "An elegant map"**: A1 + A2 (visual system/palette + transit-as-hero). This
is the transformative visual milestone and the fastest cure for the half-assed
feel. Start here.

**M2 — "Alive & designed"**: A3 + A4 + A5 (passenger flows, labels/typography,
motion & polish) + A6 building treatment.

**M3 — "It's a game"**: D1 + D3 + P1 + P2 (progression, real-city history
scenarios, accounts, leaderboards).

**Continuous**: more OSM cities, economy/depth tuning, generation cleanup.

## Open decisions
1. Backend for P1/P2: managed vs self-hosted on the ops box.
2. A6 building treatment: real OSM footprints (flat) vs density shading — decide
   by screenshot during M2.
