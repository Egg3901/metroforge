# Changelog

All notable changes to MetroForge are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/); this project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- **Web build is a Cleveland marketing toy.** `/` auto-scopes to one city,
  bus-only tools (station / track / route), and a short coach. Campaign,
  daily, auth, and multi-city free play are no longer mounted in the browser
  shell — the full city runs in the desktop game. Shared storefront identity
  (`#0b0d10`, spoke mark, DM Sans / Fraunces). After two minutes of play a
  non-blocking download CTA appears. See `docs/WEB_TOY.md`.
- **Download page** frames the toy: "Try the toy version in your browser —
  the full city runs in the desktop game."

### Added
- **jsdom mount smoke** (`test/toyMount.test.tsx`) for the toy splash → start
  → CTA path (Pixi / Worker stubbed).
- **Sprite + texture asset pack** (`src/assets/`): tintable top-down vehicle
  sprites (bus / tram / metro / rail), geometric station icons, and tiling
  grain / water / park textures. Vehicles render as tinted Pixi sprites;
  water and park tiles softly sample into the baked ground; grain drives the
  world-fixed detail overlay.
- **Mode-distinct vehicle sprites.** Buses, trams, metros, and railcars each
  have a readable silhouette; zoomed-in capacity bars show per-vehicle load.
- **Finances + Settings HUD buttons** (desktop and mobile), with Budget/Settings
  icons; pause badge when speed is 0; `?` keyboard overlay.
- **Camera keys.** `+`/`−` zoom, `Home` recenter, `0` fit city; zoom % readout;
  min zoom clamped to city size; camera sensitivity setting.
- **Build-mode station hover rings** and numbered route-stop markers.
- **First-steps checklist** in the Objectives panel (station → track → route →
  riders).
- **Budget runway projection** and 7-day net cash-flow sparkline; per-route
  operating P/L in the Lines list and route panel.
- **Route rename** input and **delete confirmation** when removing a line.
- **Goal completion banners** (in addition to toasts).
- **Settings:** pause-on-start, autosave, camera feel, reduce agents.
- **Offline score queue** with retry toast when leaderboard submit fails.

### Changed
- Render depth: vehicles/agents draw under stations and buildings so they no
  longer float over rooftops.
- Vehicle motion advances stop-to-stop (no station overshoot); occupancy varies
  by the segment a vehicle is on.
- Campaign/score sync failures surface as warn toasts.
- **Four more OSM cities.** Philadelphia, San Francisco, Washington, and Seattle
  with historical eras (1907 / 1912 / 1976 / 2009).
- **Historical era scenarios.** NYC 1904, Boston 1897, Chicago 1892, Cleveland
  1955, Atlanta 1979, LA 1963 — each with locked starting modes, era budgets,
  day limits, and approval floors.
- **Goal-based mode unlocks.** Tram / metro / rail unlock from ridership, share,
  or coverage (population remains a fallback); era scenarios can freeze the kit.
- **Real failure.** Approval-floor and time-limit losses join bankruptcy; unified
  fail overlay returns to the menu.
- **Daily challenge.** Shared UTC-date seed + tightened clock; home-screen Daily
  tab with today's board.
- **Server-side OSM replay verification.** `npm run build:verify` bundles the
  sim + city JSON; `/api/score` re-sims the command log and rejects hash mismatches.
- **Cloud campaign stars.** Signed-in accounts sync best-per-scenario stars via
  `GET/POST /api/campaign` (merge-max with local).
- **Procedural audio.** Soft ambient bed + station/track/route/win/fail cues;
  Mute toggle in the HUD (persisted).
- **Guided first-city tutorial.** Five interactive steps with auto tool/overlay,
  camera focus, skip, and home-screen replay.
- **Typography.** Fraunces display + DM Sans for UI and map labels.
- **Parallel corridor bundling.** Shared track corridors offset so overlapping
  lines read as distinct ribbons.
- **Day/night wash.** Soft blue night and warm dawn/dusk veils driven by the
  in-game clock, plus a light edge vignette.
- **Share network card.** HUD Share button exports a 1200×675 PNG of the live
  map with ridership / share / coverage stats.
- **Settings panel.** Basemap (Ink / Satellite), view (Flat / Isometric),
  day-night, vignette, map labels, mute, and tutorial replay — persisted on
  device.
- **Satellite basemap.** Optional aerial-inspired recolor of the baked ground
  (no external imagery tiles).
- **Soft isometric view.** Y-squash camera with extruded building blocks;
  click/pan hit-testing stays aligned.

