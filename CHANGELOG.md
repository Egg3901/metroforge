# Changelog

All notable changes to MetroForge are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/); this project uses
[Semantic Versioning](https://semver.org/).

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
