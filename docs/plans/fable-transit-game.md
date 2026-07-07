# Fable Handoff: MetroForge — Procedural City Transit Builder

## Goal

Build a single-player 2D public transit network builder game where the player designs and manages a transit system in a procedurally generated city that grows in response to their network. The player places stations, lays track/roads, configures routes, and manages a budget — balancing coverage, speed, capacity, and cost. The city evolves: neighborhoods near well-served stations densify, neglected areas stagnate, and new districts emerge at the city edge.

**Inspirations to study before building:** Mini Metro (abstract station/passenger UI), OpenTTD (track construction tooling + signaling), Cities Skylines (zoning + growth feedback), NIMBY Rails (route/timetable depth), Sid Meier's Railroads (economic layer), Subway Builder (underground layer visualization).

**Host at:** `transit.ahousedividedgame.com` (static site, single player, no backend).

---

## Phase 0: Research (DO THIS FIRST)

Before writing any code, research the following and report findings. This informs every design decision in later phases.

### 0A. Transit System Fundamentals
Research and summarize:
- How real metro/bus networks are structured (hub-and-spoke vs grid vs radial)
- Typical station spacing for bus (300-500m), tram (400-800m), metro (800-1500m)
- Headway ranges (bus 5-15min, metro 2-10min peak)
- Capacity per vehicle type (bus ~60, tram ~200, metro car ~150-200, train set up to 1000+)
- Construction costs per km: bus lane ~$1-3M, LRT ~$20-50M, metro ~$100-500M
- Operating costs: roughly 30-70% labor, 10-20% energy, remainder maintenance

### 0B. City Generation Techniques
Research and report:
- Procedural city generation approaches (noise-based terrain, population density kernels, road network generation)
- How real cities structure their road hierarchy (arterial → collector → local)
- Population density patterns (CBD peak, inner suburbs, outer suburbs decay)
- How transit accessibility affects land value / density (the "metro premium")
- Employment center clustering (downtown, industrial zones, office parks, university anchors)

### 0C. Game Balance & Pacing
Research and report:
- Typical farebox recovery ratios for transit agencies (30-60% from fares, rest from subsidies)
- How to model a municipal subsidy that declines as the network proves itself
- What makes transit games fun (Mini Metro: pressure from overcrowding. OpenTTD: optimization puzzle. CS: creative freedom.)
- The "NIMBY" mechanic — how community opposition blocks routes through wealthy neighborhoods

### 0D. Existing Games — What Works
Play/watch at least one session each of Mini Metro, OpenTTD, and NIMBY Rails. Report:
- What 3 mechanics from each game feel the best (the "one more turn" hook)
- What 2 things from each game are tedious/boring
- How each game handles the construction UX (track-laying, station placement, route editing)
- Screenshot references for UI layout and visual style

---

## Phase 1: Tech Stack & Project Setup

### Stack Decision
After research, choose ONE of these stacks based on what best fits a procedural 2D game with UI panels:

**Option A — Canvas + React (Recommended):**
- React for UI panels (budget sidebar, station inspector, route editor)
- HTML5 Canvas for the game viewport (procedural city + transit network)
- Zustand for game state management
- Tailwind CSS for UI styling
- TypeScript throughout
- Vite for build (fast HMR, static export)

**Option B — PixiJS + Vanilla TS:**
- PixiJS for the game viewport (WebGL-accelerated 2D)
- Vanilla TypeScript for game logic
- Custom UI rendered in PixiJS or DOM overlay
- Vite for build

**Option C — Phaser 3:**
- Full game framework (scene management, input, physics, tilemaps)
- Heavier but more built-in game infrastructure
- Can still use React overlay for complex UI

Choose based on: (a) which handles ~10,000 animated passengers on screen, (b) which has the best tilemap/procedural generation support, (c) development speed.

### Project Scaffold

