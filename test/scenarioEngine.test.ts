/**
 * Scenario engine — condition trees, mid-run events, and full playthroughs
 * for each Cleveland/NYC playable scenario (win + lose paths).
 */
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/core/commands';
import { TICKS_PER_DAY } from '../src/core/constants';
import { newGame } from '../src/core/newGame';
import {
  PLAYABLE_SCENARIOS,
  buildScenarioState,
  evalCondition,
  playableScenario,
  readMetrics,
  rulesFromScenario,
  treeProgress,
  type ScenarioDef,
} from '../src/core/scenario';
import { setBankruptDays, simTick } from '../src/core/sim';
import { stateHash } from '../src/core/save';
import { uiExtras } from '../src/host/uiExtras';
import type { Command, GameState, TransitMode } from '../src/core/types';
import type { OsmCityData } from '../src/core/city/osmCity';
import cleveland from '../src/data/cities/cleveland.json';
import nyc from '../src/data/cities/nyc.json';

const CITY: Record<'cleveland' | 'nyc', OsmCityData> = {
  cleveland: cleveland as OsmCityData,
  nyc: nyc as OsmCityData,
};

function startScenario(def: ScenarioDef, seed = 42): GameState {
  setBankruptDays(0);
  return newGame(seed, def.difficulty, {
    presetKey: def.cityKey,
    osm: CITY[def.cityKey],
    scenario: def,
  });
}

/** Build a bus/tram spine across the N densest districts. */
function buildSpine(state: GameState, nStations: number, mode: TransitMode = 'bus', vehicles = 6, minSpacing = 600): void {
  const byDemand = [...state.districts].sort((a, b) => b.population + b.jobs - (a.population + a.jobs));
  const picks: { x: number; y: number }[] = [];
  for (const d of byDemand) {
    if (picks.every((p) => Math.hypot(p.x - d.centroid.x, p.y - d.centroid.y) > minSpacing)) {
      picks.push(d.centroid);
    }
    if (picks.length === nStations) break;
  }
  expect(picks.length).toBe(nStations);
  const ids: number[] = [];
  for (const pos of picks) {
    const r = applyCommand(state, { kind: 'buildStation', mode, pos });
    expect(r.ok).toBe(true);
    ids.push(r.createdId!);
  }
  for (let i = 0; i < ids.length - 1; i++) {
    const t = applyCommand(state, {
      kind: 'buildTrack',
      mode,
      grade: 'surface',
      fromStationId: ids[i]!,
      toStationId: ids[i + 1]!,
      waypoints: [],
    });
    expect(t.ok).toBe(true);
  }
  const route = applyCommand(state, { kind: 'createRoute', mode, stationIds: ids });
  expect(route.ok).toBe(true);
  applyCommand(state, {
    kind: 'editRoute',
    routeId: route.createdId!,
    vehicleCount: vehicles,
    headwaySeconds: 240,
  });
}

function advanceDays(state: GameState, days: number): void {
  for (let t = 0; t < TICKS_PER_DAY * days; t++) {
    simTick(state);
    if (state.scenarioWon || state.failed) return;
  }
}

describe('scenario catalog', () => {
  it('ships exactly five Cleveland/NYC scenarios of escalating tier', () => {
    expect(PLAYABLE_SCENARIOS).toHaveLength(5);
    expect(PLAYABLE_SCENARIOS.map((s) => s.tier)).toEqual([1, 2, 3, 4, 5]);
    for (const s of PLAYABLE_SCENARIOS) {
      expect(['cleveland', 'nyc']).toContain(s.cityKey);
      expect(s.deadlineDays).toBeGreaterThan(0);
      expect(s.startingModes.length).toBeGreaterThan(0);
      expect(playableScenario(s.id)?.id).toBe(s.id);
    }
  });

  it('maps onto ScenarioRules for newGame', () => {
    const def = PLAYABLE_SCENARIOS[1]!;
    const rules = rulesFromScenario(def);
    expect(rules.scenarioId).toBe(def.id);
    expect(rules.startingCash).toBe(def.startingBudget);
    expect(rules.maxDay).toBe(def.deadlineDays);
    expect(rules.startingModes).toEqual(def.startingModes);
  });
});

describe('condition tree evaluator', () => {
  it('evaluates AND / OR / NOT / compares without RNG', () => {
    const m = {
      dailyTransitTrips: 500,
      fareboxRecovery: 0.7,
      coverage: 0.1,
      transitShare: 0.05,
      approval: 55,
      cash: 1_000_000,
      population: 200_000,
      day: 12,
    };
    expect(evalCondition({ metric: 'dailyTransitTrips', op: '>=', value: 500 }, m)).toBe(true);
    expect(evalCondition({ metric: 'fareboxRecovery', op: '>', value: 0.6 }, m)).toBe(true);
    expect(
      evalCondition(
        {
          and: [
            { metric: 'dailyTransitTrips', op: '>=', value: 500 },
            { metric: 'fareboxRecovery', op: '>', value: 0.6 },
          ],
        },
        m,
      ),
    ).toBe(true);
    expect(
      evalCondition(
        {
          or: [
            { metric: 'dailyTransitTrips', op: '>=', value: 9_999 },
            { metric: 'coverage', op: '>=', value: 0.1 },
          ],
        },
        m,
      ),
    ).toBe(true);
    expect(evalCondition({ not: { metric: 'cash', op: '<', value: 0 } }, m)).toBe(true);
    expect(treeProgress({ metric: 'dailyTransitTrips', op: '>=', value: 1000 }, m)).toBeCloseTo(0.5, 5);
  });

  it('buildScenarioState is additive UI shape', () => {
    const def = PLAYABLE_SCENARIOS[0]!;
    const state = startScenario(def);
    const snap = buildScenarioState(def, state);
    expect(snap.scenarioId).toBe(def.id);
    expect(snap.outcome).toBe('playing');
    expect(snap.won).toBe(false);
    expect(snap.lost).toBe(false);
    expect(snap.deadline).toBe(def.deadlineDays);
    expect(snap.objectives.length).toBeGreaterThan(0);
    expect(uiExtras(state).scenarioState?.scenarioId).toBe(def.id);
  });
});

