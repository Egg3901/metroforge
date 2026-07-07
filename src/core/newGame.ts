import { STARTING_CASH } from './constants';
import { generateCity } from './city/generator';
import { Rng } from './rng';
import type { Difficulty, GameState } from './types';

export function newGame(seed: number, difficulty: Difficulty): GameState {
  const city = generateCity(seed, difficulty);
  const rng = new Rng((seed ^ 0x5bd1e995) >>> 0);
  let population = 0;
  let jobs = 0;
  for (const d of city.districts) {
    population += d.population;
    jobs += d.jobs;
  }
  return {
    seed,
    tick: 0,
    rngState: rng.state(),
    difficulty,
    fields: city.fields,
    roads: city.roads,
    districts: city.districts,
    stations: [],
    tracks: [],
    routes: [],
    vehicles: [],
    flows: [],
    budget: {
      cash: STARTING_CASH[difficulty],
      loanBalance: 0,
      loanRate: 0.08,
      lastDay: { fares: 0, subsidy: 0, operations: 0, maintenance: 0, interest: 0 },
    },
    stats: {
      population,
      jobs,
      dailyTransitTrips: 0,
      dailyCarTrips: 0,
      transitShare: 0,
      coverage: 0,
      approval: 50,
    },
    nextId: 1,
    demandDirty: true,
    unlockedModes: ['bus'],
  };
}