```
metroforge/
├── public/
├── src/
│   ├── main.tsx              # Entry point
│   ├── App.tsx               # Top-level layout
│   ├── game/
│   │   ├── GameCanvas.tsx    # Canvas component
│   │   ├── camera.ts         # Pan/zoom camera
│   │   ├── renderer.ts       # Draw city, tracks, stations, trains, passengers
│   │   ├── input.ts          # Click/drag handlers, tool modes
│   │   └── layers.ts         # Render layers (terrain, zoning, tracks, vehicles, UI overlay)
│   ├── city/
│   │   ├── generator.ts      # Procedural city generation (terrain, roads, zoning)
│   │   ├── population.ts     # Population density model
│   │   ├── growth.ts         # City growth in response to transit access
│   │   └── demand.ts         # Origin-destination trip generation
│   ├── transit/
│   │   ├── types.ts          # Station, Track, Route, Vehicle, TransitMode types
│   │   ├── station.ts        # Station placement, capacity, upgrades
│   │   ├── track.ts          # Track/road construction, cost, terrain constraints
│   │   ├── route.ts          # Route creation, stop ordering, headway config
│   │   ├── vehicle.ts        # Vehicle purchase, maintenance, depot management
│   │   └── passenger.ts      # Passenger spawning, routing, boarding/alighting
│   ├── economy/
│   │   ├── budget.ts         # Revenue (fares) and costs (construction, ops, maintenance)
│   │   ├── fares.ts          # Fare policy (flat, distance-based, zone-based)
│   │   └── subsidy.ts        # Municipal subsidy that declines over time
│   ├── simulation/
│   │   ├── tick.ts           # Main simulation loop (passenger spawning, vehicle movement, growth)
│   │   ├── pathfinding.ts    # A* or Dijkstra for passenger route finding on the network
│   │   └── congestion.ts     # Station/platform crowding, vehicle occupancy
│   ├── ui/
│   │   ├── HUD.tsx           # Top bar: cash, date, population, approval rating
│   │   ├── Toolbar.tsx       # Construction tools: station, track, bulldoze, inspect
│   │   ├── StationPanel.tsx  # Station inspector: ridership, upgrades, rename
│   │   ├── RoutePanel.tsx    # Route editor: stops, headways, vehicle assignment
│   │   ├── BudgetPanel.tsx   # Financial overview: revenue breakdown, cost breakdown
│   │   ├── CityStats.tsx     # Population, employment, modal share, coverage
│   │   └── ModeSelector.tsx  # Switch between Bus / Tram / Metro / Rail construction
│   ├── store/
│   │   └── gameStore.ts      # Zustand store: game state, selected tool, selected entity
│   └── types/
│       └── index.ts          # Shared types
├── index.html
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── vite.config.ts
└── README.md
```

### Vite Config
```typescript
// vite.config.ts
export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
```

Build command: `npm run build` → outputs to `dist/` → deploy static files.

---

## Phase 2: Data Model & Game State

### Core Types

