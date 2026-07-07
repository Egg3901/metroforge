/**
 * Fixed-timestep simulation. 1 tick = 1 game-second. Everything here is
 * deterministic given (seed, command stream).
 */
import {
  ASSIGNMENT_INTERVAL_TICKS,
  BANKRUPTCY_FLOOR,
  BANKRUPTCY_GRACE_DAYS,
  BASE_DAILY_SUBSIDY,
  GROWTH_INTERVAL_DAYS,
  MODES,
  TICKS_PER_DAY,
} from './constants';
import { cellCenter } from './fields';
import { dist } from './geometry';
import { Rng } from './rng';
import { runAssignment } from './transit/assignment';
import { getRoutePath } from './transit/routePath';
import type { GameState, Station } from './types';

export interface TickEvents {
  dayCompleted?: number;
  bankrupt?: boolean;
  modeUnlocked?: string;
  messages: string[];
}

let bankruptDays = 0; // transient across ticks in a session; persisted via save hook below

export function getBankruptDays(): number {
  return bankruptDays;
}
export function setBankruptDays(d: number): void {
  bankruptDays = d;
}

export function simTick(state: GameState): TickEvents {
  const events: TickEvents = { messages: [] };
  state.tick += 1;

  moveVehicles(state);

  // demand assignment: on dirty flag or periodic refresh
  if (state.demandDirty || state.tick % ASSIGNMENT_INTERVAL_TICKS === 0) {
    refreshAssignment(state);
    state.demandDirty = false;
  }

  if (state.tick % TICKS_PER_DAY === 0) {
    const day = state.tick / TICKS_PER_DAY;
    events.dayCompleted = day;
    runDailyEconomy(state, day, events);
    updateApproval(state);
    checkUnlocks(state, events);
    if (day % GROWTH_INTERVAL_DAYS === 0) runGrowth(state);
    if (state.budget.cash < BANKRUPTCY_FLOOR) {
      bankruptDays += 1;
      if (bankruptDays >= BANKRUPTCY_GRACE_DAYS) events.bankrupt = true;
      else events.messages.push(`Deep in the red: ${BANKRUPTCY_GRACE_DAYS - bankruptDays} days until the city takes over`);
    } else {
      bankruptDays = 0;
    }
  }

  return events;
}

function moveVehicles(state: GameState): void {
  for (const v of state.vehicles) {
    const route = state.routes.find((r) => r.id === v.routeId);
    if (!route) continue;
    const path = getRoutePath(state, route);
    if (!path) continue;
    v.pathLength = path.length;
    if (v.dwellRemaining > 0) {
      v.dwellRemaining -= 1;
      continue;
    }
    const cfg = MODES[route.mode];
    const prev = v.along;
    v.along = (v.along + cfg.speed) % path.length;
    // dwell when passing a station stop position
    for (const sid of route.stationIds) {
      const s = state.stations.find((st) => st.id === sid);
      if (!s) continue;
      const stopDist = nearestAlong(path, s);
      for (const d of stopDist) {
        const crossed = prev < v.along ? d > prev && d <= v.along : d > prev || d <= v.along;
        if (crossed) {
          v.dwellRemaining = cfg.dwellSeconds;
          break;
        }
      }
      if (v.dwellRemaining > 0) break;
    }
    // occupancy from flows: route trips per day spread over vehicle-trips per day
    if (route.vehicleCount > 0 && route.dailyRidership > 0) {
      const roundTripsPerDay = (TICKS_PER_DAY * cfg.speed) / Math.max(1, v.pathLength);
      const tripsPerVehicleDay = route.dailyRidership / route.vehicleCount / Math.max(0.5, roundTripsPerDay);
      v.occupancy = Math.min(1.5, tripsPerVehicleDay / cfg.vehicleCapacity);
    } else {
      v.occupancy = 0;
    }
  }
}

/** Distances along an out-and-back path where the path passes near a station. */
const stopDistCache = new Map<string, number[]>();
function nearestAlong(path: { points: { x: number; y: number }[]; cumulative: number[]; length: number }, s: Station): number[] {
  const key = `${s.id}:${path.length.toFixed(1)}`;
  const hit = stopDistCache.get(key);
  if (hit) return hit;
  const out: number[] = [];
  for (let i = 0; i < path.points.length; i++) {
    const p = path.points[i]!;
    if (dist(p, s.pos) < 30) out.push(path.cumulative[i] as number);
  }
  stopDistCache.set(key, out);
  return out;
}