### Changed
- Muted road hierarchy so the transit network stays the visual hero.
- Tutorial coaching copy is more action-led; active tool button gets a stronger
  highlight while learning.
- Tutorial runs on Free Play only (not eras/daily); first lesson defaults to
  Chicago; station copy is mode-aware.
- Eras picker groups by campaign tier; Objectives panel shows the live scenario
  goal during era/daily runs; free-play map-size control removed (OSM extent).
- HUD shows era label, day/limit countdown, and live scenario progress.
- Scenario picker is now Eras; Daily is the default home tab after the lesson.

## [1.1.0] - 2026-07-08

Real cities and a batch of live-feedback fixes (tracked as GitHub issues #1–#10).

### Added
- **Real OpenStreetMap cities.** New York and Boston are now imported from OSM —
  real street networks (10k / 7.5k roads), real coastlines (Manhattan between the
  Hudson and East River; Boston harbor + the Charles + the downtown peninsula),
  and real parks (Central Park, Boston Common, the Esplanade). Importer:
  `scripts/build-cities.ts` (Overpass → project → simplify → bake water/park
  masks → compact per-city bundle, code-split and lazy-loaded). Marked **REAL**
  in the city picker. (#4)
- **Generation grader.** `npm run grade` renders a matrix of cities to PNGs with
  structural metrics (dangling-end %, grid coherence, water %) and an HTML
  contact sheet — bulk visual QA for generation, no browser needed. (#3)
- **In-game clock.** The HUD shows day + time-of-day advancing, so time visibly
  passes. (#6)
- **Home button.** Return to the start screen from the HUD. (#7)

### Fixed
- **Traffic overlay was always empty.** Car-only OD demand was never recorded
  (only transit-carrying flows were), so the congestion model saw no input. Car
  flows are now captured from the assignment; the heat + bottleneck markers work
  with or without transit built. (#5, #6-traffic)
- **Rigid presets read as radial mush.** Added a citywide global-grid tensor
  basis; procedural NYC/Chicago/LA now hold a coherent oriented grid (grid
  coherence 0.57→0.76+). (partial #4, superseded for NYC/Boston by OSM)
- **Local streets dead-ending.** Local ends now snap to nearby arterials *and*
  local streets, closing grid stubs. (partial #1)

### Known / tracked
- Map labels (street / park / water names) still unrendered (#10); clipping
  artifacts (#2); login (#8) and leaderboard (#9) need a backend.

## [1.0.0] - 2026-07-08

First tagged release. A deterministic, portable transit-sim core with a PixiJS
living-map client — playable end to end, with a congestion model, selectable
real-city presets, and map sizing.

### Added
- **City presets.** New-game picker for New York, Chicago, Los Angeles, Boston,
  Atlanta, Cleveland, plus Random. These are styled-procedural, not GIS imports:
  each tunes the tensor-field generator (grid rigidity/bearing/noise, downtown
  radial pull, coastline vs river vs landlocked, sprawl) so a city reads like its
  real counterpart while staying seed-deterministic. (`core/city/presets.ts`)
- **Selectable map size.** Small / Medium / Large (8 / 12 / 18 km → 64² / 96² /
  144² field cells) at a fixed cell size, so bigger maps mean more city.
- **Traffic congestion system.** Leftover car trips from the demand model are
  rasterized into a live congestion field with ranked bottleneck hotspots,
  recomputed each assignment. Building transit that wins those trips visibly
  thins the heat. (`core/transit/traffic.ts`)
- **Traffic overlay + bottleneck indicators.** A green→amber→red congestion heat
  layer plus animated, severity-coded pulse markers on the worst chokepoints.
- **Mobile layer switcher.** The map-overlay row (Map / Density / Traffic /
  Value / Reach / NIMBY) is now reachable on small screens, not desktop-only.
- **Procedural place names.** Generic-American street/park/neighborhood/city name
  banks; districts now carry stable names. (`core/city/names.ts`)

### Changed
- **Buildings respect street boundaries.** Per-class road keep-out radii plus a
  footprint-occupancy grid stop buildings from drawing on the carriageway or
  overlapping each other.
- **Local streets meet arterials.** A junction-snap pass projects dangling local
  street ends onto the nearest arterial, forming real T-intersections.

### Removed
- **Ambient car sprites.** The cosmetic road cars are gone; road traffic is now
  represented by the congestion overlay instead. (`host/cars.ts` deleted, and the
  `cars` fields dropped from the render frame snapshot.)

[1.0.0]: https://github.com/Egg3901/metroforge/releases/tag/v1.0.0