```typescript
// src/types/index.ts

// ── Map / Terrain ──
export type TileType = 'water' | 'grass' | 'forest' | 'park' | 'road' | 'building';
export type ZoneType = 'residential_low' | 'residential_med' | 'residential_high' | 'commercial' | 'industrial' | 'office' | 'mixed' | 'civic' | 'park';

export interface Tile {
  x: number;
  y: number;
  type: TileType;
  zone: ZoneType | null;
  elevation: number;        // 0-255, for terrain contouring
  population: number;        // residents on this tile
  employment: number;        // jobs on this tile
  landValue: number;         // $/m², affected by transit access
  buildingHeight: number;    // floors
}

// ── Grid ──
export interface CityMap {
  width: number;             // tiles (default 200)
  height: number;            // tiles (default 200)
  tileSize: number;          // pixels (default 32)
  tiles: Tile[][];
  seed: number;              // RNG seed for reproducible generation
}

// ── Transit ──
export type TransitMode = 'bus' | 'tram' | 'metro' | 'commuter_rail';

export interface Station {
  id: string;
  name: string;
  x: number;                 // tile x
  y: number;                 // tile y
  modes: TransitMode[];      // which modes serve this station
  platforms: number;         // number of platforms/tracks
  capacity: number;          // max passengers waiting (upgradeable)
  level: number;             // station upgrade level (1-5)
  ridership: number;         // daily boardings (rolling average)
  connections: string[];     // station IDs this links to via tracks
}

export interface Track {
  id: string;
  fromStationId: string;
  toStationId: string;
  mode: TransitMode;
  tiles: { x: number; y: number }[];  // path through the grid
  length: number;            // in tiles
  cost: number;              // construction cost already paid
  maintenanceCost: number;   // per-day cost
  grade: 'at_grade' | 'elevated' | 'underground';
  speed: number;             // kph (mode-dependent with grade multiplier)
}

export interface Route {
  id: string;
  name: string;
  color: string;             // display color on map
  mode: TransitMode;
  stopIds: string[];         // ordered station IDs
  headwaySeconds: number;    // time between trains/buses
  vehicles: Vehicle[];
  fare: number;              // per-ride
  dailyRidership: number;
  dailyRevenue: number;
}

export interface Vehicle {
  id: string;
  type: TransitMode;
  capacity: number;
  speed: number;             // kph
  maintenanceCost: number;   // per-day
  purchaseCost: number;
  currentStationId: string | null;
  currentTrackId: string | null;
  progress: number;          // 0-1 along current track
  passengers: number;        // current occupancy
  direction: 'forward' | 'reverse';  // along route
  status: 'at_station' | 'moving' | 'depot';
}

// ── Passenger ──
export interface Passenger {
  id: string;
  originX: number;           // departure tile
  originY: number;
  destX: number;             // destination tile
  destY: number;
  status: 'walking_to_station' | 'waiting' | 'onboard' | 'walking_to_dest' | 'arrived';
  currentStationId: string | null;
  currentRouteId: string | null;
  currentVehicleId: string | null;
  waitTime: number;          // seconds spent waiting
  totalTripTime: number;     // seconds from spawn to arrival
  transfers: number;
}

// ── Economy ──
export interface Budget {
  cash: number;               // current balance
  dailyRevenue: {
    fares: number;
    subsidy: number;
    advertising: number;
    other: number;
  };
  dailyCosts: {
    operations: number;       // driver salaries, energy
    maintenance: number;      // track + vehicle upkeep
    construction: number;     // active construction projects
    interest: number;         // debt interest
  };
  loanBalance: number;        // outstanding loans
  loanRate: number;           // annual interest rate
}

// ── City Stats ──
export interface CityStats {
  population: number;
  employment: number;
  modalShare: {
    car: number;              // %
    transit: number;          // %
    walking: number;          // %
    cycling: number;          // %
  };
  transitCoverage: number;    // % of population within 400m of a station
  averageTripTime: number;    // minutes
  congestionIndex: number;    // 0-100
  approvalRating: number;     // 0-100 (affects subsidy and NIMBY events)
  dailyRidership: number;
  stationsByMode: Record<TransitMode, number>;
  routeCount: number;
}

// ── Full Game State ──
export interface GameState {
  map: CityMap;
  stations: Record<string, Station>;
  tracks: Record<string, Track>;
  routes: Route[];
  vehicles: Record<string, Vehicle>;
  passengers: Passenger[];
  budget: Budget;
  cityStats: CityStats;
  day: number;                // game day (1 day ≈ 10 minutes real-time at 1x speed)
  speed: number;              // 0 (paused) | 1x | 2x | 4x
  selectedTool: ToolType;
  selectedEntityId: string | null;
  difficulty: 'easy' | 'normal' | 'hard';
}

export type ToolType = 
  | 'select' 
  | 'station_bus' | 'station_tram' | 'station_metro' | 'station_rail'
  | 'track_bus' | 'track_tram' | 'track_metro' | 'track_rail'
  | 'bulldoze' 
  | 'inspect'
  | 'route_create' | 'route_edit';
```

### Mode-Specific Constants

```typescript
// src/transit/types.ts

export const MODE_CONFIG: Record<TransitMode, {
  label: string;
  icon: string;
  trackCostPerTile: number;        // $
  stationCost: number;              // $ base
  vehicleCost: number;              // $ per vehicle
  vehicleCapacity: number;
  vehicleSpeed: number;             // kph
  maintenancePerTilePerDay: number; // $
  maintenancePerVehiclePerDay: number; // $
  defaultHeadway: number;           // seconds
  maxFrequency: number;             // vehicles per hour
  gradeOptions: ('at_grade' | 'elevated' | 'underground')[];
  gradeCostMultipliers: Record<string, number>;
  noiseImpact: number;              // 0-1, affects NIMBY
  capacityPerStation: number;       // max waiting passengers
  constructionTime: number;         // days
}> = {
  bus: {
    label: 'Bus',
    icon: '🚌',
    trackCostPerTile: 200,
    stationCost: 5000,
    vehicleCost: 80000,
    vehicleCapacity: 60,
    vehicleSpeed: 40,
    maintenancePerTilePerDay: 0.5,
    maintenancePerVehiclePerDay: 50,
    defaultHeadway: 600,
    maxFrequency: 30,
    gradeOptions: ['at_grade'],
    gradeCostMultipliers: { at_grade: 1 },
    noiseImpact: 0.3,
    capacityPerStation: 200,
    constructionTime: 3,
  },
  tram: {
    label: 'Tram / Light Rail',
    icon: '🚊',
    trackCostPerTile: 8000,
    stationCost: 50000,
    vehicleCost: 1500000,
    vehicleCapacity: 200,
    vehicleSpeed: 60,
    maintenancePerTilePerDay: 5,
    maintenancePerVehiclePerDay: 200,
    defaultHeadway: 300,
    maxFrequency: 20,
    gradeOptions: ['at_grade', 'elevated'],
    gradeCostMultipliers: { at_grade: 1, elevated: 3 },
    noiseImpact: 0.5,
    capacityPerStation: 500,
    constructionTime: 14,
  },
  metro: {
    label: 'Metro / Subway',
    icon: '🚇',
    trackCostPerTile: 50000,
    stationCost: 5000000,
    vehicleCost: 3000000,
    vehicleCapacity: 1000,
    vehicleSpeed: 80,
    maintenancePerTilePerDay: 20,
    maintenancePerVehiclePerDay: 500,
    defaultHeadway: 180,
    maxFrequency: 30,
    gradeOptions: ['underground', 'at_grade', 'elevated'],
    gradeCostMultipliers: { underground: 1, at_grade: 0.4, elevated: 0.8 },
    noiseImpact: 0.1,
    capacityPerStation: 2000,
    constructionTime: 90,
  },
  commuter_rail: {
    label: 'Commuter Rail',
    icon: '🚆',
    trackCostPerTile: 15000,
    stationCost: 2000000,
    vehicleCost: 5000000,
    vehicleCapacity: 1500,
    vehicleSpeed: 120,
    maintenancePerTilePerDay: 8,
    maintenancePerVehiclePerDay: 800,
    defaultHeadway: 900,
    maxFrequency: 12,
    gradeOptions: ['at_grade', 'elevated'],
    gradeCostMultipliers: { at_grade: 1, elevated: 2.5 },
    noiseImpact: 0.7,
    capacityPerStation: 3000,
    constructionTime: 60,
  },
};
```

