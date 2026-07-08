/**
 * Today's shared challenge: one seeded historical scenario, tightened clock.
 */
import { SCENARIO_REGISTRY } from '@content/scenarioRegistry';
import { dayKey, seedFromDayKey } from '@content/daily';
import { scenarioById, type Scenario } from './scenarios';

export interface DailyChallenge {
  challengeId: string;
  dayKey: string;
  seed: number;
  scenario: Scenario;
}

export function dailyChallengeFor(d = new Date()): DailyChallenge {
  const key = dayKey(d);
  const seed = seedFromDayKey(key);
  const idx = seed % SCENARIO_REGISTRY.length;
  const meta = SCENARIO_REGISTRY[idx]!;
  const scenario = scenarioById(meta.scenarioId);
  if (!scenario) throw new Error(`Daily challenge missing content for ${meta.scenarioId}`);
  const maxDay = Math.max(60, Math.floor((scenario.rules.maxDay ?? 120) * 0.7));
  const daily: Scenario = {
    ...scenario,
    scenarioId: `daily-${key}`,
    label: `Daily · ${scenario.city} ${scenario.era}`,
    description: `Today's challenge: ${scenario.goal}`,
    unlockStars: 0,
    tier: 0,
    rules: {
      ...scenario.rules,
      scenarioId: `daily-${key}`,
      maxDay,
    },
  };
  return { challengeId: `daily-${key}`, dayKey: key, seed, scenario: daily };
}
