# MetroForge — Deep Improvement Plan

Five phases, ordered so that decisions become meaningful before they become
legible, and the game is worth playing before we add polish and a retention
layer on top. Each phase is independently shippable to `feat/vertical-slice`
and verified in-game (headless screenshot via `scripts/shoot.ts`) before the
next begins.

Status legend: ⬜ not started · 🟡 in progress · ✅ done

---

## Phase 1 — Make network decisions matter (simulation depth) ✅

> Shipped. Fleet→headway coupling (frequency derived from vehicle count),
> real peak-hour capacity + lagged BPR crowding penalty feeding back into
> assignment, overcrowding approval drag, and route/Lines UI (frequency
> readout + crowding meter). Verified in-game and via the test suite.

**Goal:** a well-run network must beat a sloppy one. Today the demand model
(`src/core/transit/assignment.ts`) already does wait cost (headway/2), transfer
penalties, and a logit mode split — but two gaps make operational decisions
inert:

1. **Fleet does nothing.** `moveVehicles` (`sim.ts`) runs every vehicle at full
   speed regardless of count, and `headwaySeconds` is an *independent* editable
   field. Buying vehicles only adds operating cost — it never shortens wait
   time. `vehicleCount` and `headwaySeconds` must be coupled.
2. **Capacity is never enforced.** Assignment lets a route carry unlimited
   riders; `VehicleState.occupancy` is computed but purely cosmetic. Crowding
   has no economic bite.

### 1.1 Fleet → headway coupling
- Add `routeCycleSeconds(state, route)` = out-and-back travel time + dwell at
  every stop (uses existing `routePathLength` and `MODES[mode].speed/dwellSeconds`).
- Derived headway: `headway = clamp(cycleSeconds / vehicleCount, minHeadway, MAX_HEADWAY)`.
  More vehicles → shorter headway → lower wait cost in assignment. Zero vehicles
  → route inactive (already handled).
- Recompute `route.headwaySeconds` whenever `vehicleCount` changes (`editRoute`),
  a route is created, or its track geometry changes (`buildTrack`/`demolishTrack`
  touching a member segment). Store the derived value on the route so assignment
  stays unchanged (it reads `r.headwaySeconds`).
- `editRoute`: retire the manual `headwaySeconds` input as a player lever;
  `vehicleCount` (buy/sell fleet) becomes the single frequency control. Keep the
  command field for back-compat but always overwrite with the derived value.

### 1.2 Capacity + crowding feedback
- Line capacity (pax/hour/direction) = `vehicleCapacity * 3600 / headwaySeconds`.
- Peak load proxy from last assignment's `routeRidership` × a peak-hour fraction
  constant. `crowding = peakLoad / capacity`, stored on `RouteDef`
  (`load`, `capacity`, `crowding`) for UI + feedback.