---

## Phase 3: Core Systems — Build Order

Build in dependency order. Each system must be complete and testable before moving to the next.

### 3A. Procedural City Generator (`src/city/generator.ts`)

Generate a 200×200 tile city from a seed:

1. **Terrain:** Use 2D simplex/perlin noise at multiple octaves for elevation. Water below sea level threshold (default ~15%). Hills at high elevation. Add a river (flows from high elevation to water edge, width 1-3 tiles). Add a coastline if map has water edge.

2. **Road Network:** Generate arterial roads first — a grid with some organic variation (jitter grid points, delete roads that hit water). Add collector roads branching off arterials. Local streets fill residential blocks. Ensure connectivity: every tile must be reachable from every other tile via the road network (flood fill check, add bridges over water).

3. **Zoning:** Place zones based on distance from city center and roads:
   - CBD at city center (high density commercial + office + mixed)
   - Industrial zones near water/rail access, downwind from residential
   - Residential rings: high density near center, medium density mid-ring, low density outer
   - Parks scattered in residential areas
   - Civic buildings (schools, hospitals, university) placed as anchors
   - Ensure ratios: ~50% residential, ~15% commercial, ~10% industrial, ~10% office, ~5% civic, ~10% parks/mixed

4. **Population:** Assign population to residential tiles based on zone density × land value. Employment to commercial/industrial/office tiles. Total starting city: ~50,000-200,000 depending on difficulty.

5. **Land Value:** Initialize with a heatmap: high near CBD, near parks, near water views. Decays with distance.

6. **Visual style:** Dark-themed, warm color palette. Tiles colored by zone type. Roads as dark gray. Water as dark blue. Parks as muted green. Buildings as subtle rectangles scaled by height. Reference Mini Metro's color coding for transit lines.

### 3B. Camera & Renderer (`src/game/`)

1. **Camera:** Pan by middle-mouse drag or edge-scroll. Zoom with scroll wheel (1x to 8x). Smooth interpolation on pan/zoom. Clamp to map bounds.

2. **Render layers** (bottom to top):
   - Terrain (elevation tint, water, grass)
   - Zone colors (subtle tint overlay, not full saturation — keep it readable)
   - Roads (dark gray lines)
   - Buildings (small rectangles, height-scaled, zone-colored)
   - Tracks/roads (transit infrastructure — bright colored lines by route)
   - Stations (icons scaled by mode + level, ridership pulse animation)
   - Vehicles (small colored dots moving along tracks)
   - Construction preview (ghost track/station while placing)
   - Selection highlight (pulsing outline on selected entity)
   - UI overlay (station names, route labels at zoom > 2x)

3. **Performance:** Render only visible tiles (culling). Use offscreen canvas for static layers (terrain, zones, roads, buildings) — redraw only when city changes, not every frame. Vehicles and passengers on separate canvas composited on top.