export function refreshAssignment(state: GameState): void {
  const result = runAssignment(state);
  state.flows = result.flows;
  state.stats.dailyTransitTrips = result.dailyTransitTrips;
  state.stats.dailyCarTrips = result.dailyCarTrips;
  const total = result.dailyTransitTrips + result.dailyCarTrips;
  state.stats.transitShare = total > 0 ? result.dailyTransitTrips / total : 0;
  for (const r of state.routes) {
    r.dailyRidership = result.routeRidership.get(r.id) ?? 0;
    r.dailyRevenue = result.routeRevenue.get(r.id) ?? 0;
  }
  for (const s of state.stations) {
    // rolling blend so numbers move smoothly
    const target = result.stationBoardings.get(s.id) ?? 0;
    s.ridership = s.ridership * 0.5 + target * 0.5;
  }
  // coverage: fraction of population within walk radius of any station
  let covered = 0;
  let totalPop = 0;
  const g = state.fields;
  for (let i = 0; i < g.population.length; i++) {
    const pop = g.population[i] as number;
    if (pop <= 0) continue;
    totalPop += pop;
    const c = cellCenter(g, i);
    for (const s of state.stations) {
      if (dist(c, s.pos) <= MODES[s.mode].walkRadius) {
        covered += pop;
        break;
      }
    }
  }
  state.stats.coverage = totalPop > 0 ? covered / totalPop : 0;
}

function runDailyEconomy(state: GameState, _day: number, events: TickEvents): void {
  const b = state.budget;
  let fares = 0;
  let operations = 0;
  let maintenance = 0;
  for (const r of state.routes) {
    fares += r.dailyRevenue;
    const cfg = MODES[r.mode];
    operations += r.vehicleCount * (cfg.opsPerVehiclePerDay + cfg.maintPerVehiclePerDay);
  }
  for (const t of state.tracks) {
    maintenance += (t.polyline.length / 1000) * MODES[t.mode].maintPerKmPerDay;
  }
  for (const s of state.stations) {
    maintenance += MODES[s.mode].stationCost * 0.0002 * s.level;
  }
  // subsidy: base scaled by approval (0.5×..1.5×), declining 2%/year
  const year = Math.floor(state.tick / TICKS_PER_DAY / 365);
  const base = BASE_DAILY_SUBSIDY[state.difficulty] * Math.pow(0.98, year);
  const subsidy = base * (0.5 + state.stats.approval / 100);
  const interest = (b.loanBalance * b.loanRate) / 365;

  b.cash += fares + subsidy - operations - maintenance - interest;
  b.lastDay = { fares, subsidy, operations, maintenance, interest };

  if (fares > 0 && fares > operations + maintenance) {
    events.messages.push('Farebox recovery above 100% — the network pays for itself');
  }
}

function updateApproval(state: GameState): void {
  const s = state.stats;
  // drift toward a target driven by coverage + transit share
  const target = Math.min(100, 25 + s.coverage * 90 + s.transitShare * 60);
  s.approval += (target - s.approval) * 0.08;
  s.approval = Math.max(0, Math.min(100, s.approval));
}

function checkUnlocks(state: GameState, events: TickEvents): void {
  for (const mode of ['tram', 'metro', 'rail'] as const) {
    if (!state.unlockedModes.includes(mode) && state.stats.population >= MODES[mode].unlockPopulation) {
      state.unlockedModes.push(mode);
      events.modeUnlocked = MODES[mode].label;
      events.messages.push(`${MODES[mode].label} unlocked — the city has grown to ${Math.round(state.stats.population / 1000)}k residents`);
    }
  }
}

/** Weekly growth pass: transit access densifies nearby cells; neglect decays. */
function runGrowth(state: GameState): void {
  const g = state.fields;
  const rng = new Rng(state.rngState);
  let totalPop = 0;
  for (let i = 0; i < g.population.length; i++) {
    const pop = g.population[i] as number;
    if ((g.water[i] as number) === 1) continue;
    const c = cellCenter(g, i);
    let access = 0;
    for (const s of state.stations) {
      const d = dist(c, s.pos);
      const walkR = MODES[s.mode].walkRadius;
      if (d < walkR * 1.5) access += (s.level * Math.min(1, walkR / Math.max(d, 50))) * (1 + s.ridership / 5000);
    }
    if (access > 0.5 && pop > 5) {
      const growth = Math.min(0.03, 0.004 * access) * (0.8 + rng.next() * 0.4);
      g.population[i] = pop * (1 + growth);
      g.landValue[i] = Math.min(3, (g.landValue[i] as number) * (1 + growth * 0.5));
      g.jobs[i] = (g.jobs[i] as number) * (1 + growth * 0.6);
    } else if (access === 0 && pop > 5) {
      g.population[i] = pop * 0.9995;
    }
    totalPop += g.population[i] as number;
  }
  state.rngState = rng.state();

  // refresh district aggregates
  for (const d of state.districts) {
    let pop = 0;
    let jobs = 0;
    for (const i of d.cellIndices) {
      pop += g.population[i] as number;
      jobs += g.jobs[i] as number;
    }
    d.population = pop;
    d.jobs = jobs;
  }
  state.stats.population = totalPop;
  state.stats.jobs = state.districts.reduce((a, d) => a + d.jobs, 0);
  state.demandDirty = true;
}