- Feed crowding back into assignment as a discomfort penalty (BPR-style) added to
  the route's ride/boarding edge cost: `penaltyMin = max(0, crowding - KNEE) * K`.
  This is **lagged** (uses the previous assignment's crowding) — stable and cheap
  because assignment runs every `ASSIGNMENT_INTERVAL_TICKS`. Overcrowded routes
  become less attractive → riders divert to alternates or car → equilibrium.
- Approval takes a small hit from sustained overcrowding (`updateApproval`).

### 1.3 Surface it (UI)
- `RoutePanel`: vehicle count as primary control (buy/sell with $ + resale
  preview), derived headway readout, a load/capacity bar, crowding %.
- `RoutesPanel` (Lines overview) + `StationPanel`: crowding indicator per line
  (extends the station reddening already shipped).
- Transfers already modelled — expose transfer count on a selected trip/route so
  the mechanic is visible.

**Done when:** adding a vehicle to a crowded line visibly drops its crowding and
raises its ridership; an underfunded line sheds riders to car; the numbers in
the Lines/Finances panels move in response.

**Files:** `constants.ts`, `types.ts` (RouteDef fields), `commands.ts`
(editRoute/createRoute/buildTrack), `sim.ts` (moveVehicles, refreshAssignment,
updateApproval), `transit/assignment.ts` (crowding penalty), `app/Panels.tsx`,
`app/store.ts`.

---

## Phase 2 — Show players why (legibility & diagnostics) ✅

> Shipped: **unserved-demand ("Gaps") overlay** (desire lines for OD pairs that
> drive because transit fails them), **per-station board/alight**, **per-link
> segment load** (route core widens by load + a Load-by-segment breakdown), and
> plain-language **"what is happening" insight cues** in Finances. Deferred as
> optional: an interactive trip inspector (low value while gaps are unserved).

**Goal:** make the sim readable so building next is reading, not guessing.

- **Unserved-demand overlay.** Assignment already produces `carFlows` (every OD
  pair that drove). Render desire lines / a heat layer for high car-flow pairs
  poorly served by transit — "where the demand is that you're missing." New
  overlay mode alongside Density/Traffic/Value/Reach/NIMBY.
- **Per-station board/alight + per-link load.** `stationBoardings` exists;
  extend assignment to also emit alightings and per-segment load. Show on the
  StationPanel and on a selected route (segment thickness ∝ load).
- **"Why did it change?" cues.** Attribute ridership deltas to events / capacity
  / a new competing route. Small text on the Finances + Lines panels.
- **Trip inspector.** Click an OD desire line → the chosen path (walk → line →
  transfer → line → walk) with the generalized-cost breakdown.

**Done when:** a new player can answer "why is this line empty?" from the UI
alone.

**Files:** `transit/assignment.ts` (emit alightings/segment loads/unserved),
`render/overlays.ts` + `renderer.ts`, `HUD.tsx` (overlay option), `Panels.tsx`.

---

## Phase 3 — A reason to keep playing (progression & campaign) ✅

> Shipped: campaign spine with **historical era scenarios** (NYC 1904, Boston
> 1897, Chicago 1892, Cleveland 1955, Atlanta 1979, LA 1963), star-gated tiers,
> **goal-based mode unlocks** (ridership / share / coverage, with population
> fallback), **real failure** (bankruptcy + approval floor + time limit), and
> difficulty-tuned starting cash/subsidy per era.

---

## Phase 4 — Game-feel & onboarding (polish that sells it) 🟡

> Shipped: guided tutorial, typography, corridor bundling, day/night wash,
> Share card. Remaining: audio / ambient bed.

---

## Phase 5 — Retention & meta (live-game layer) 🟡

> Shipped: **command log** on every successful command, **replay envelope** in
> saves + score submit, **daily challenge** (shared seed from UTC date), and
> server storage of `stateHash` / command log for audit. Full server-side
> headless re-sim of OSM cities remains a follow-up (client + CI verify today).

**Goal:** leverage the self-hosted backend (`server/index.mjs`) for a live game.

- **Replay-validated leaderboards.** Saves are deterministic (command log +
  `stateHash`). Validate submitted scores server-side by re-simulating the
  command stream and checking the hash — anti-cheat most indie sims can't do.
- **Daily/weekly challenge.** One seeded city + goal + shared board. The
  retention engine.
- **Profiles & cross-device progression.** Extend the accounts system to persist
  campaign stars and best scores.

**Files:** `server/index.mjs`, `core/save.ts`, `core/replay.ts`, `app/api.ts`,
`app/daily.ts`, `app/App.tsx`.

---

## Working agreement
- Ship per phase to `feat/vertical-slice`; never push to `main` (user merges).
- Verify every renderer/store change in-game with a screenshot before commit
  (a store bug once tore down the Pixi renderer — verify, don't assume).
- Player-facing copy: no em/en dashes, no AI-filler tone.
- Roadmap + design notes live in the ops-knowledge MCP under project
  `metroforge` (siloed); this file is the in-repo implementation tracker.