4. **Station icons:** Distinct shapes per mode. Bus = small circle, Tram = diamond, Metro = square, Rail = hexagon. Size scales with station level. Color = route color. Pulse animation when passengers waiting > 50% capacity.

### 3C. Input & Construction Tools (`src/game/input.ts` + `src/ui/Toolbar.tsx`)

**Tool system:**
- `select` — click to select station/route/vehicle, inspect panel opens
- `station_*` — click on map to place station (validated: must be within 1 tile of a road, not on water)
- `track_*` — click on origin station → drag/click waypoints → click destination station to complete. While drawing: show ghost line, cost estimate, and red X on invalid tiles (water, too steep). Right-click to cancel.
- `bulldoze` — click on station or track to demolish (refund 25% of cost, confirmation dialog)
- `route_create` — after selecting, click stations in order to create a route. Double-click or press Enter to finish.
- `route_edit` — click existing route to open editor, drag stops to reorder, add/remove stops
- `inspect` — hover shows tooltip with tile info (population, land value, zone)

**Track construction rules:**
- Bus: can use existing roads (cost = just painting the lane, 20% of full cost). Can also build dedicated busways (full cost).
- Tram: can use roads (50% of full cost), can build dedicated ROW.
- Metro: underground by default, can build elevated or at-grade with cost modifiers.
- Commuter rail: at-grade by default, can elevate.
- All tracks: cannot go through water tiles (bridge required — costs 5× per tile). Cannot go up slopes > 15% grade without tunneling/elevating.
- Track between stations uses A* pathfinding with terrain cost weights. Player can adjust the path.

**Keyboard shortcuts:**
- `1-4`: Select transit mode (Bus/Tram/Metro/Rail)
- `S`: Station placement tool for current mode
- `T`: Track tool for current mode
- `R`: Route creation tool
- `B`: Bulldoze tool
- `Esc`: Cancel current action / deselect
- `Space`: Pause/play
- `+/-`: Speed up/down
- `Delete`: Demolish selected entity

### 3D. Route & Vehicle System (`src/transit/`)

**Route creation:** Player clicks stations in sequence. The route auto-generates the shortest path through existing tracks between consecutive stations. If no track exists between two stations, player is prompted to build it first.

**Route validation:**
- Minimum 2 stops
- Must form a connected path via existing tracks
- All tracks must support the route's mode
- Loop routes allowed (first and last stop are the same station)

**Vehicle assignment:**
- Player assigns N vehicles to a route
- Vehicles spawn at the first stop, spaced evenly along the route
- Vehicles follow the route in a loop, stopping at each station
- Dwell time at station: 15-60 seconds depending on passenger volume
- Headway = route round-trip time / number of vehicles

**Depot:** Each mode requires at least one depot within 50 tiles of a served station. Depot costs mode-specific. Max vehicles per depot: 50 (bus), 30 (tram), 20 (metro), 15 (rail).

### 3E. Passenger Simulation (`src/transit/passenger.ts` + `src/simulation/pathfinding.ts`)

**Trip generation:** Each game day, generate N trips where N = city population × trip rate (0.8-1.5 depending on time of day).

- Origin: weighted by residential population density
- Destination: weighted by employment density (for work trips, 60%) or random commercial/civic tile (for other trips, 40%)

**Pathfinding for passengers:** Each passenger finds the optimal route through the transit network:
1. Walk to nearest station (up to 500m / ~15 tiles for bus, 800m / ~25 tiles for metro)
2. Find path through transit network using Dijkstra's algorithm. Edge weights = travel time (distance / speed + wait time based on headway). Penalty for transfers (+5 min).
3. Walk from final station to destination (same radius as origin walk)
4. If no transit path exists, passenger drives (counts as car mode share, adds to congestion)

**Waiting and boarding:**
- Passengers wait at station platforms
- When a vehicle arrives on their route, passengers board up to vehicle capacity
- If station is overcrowded (>150% capacity), passengers start leaving (lost ridership, approval penalty)
- Wait time tracked; passengers leave if wait > 30 minutes

**Performance:** Max 20,000 active passengers. Use object pooling. Batch-process passenger updates every simulation tick (1 second), not every frame.

### 3F. Economy & Budget (`src/economy/`)

**Revenue:**
- `fareRevenue = route.dailyRidership × route.fare`
- `subsidy = baseSubsidy × subsidyMultiplier`
  - Base subsidy decreases by 2% per year (city expects network to become self-sufficient)
  - Multiplier affected by approval rating (0.5× at 0%, 1× at 50%, 1.5× at 100%)
- `advertisingRevenue = totalRidership × adRatePerRider ($0.02)`

