/**
 * Fixed-timestep simulation. 1 tick = 1 game-second. Everything here is
 * deterministic given (seed, command stream).
 */
import {
  ASSIGNMENT_INTERVAL_TICKS,
  BANKRUPTCY_FLOOR,
  BANKRUPTCY_GRACE_DAYS,
  BASE_DAILY_SUBSIDY,
  CROWD_APPROVAL_THRESHOLD,
  GROWTH_INTERVAL_DAYS,
  MODES,
  PEAK_HOUR_FRACTION,
  TICKS_PER_DAY,
} from './constants';
import { cellCenter } from './fields';
import { dist } from './geometry';
import { Rng } from './rng';
import { runAssignment } from './transit/assignment';
import { computeTraffic } from './transit/traffic';
import { EVENT_DEFS, eventApprovalDelta, eventFareMult, rollEvent } from './events';
import { getRoutePath } from './transit/routePath';
import type { GameState, Station } from './types';

export interface TickEvents {
  dayCompleted?: number;
  bankrupt?: boolean;
  modeUnlocked?: string;
  messages: string[];
  /** themed toasts (city events) with a tone */
  toasts?: { message: string; tone: 'good' | 'warn' | 'info' }[];
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
    updateEvents(state, day, events);
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
    // occupancy tracks the route's crowding (peak load / capacity), so a packed
    // line's vehicles read full and an over-served line's read empty
    v.occupancy = route.vehicleCount > 0 ? Math.min(1.5, route.crowding || 0) : 0;
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

/** Time-of-day travel-demand multiplier: two rush peaks, a quiet night. ~0.35→1.9 */
export function diurnalDemand(tick: number): number {
  const hour = ((tick % TICKS_PER_DAY) / TICKS_PER_DAY) * 24;
  const am = Math.exp(-((hour - 8) ** 2) / 6);
  const pm = Math.exp(-((hour - 17.5) ** 2) / 8);
  let f = 0.55 + 1.35 * (am + pm);
  if (hour < 5.5) f *= 0.35;
  else if (hour > 22) f *= 0.45;
  return f;
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
    // peak-hour capacity vs load → crowding (feeds next assignment's penalty)
    const cfg = MODES[r.mode];
    r.capacity = r.vehicleCount > 0 ? (cfg.vehicleCapacity * 3600) / r.headwaySeconds : 0;
    r.load = r.dailyRidership * PEAK_HOUR_FRACTION;
    r.crowding = r.capacity > 0 ? r.load / r.capacity : r.load > 0 ? 2 : 0;
    // per-segment load, aligned to segmentIds (segment i joins stop i and i+1)
    r.segmentLoads = r.segmentIds.map((_, i) => {
      const a = r.stationIds[i] as number;
      const b = r.stationIds[i + 1] as number;
      return result.segmentLoad.get(`${r.id}:${Math.min(a, b)}:${Math.max(a, b)}`) ?? 0;
    });
  }
  for (const s of state.stations) {
    // rolling blend so numbers move smoothly
    const target = result.stationBoardings.get(s.id) ?? 0;
    s.ridership = s.ridership * 0.5 + target * 0.5;
    const alight = result.stationAlightings.get(s.id) ?? 0;
    s.alightings = (s.alightings ?? 0) * 0.5 + alight * 0.5;
  }
  state.unserved = result.unserved;
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

  // congestion overlay: scaled by a diurnal demand curve so traffic surges at
  // the AM/PM rush and eases overnight
  state.traffic = computeTraffic(state, result.carFlows, diurnalDemand(state.tick));
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
  fares *= eventFareMult(state.activeEvents); // fare-free events waive the farebox
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
  // ridership-weighted overcrowding drag: packed lines annoy the riders who use
  // them most, so the hit scales with how many people ride an over-capacity line
  let crowdRiders = 0;
  let totalRiders = 0;
  for (const r of state.routes) {
    totalRiders += r.dailyRidership;
    if (r.crowding > CROWD_APPROVAL_THRESHOLD) crowdRiders += r.dailyRidership * (r.crowding - CROWD_APPROVAL_THRESHOLD);
  }
  const crowdDrag = totalRiders > 0 ? Math.min(20, (crowdRiders / totalRiders) * 40) : 0;
  // drift toward a target driven by coverage + transit share, plus event mood
  const target = Math.min(
    100,
    Math.max(0, 25 + s.coverage * 90 + s.transitShare * 60 + eventApprovalDelta(state.activeEvents) * 2 - crowdDrag),
  );
  s.approval += (target - s.approval) * 0.08;
  s.approval = Math.max(0, Math.min(100, s.approval));
}

/** Tick down active city events and occasionally start a new one (seeded). */
function updateEvents(state: GameState, day: number, events: TickEvents): void {
  const toasts = events.toasts ?? (events.toasts = []);
  const still: GameState['activeEvents'] = [];
  for (const a of state.activeEvents) {
    a.daysLeft -= 1;
    if (a.daysLeft > 0) still.push(a);
    else {
      const d = EVENT_DEFS.find((e) => e.id === a.id);
      if (d) toasts.push({ message: `${d.name} has ended.`, tone: 'info' });
    }
  }
  state.activeEvents = still;
  // one event at a time, spaced out by a cooldown, so each feels like an occasion
  const rng = new Rng(state.rngState);
  if (state.activeEvents.length === 0 && day >= state.nextEventDay && rng.chance(0.2)) {
    const def = rollEvent(rng.next());
    state.activeEvents.push({ id: def.id, daysLeft: def.days });
    state.demandDirty = true; // reflect the demand change on the next assignment
    toasts.push({ message: `${def.name} — ${def.desc}`, tone: def.tone });
    state.nextEventDay = day + def.days + 12 + rng.int(0, 10); // ~12–22 day gap after it ends
  }
  state.rngState = rng.state();
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
