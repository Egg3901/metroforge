/**
 * Campaign stakes: scenario rules, failure, unlocks, daily seed, replay.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/core/commands';
import { newGame } from '../src/core/newGame';
import { replaySync } from '../src/core/replay';
import { setBankruptDays, simTick } from '../src/core/sim';
import { stateHash } from '../src/core/save';
import { modeUnlockReady, type ScenarioRules } from '../src/core/scenarioRules';
import { TICKS_PER_DAY } from '../src/core/constants';
import { SCENARIO_REGISTRY } from '../src/content/scenarioRegistry';
import { dayKey, seedFromDayKey } from '../src/content/daily';
import { SCENARIOS, scenarioById } from '../src/app/scenarios';
import { dailyChallengeFor } from '../src/app/daily';

describe('historical scenarios', () => {
  it('registry and content stay in sync', () => {
    expect(SCENARIOS.length).toBe(SCENARIO_REGISTRY.length);
    for (const m of SCENARIO_REGISTRY) {
      expect(scenarioById(m.scenarioId)).toBeDefined();
      expect(m.rules.startingModes.length).toBeGreaterThan(0);
      expect(m.era).toMatch(/^\d{4}$/);
    }
  });

  it('era starts lock the toolkit', () => {
    const nyc = scenarioById('nyc-1904')!;
    expect(nyc.rules.startingModes).toEqual(['metro']);
    expect(nyc.rules.lockModes).toBe(true);
    expect(nyc.rules.maxDay).toBe(120);
  });

  it('newGame applies era cash and modes', () => {
    const rules: ScenarioRules = {
      scenarioId: 'test',
      startingModes: ['metro'],
      lockModes: true,
      startingCash: 1_234_000,
      eraLabel: '1904',
    };
    const s = newGame(42, 'normal', { rules });
    expect(s.unlockedModes).toEqual(['metro']);
    expect(s.budget.cash).toBe(1_234_000);
    expect(s.scenarioRules?.eraLabel).toBe('1904');
    expect(s.commandLog).toEqual([]);
    expect(s.failed).toBeNull();
  });
});

describe('mode unlocks', () => {
  it('tram unlocks from ridership, not only population', () => {
    expect(modeUnlockReady('tram', { population: 10_000, dailyTransitTrips: 1_000, transitShare: 0, coverage: 0 })).toBe(true);
    expect(modeUnlockReady('tram', { population: 10_000, dailyTransitTrips: 0, transitShare: 0, coverage: 0 })).toBe(false);
  });

  it('lockModes freezes unlocks', () => {
    setBankruptDays(0);
    const s = newGame(7, 'normal', {
      rules: { startingModes: ['bus'], lockModes: true },
    });
    s.stats.dailyTransitTrips = 100_000;
    s.stats.transitShare = 0.5;
    s.stats.population = 500_000;
    for (let i = 0; i < TICKS_PER_DAY; i++) simTick(s);
    expect(s.unlockedModes).toEqual(['bus']);
  });
});

describe('failure conditions', () => {
  it('time limit fails the run', () => {
    setBankruptDays(0);
    const s = newGame(9, 'normal', {
      rules: { startingModes: ['bus'], maxDay: 2 },
    });
    for (let i = 0; i < TICKS_PER_DAY * 3; i++) simTick(s);
    expect(s.failed).toBe('time');
  });

  it('approval floor fails after grace', () => {
    setBankruptDays(0);
    const s = newGame(11, 'hard', {
      rules: { startingModes: ['bus'], approvalFloor: 90 },
    });
    // force approval below floor and advance enough days
    s.stats.approval = 5;
    for (let i = 0; i < TICKS_PER_DAY * 8; i++) {
      s.stats.approval = 5;
      simTick(s);
      if (s.failed) break;
    }
    expect(s.failed).toBe('approval');
  });
});

describe('command log + replay', () => {
  it('logs successful commands with tick stamps', () => {
    setBankruptDays(0);
    const s = newGame(13, 'normal');
    const d = s.districts.sort((a, b) => b.population - a.population)[0]!;
    const r = applyCommand(s, { kind: 'buildStation', mode: 'bus', pos: { ...d.centroid } });
    expect(r.ok).toBe(true);
    expect(s.commandLog.length).toBe(1);
    expect(s.commandLog[0]!.tick).toBe(0);
  });

  it('replaySync reproduces state hash for a short script', () => {
    setBankruptDays(0);
    const seed = 4242;
    const live = newGame(seed, 'normal');
    const picks = [...live.districts].sort((a, b) => b.population + b.jobs - (a.population + a.jobs));
    const a = picks[0]!.centroid;
    const b = picks[1]!.centroid;
    const s1 = applyCommand(live, { kind: 'buildStation', mode: 'bus', pos: a });
    const s2 = applyCommand(live, { kind: 'buildStation', mode: 'bus', pos: b });
    expect(s1.ok && s2.ok).toBe(true);
    applyCommand(live, {
      kind: 'buildTrack',
      mode: 'bus',
      grade: 'surface',
      fromStationId: s1.createdId!,
      toStationId: s2.createdId!,
      waypoints: [],
    });
    applyCommand(live, { kind: 'createRoute', mode: 'bus', stationIds: [s1.createdId!, s2.createdId!] });
    for (let t = 0; t < 600; t++) simTick(live);
    const log = live.commandLog;
    const replayed = replaySync({
      seed,
      difficulty: 'normal',
      commandLog: log,
      finalTick: live.tick,
    });
    expect(replayed.hash).toBe(stateHash(live));
  });
});

describe('daily challenge', () => {
  it('day key and seed are stable', () => {
    const d = new Date(Date.UTC(2026, 6, 8));
    expect(dayKey(d)).toBe('20260708');
    expect(seedFromDayKey('20260708')).toBe(seedFromDayKey('20260708'));
    expect(seedFromDayKey('20260708')).not.toBe(seedFromDayKey('20260709'));
  });

  it('picks a historical scenario with a tightened clock', () => {
    const d = dailyChallengeFor(new Date(Date.UTC(2026, 6, 8)));
    expect(d.challengeId).toBe('daily-20260708');
    expect(d.scenario.scenarioId).toBe('daily-20260708');
    expect(d.scenario.rules.maxDay).toBeGreaterThanOrEqual(60);
    expect(d.seed).toBe(seedFromDayKey('20260708'));
    expect(d.scenario.cityKey).toBeTruthy();
  });
});

describe('campaign star merge', () => {
  it('keeps the best per scenario', async () => {
    const { mergeStars } = await import('../src/content/campaign');
    expect(mergeStars({ a: 1, b: 3 }, { a: 2, c: 1 })).toEqual({ a: 2, b: 3, c: 1 });
  });
});