**Costs (daily):**
- `operationsCost = sum(vehicles × mode.maintenancePerVehiclePerDay) + driverCost`
  - Driver cost: 1 driver per vehicle, $200/day
- `maintenanceCost = sum(tracks × track.maintenancePerTilePerDay)` — increases by 5% per year as infrastructure ages
- `constructionCost` — deducted upfront, amortized over construction period
- `interestCost = loanBalance × loanRate / 365`

**Loans:**
- Player can take loans up to 3× annual revenue
- Interest rate: 5-15% depending on credit rating (based on revenue/cost ratio)
- Minimum payment: 2% of balance per month

**Game over conditions:** Cash < -$500,000 for 7 consecutive days → bankruptcy.

### 3G. City Growth (`src/city/growth.ts`)

The city responds dynamically to transit coverage:

**Transit accessibility score per tile:**
```
accessScore = 0
For each station within walking distance (max 25 tiles):
  score += station.level / distance_to_station
```

**Growth effects (applied every 7 game days):**
1. Tiles with accessScore > threshold (0.5) and residential zone: density increases (low → med → high) over 30-90 days
2. Tiles near new stations: land value increases by 5-20%
3. Tiles far from any station (>40 tiles): population slowly declines (-2%/month)
4. CBD employment grows with total transit ridership (agglomeration effect)
5. New neighborhoods spawn at the city edge if population growth > 3%/year and transit extends there

**Approval rating** (0-100, updated daily):
- +0.1 per % of population with transit access
- +5 when a new station opens
- -10 when a station overcrowds (>200% capacity)
- -5 per fare increase above inflation
- -3 per day with construction disruption near residential
- -1 per % of passengers who wait > 15 min

---

## Phase 4: UI Panels (React Components)

All panels use Tailwind CSS, dark theme (`bg-gray-900`, `text-gray-100`). Accent = amber-400 for warnings, emerald-400 for positive, red-400 for alerts.

### 4A. HUD (`src/ui/HUD.tsx`)
Top bar, always visible:
- Cash: `$12,345,678` (green if positive, red if negative, amber if < $100K)
- Date: `Day 42 • Year 1 • March 12`
- Population: `156,234 ▲` (with daily change)
- Approval: `72%` (with trend arrow and color)
- Speed controls: `⏸ ▶ ⏩ ⏭` buttons
- Mode selector: `🚌 Bus | 🚊 Tram | 🚇 Metro | 🚆 Rail` (highlights active)

### 4B. Toolbar (`src/ui/Toolbar.tsx`)
Left sidebar, 280px wide, collapsible:
- Tool buttons with icons and keyboard shortcut labels
- Active tool highlighted with amber border
- Track cost display while in track mode
- Undo last action (Ctrl+Z) — up to 10 actions

### 4C. Station Panel (`src/ui/StationPanel.tsx`)
Opens when selecting a station. Right sidebar, 320px:
- Station name (editable)
- Modes served (icon badges)
- Daily ridership (bar chart of last 7 days)
- Capacity: `342 / 500` with progress bar
- Upgrade button: costs $, increases capacity +20%, max level 5
- Connections: list of linked stations with travel time
- Routes serving this station (clickable)
- Rename, demolish, close buttons

### 4D. Route Panel (`src/ui/RoutePanel.tsx`)
Opens when selecting a route:
- Route name (editable), color picker
- Mode badge
- Stop list (reorderable drag handles, add/remove stops)
- Headway: slider + number input (30s to 30min)
- Vehicles assigned: `8 / 20` (based on headway auto-calculated)
- Vehicle type / purchase more vehicles
- Daily ridership, daily revenue, profit per passenger
- Fare: number input ($0.50 - $10.00)
- Overall route stats: length in km, round-trip time, average speed

### 4E. Budget Panel (`src/ui/BudgetPanel.tsx`)
Opens from HUD cash display:
- Revenue breakdown: stacked bar (fares, subsidy, advertising)
- Cost breakdown: stacked bar (operations, maintenance, construction, interest)
- Net daily profit/loss
- Loan balance + take loan / repay loan buttons
- Projected cash (30-day forecast)
- Fare policy: switch between flat / distance-based / zone-based

### 4F. City Stats (`src/ui/CityStats.tsx`)
Opens from HUD population display:
- Population growth chart (last 30 days)
- Modal share pie chart (car vs transit vs walking)
- Transit coverage map overlay toggle
- Station count by mode
- Average trip time, average wait time
- Congestion index