describe('mid-run scenario events', () => {
  it('doubles densest-district demand on the scheduled day (deterministic)', () => {
    const def = playableScenario('cleveland-farebox-30')!;
    const a = startScenario(def, 7);
    const b = startScenario(def, 7);
    advanceDays(a, 10);
    advanceDays(b, 10);
    expect(a.firedScenarioEvents).toContain('cle-demand-surge');
    expect(b.firedScenarioEvents).toEqual(a.firedScenarioEvents);
    expect(a.districtDemandMult).toBeDefined();
    expect(Object.keys(a.districtDemandMult!).length).toBe(1);
    expect(a.districtDemandMult).toEqual(b.districtDemandMult);
    expect(stateHash(a)).toBe(stateHash(b));
  });
});

describe('playable scenario playthroughs', () => {
  const winPlan: Record<string, { stations: number; vehicles: number; maxDays: number; spacing: number }> = {
    'cleveland-first-riders': { stations: 3, vehicles: 4, maxDays: 20, spacing: 600 },
    'cleveland-farebox-30': { stations: 4, vehicles: 5, maxDays: 25, spacing: 600 },
    'cleveland-reach': { stations: 6, vehicles: 6, maxDays: 35, spacing: 550 },
    'nyc-bus-spine': { stations: 10, vehicles: 10, maxDays: 40, spacing: 400 },
    'nyc-pressure': { stations: 10, vehicles: 10, maxDays: 45, spacing: 400 },
  };

  for (const def of PLAYABLE_SCENARIOS) {
    describe(def.id, () => {
      it('win path: scripted network meets the objective before the deadline', () => {
        const plan = winPlan[def.id]!;
        const state = startScenario(def, 42);
        expect(state.scenario?.id).toBe(def.id);
        expect(state.budget.cash).toBe(def.startingBudget);
        expect(state.unlockedModes).toEqual(def.startingModes);
        buildSpine(state, plan.stations, def.startingModes[0]!, plan.vehicles, plan.spacing);
        advanceDays(state, plan.maxDays);
        expect(state.scenarioWon).toBe(true);
        expect(state.failed).toBeNull();
        const ui = uiExtras(state).scenarioState!;
        expect(ui.won).toBe(true);
        expect(ui.outcome).toBe('won');
        expect(ui.progress).toBe(1);
        expect(ui.day).toBeLessThanOrEqual(def.deadlineDays + 1);
      }, 30_000);

      it('lose path: missing the deadline (or cash condition) ends the run', () => {
        const state = startScenario(def, 99);
        if (def.id === 'nyc-pressure') {
          // explicit lose tree: cash < -200k
          state.budget.cash = -250_000;
          advanceDays(state, 1);
          expect(state.failed).toBe('condition');
          expect(state.scenarioWon).toBeFalsy();
          const ui = uiExtras(state).scenarioState!;
          expect(ui.lost).toBe(true);
          expect(ui.outcome).toBe('lost');
          expect(ui.loseReason).toBe('condition');
          return;
        }
        // idle — no network — clock runs out
        advanceDays(state, def.deadlineDays + 2);
        expect(state.failed).toBe('time');
        expect(state.scenarioWon).toBeFalsy();
        const ui = uiExtras(state).scenarioState!;
        expect(ui.lost).toBe(true);
        expect(ui.outcome).toBe('lost');
        expect(ui.loseReason).toBe('time');
      }, 30_000);

      it('determinism: identical seed + commands ⇒ identical outcome hash', () => {
        const plan = winPlan[def.id]!;
        const run = (seed: number): GameState => {
          const state = startScenario(def, seed);
          buildSpine(state, plan.stations, def.startingModes[0]!, plan.vehicles, plan.spacing);
          advanceDays(state, Math.min(12, plan.maxDays));
          return state;
        };
        const a = run(123);
        const b = run(123);
        expect(stateHash(a)).toBe(stateHash(b));
        expect(a.scenarioWon).toBe(b.scenarioWon);
        expect(a.failed).toBe(b.failed);
        expect(readMetrics(a)).toEqual(readMetrics(b));
      }, 30_000);
    });
  }

  it('bankruptcy remains an implicit lose even without a lose tree', () => {
    const def = PLAYABLE_SCENARIOS[0]!;
    const state = startScenario(def, 3);
    setBankruptDays(0);
    // deep enough that daily subsidy cannot climb above the floor within grace
    state.budget.cash = -5_000_000;
    advanceDays(state, 10);
    expect(state.failed).toBe('bankrupt');
    expect(uiExtras(state).scenarioState?.outcome).toBe('lost');
  });
});

describe('free-play unchanged', () => {
  it('omits scenarioState when no scenario is attached', () => {
    setBankruptDays(0);
    const state = newGame(1, 'normal');
    expect(state.scenario).toBeUndefined();
    expect(uiExtras(state).scenarioState).toBeUndefined();
    const cmds: Command[] = [];
    void cmds;
  });
});
