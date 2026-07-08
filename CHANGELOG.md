# Changelog

All notable changes to MetroForge are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/); this project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Guided first-city tutorial.** Five interactive steps (density → stations →
  track → route → first riders) with auto tool/overlay selection, camera focus
  on your build, skip, and replay from the home screen.
- **Typography.** Fraunces display + DM Sans for UI and map labels.
- **Parallel corridor bundling.** Shared track corridors offset so overlapping
  lines read as distinct ribbons.
- **Day/night wash.** Soft blue night and warm dawn/dusk veils driven by the
  in-game clock, plus a light edge vignette.
- **Share network card.** HUD Share button exports a 1200×675 PNG of the live
  map with ridership / share / coverage stats.

### Changed
- Muted road hierarchy so the transit network stays the visual hero.
- Tutorial coaching copy is more action-led; active tool button gets a stronger
  highlight while learning.

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