### 4G. Alerts / Event Log
Bottom-right toast notifications:
- "Station overcrowding at Central Station!"
- "New neighborhood forming in Northgate"
- "City council approves subsidy increase"
- "NIMBY protest blocks rail extension in Richville"
- "Loan payment due: $45,000"

### 4H. Pause Menu
- Save game (localStorage serialization)
- Load game (list saves with date/population/cash preview)
- New game (with city seed + difficulty selection)
- Settings (sound, autosave interval, graphics quality)

---

## Phase 5: NIMBY & Events System

Random events add variety and challenge:

### NIMBY System
- Wealthy neighborhoods (land value > $800/m², zone = residential_low) have a `nimbyResistance` score (0-100)
- When player builds new transit through or near (within 10 tiles) a NIMBY area, resistance increases
- At 100 resistance: construction is blocked. Player must either:
  - Tunnel underneath (metro, 3× cost)
  - Buy out opposition ($50K per resistance point to zero it)
  - Wait (resistance decays 5/month)
  - Reroute

### Event Pool
Every 30-90 days, one random event fires:

**Positive:**
- "Transit-oriented development boom: +10% land value near stations for 30 days"
- "Federal infrastructure grant: +$5M one-time"
- "Environmental award: +15% approval for 60 days"
- "Olympic bid: city requests rapid transit expansion. Double subsidy for 180 days, penalty if ridership < target"

**Negative:**
- "Recession: -20% ridership for 90 days"
- "Infrastructure failure: random station/track needs emergency repair ($500K)"
- "Strike: no service on one route for 5-10 days"
- "Gas price drop: -15% transit ridership for 60 days (more people drive)"
- "Pandemic: -40% ridership for 180 days, +20% operating cost (cleaning)"

**Neutral:**
- "City council elections: approval rating affects subsidy multiplier for next 365 days"
- "Competing transit proposal: private bus company starts. Player can buy them out or compete"

---

## Phase 6: Polish & Juice

### Visual Feedback
- Trains/buses smoothly interpolate between stations along tracks (not teleport)
- Station pulse when train arriving (< 30s out)
- Passenger particles: small colored dots walking to/from stations
- Track construction particle effects (sparks for metro, dirt for road)
- Screen shake on bankruptcy warning
- Day/night cycle (cosmetic only): warm golden hour → cool night with building window lights
- Weather effects toggle: rain (reduces walking radius by 20%), snow (reduces vehicle speed by 15%)

### Sound (optional, defer if time)
- Ambient city hum
- Train arrival chime (different tones per mode — Mini Metro style)
- Construction noise
- Alert sounds for overcrowding

### Tutorial
First-time player experience:
1. "Welcome to MetroForge! Let's build a bus line."
2. Highlight tool → guide player to place 2 bus stations
3. Guide player to connect them with a track
4. Guide player to create a route and assign vehicles
5. "Watch the passengers! They'll use your network to get around."
6. Unlock more modes as the city grows

---

## Phase 7: Deployment

### Static Build
```bash
npm run build
# Output: dist/
```

### Hosting
- Domain: `transit.ahousedividedgame.com`
- Serve `dist/` as static files
- No backend needed — single-player, all state in localStorage
- If deploying to Railway: create a static site service pointing at the repo

### GitHub
- Repo: `Egg3901/metroforge` (public, MIT license)
- Branch: `main`
- Actions: auto-build on push to main

---

## Key Design Constraints

### Hard Rules
1. **Single player only.** No multiplayer, no server state, no accounts. localStorage saves.
2. **No real money.** In-game currency only. No microtransactions.
3. **No AI-generated art.** Procedural city rendering only. Icons use emoji or simple geometric shapes. If images are needed, use public domain photos from Wikimedia Commons.
4. **No hidden mechanics.** Every formula visible or discoverable. Tooltips explain calculations.
5. **Performance budget:** 60fps on a mid-range laptop (integrated graphics). Max 20,000 active passengers. Cull off-screen. Batch updates.
6. **Accessibility:** Keyboard shortcuts for all tools. Colorblind-friendly route colors (use ColorBrewer qualitative palette). Minimum text size 14px.
7. **Progressive complexity:** Bus unlocked at start. Tram at 50K population. Metro at 150K. Commuter rail at 300K. Don't overwhelm the player upfront.

### Design Philosophy
- **The game should feel like painting a network onto a living city, not filling out spreadsheets.** UI panels are for inspection, not for primary gameplay. The canvas is where play happens.
- **Every transit mode has a distinct role:** Bus = local feeder, Tram = corridor backbone, Metro = high-capacity trunk, Rail = regional connector. Avoid making any mode strictly better than another.
- **The city pushes back.** NIMBY, terrain, budget constraints, and growth pressure create friction. A game without friction is a toy.
- **"One more station."** The core loop: scan the city → spot a gap → place a station → watch ridership spike → see neighborhood densify → repeat. Make this loop tight (5-10 minutes per cycle).

---

## What NOT To Do

- Do NOT build a backend. Static site only.
- Do NOT add multiplayer, accounts, or cloud saves.
- Do NOT over-engineer the procedural generation. A plausible city is better than a perfect simulation.
- Do NOT add 3D rendering. 2D top-down or isometric only.
- Do NOT use AI image generation for any visual asset.
- Do NOT add ads, paywalls, or monetization.
- Do NOT add scenarios or preset maps — procedural generation is the core offering.
- Do NOT add real-time multiplayer synchronization.

---

## Deliverables Checklist

After each phase, the game must be runnable (`npm run dev`) and that phase's features testable.

- [ ] **Phase 0 complete** — research report written covering transit fundamentals, city generation techniques, game balance, and competitor analysis
- [ ] **Phase 1 complete** — project scaffolded, dependencies installed, `npm run dev` works, Canvas renders
- [ ] **Phase 2 complete** — all TypeScript types defined, no `any` types, strict mode passes
- [ ] **Phase 3A complete** — procedural city generation: terrain, roads, zoning, population, land value. City renders in Canvas.
- [ ] **Phase 3B complete** — camera pan/zoom working, all layers rendering, 60fps maintained
- [ ] **Phase 3C complete** — all construction tools working: station placement, track drawing, bulldoze, route creation
- [ ] **Phase 3D complete** — routes configurable, vehicles animate along tracks, dwell at stations
- [ ] **Phase 3E complete** — passengers spawn, pathfind, board, ride, arrive. 20K passenger stress test at 30fps+.
- [ ] **Phase 3F complete** — budget updates daily, fare revenue calculated, loans functional, game over trigger
- [ ] **Phase 3G complete** — city grows over time, land values change, approval rating updates
- [ ] **Phase 4A-4H complete** — all UI panels render, HUD updates live, save/load works
- [ ] **Phase 5 complete** — NIMBY resistance + event system fires periodically
- [ ] **Phase 6 complete** — animations smooth, particle effects, tutorial playable end-to-end
- [ ] **Phase 7 complete** — `npm run build` succeeds, `dist/` served correctly, deployed to transit.ahousedividedgame.com
- [ ] **Final check** — playtest 30 minutes: place 15+ stations, 3+ routes, 2+ modes, reach day 90. Identify 3 things that feel bad and fix them.

---

## Verification

After all phases complete, verify:

```bash
npm run build          # must succeed with 0 errors
npx tsc --noEmit       # strict mode, 0 errors
npm run dev            # game loads, city generates, tools work
```

Playtest checklist:
- [ ] Generate 5 cities with different seeds — all look different but plausible
- [ ] Place a bus line, watch passengers use it
- [ ] Place a metro line, compare ridership to bus
- [ ] Run at 4× speed for 50 days — city grows, budget stable
- [ ] Take a loan, build infrastructure, repay loan
- [ ] Trigger NIMBY event, resolve it
- [ ] Save game, refresh page, load game — state preserved
- [ ] Hit bankruptcy condition — game over screen appears
- [ ] Play tutorial from start to finish — no confusion points

---

## Edge Cases & Failure Modes

### Player does nothing
- City still grows slowly (background growth)
- Budget: small subsidy keeps cash stable (covers operating costs of nothing)
- After 30 days of no transit: "City council threatens to revoke your transit authority" alert
- After 90 days: game over (fired)

### All stations on one side of the map
- Ridership limited by walking radius
- Approval rating drops as coverage stays low
- City growth concentrates on the served side, creating imbalance

### Spiral: low ridership → cut service → lower ridership
- Subsidy floor prevents complete collapse
- "Crisis mode" alert suggests restructuring (merge routes, switch to cheaper mode)

### Player places 100 bus stops everywhere
- Operating costs scale with vehicle count
- Overlapping routes cannibalize ridership from each other
- Approval high but budget bleeds → natural limiting factor

### Very hilly terrain
- Construction costs spike (grade penalties)
- Some tiles impossible to build on (>25% grade)
- Metro becomes more attractive (underground ignores terrain)

### Island city (water on all sides)
- Bridges/tunnels expensive → player must be strategic about crossing water
- Ferries implicitly covered by bus routes on bridges

---

*Generated 2026-07-07 for Fable — MetroForge v0.1. Research first, build progressively, test each phase before continuing.*
