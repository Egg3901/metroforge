/**
 * Scenario CONTENT — the objective, its progress, and its readout, keyed by
 * scenarioId. Metadata (city, difficulty, tier, unlock cost, picker copy) lives
 * in content/scenarioRegistry.ts; this file only says what "winning" means.
 * A `Scenario` is the registry row merged with its content, which is what the
 * store and picker consume.
 */
import type { UiState } from '@host/protocol';
import { SCENARIO_REGISTRY, type ScenarioMeta } from '@content/scenarioRegistry';

export interface ScenarioContent {
  goal: string;
  progress: (ui: UiState) => number; // 0..∞; ≥1 = won
  readout: (ui: UiState) => string;
  /** leaderboard / daily-challenge score (higher is better) */
  score: (ui: UiState) => number;
}

export type Scenario = ScenarioMeta & ScenarioContent;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const pct = (v: number): string => `${Math.round(v * 100)}%`;
const num = (v: number): string => Math.round(v).toLocaleString();
const recovery = (ui: UiState): number => {
  const c = ui.lastDay.operations + ui.lastDay.maintenance;
  return c > 0 ? ui.lastDay.fares / c : 0;
};

const CONTENT: Record<string, ScenarioContent> = {
  'nyc-1904': {
    goal: 'Carry 40,000 daily subway riders before day 120',
    progress: (ui) => ui.dailyTransitTrips / 40_000,
    readout: (ui) => `${num(ui.dailyTransitTrips)} / 40,000`,
    score: (ui) => Math.round(ui.dailyTransitTrips),
  },
  'boston-1897': {
    goal: 'Cover 55% of residents before day 100',
    progress: (ui) => ui.coverage / 0.55,
    readout: (ui) => `${pct(ui.coverage)} / 55%`,
    score: (ui) => Math.round(ui.coverage * 10_000),
  },
  'chicago-1892': {
    goal: 'Reach 20% transit mode share before day 90',
    progress: (ui) => ui.transitShare / 0.2,
    readout: (ui) => `${pct(ui.transitShare)} / 20%`,
    score: (ui) => Math.round(ui.transitShare * 10_000),
  },
  'cleveland-1955': {
    goal: 'Fares cover operating costs before day 150',
    progress: (ui) => recovery(ui),
    readout: (ui) => `${pct(recovery(ui))} / 100%`,
    score: (ui) => Math.round(recovery(ui) * 10_000),
  },
  'atlanta-1979': {
    goal: 'Cover 40% of residents before day 140',
    progress: (ui) => ui.coverage / 0.4,
    readout: (ui) => `${pct(ui.coverage)} / 40%`,
    score: (ui) => Math.round(ui.coverage * 10_000),
  },
  'la-1963': {
    goal: 'Reach 12% transit mode share before day 180',
    progress: (ui) => ui.transitShare / 0.12,
    readout: (ui) => `${pct(ui.transitShare)} / 12%`,
    score: (ui) => Math.round(ui.transitShare * 10_000),
  },
};

export const SCENARIOS: Scenario[] = SCENARIO_REGISTRY.map((m) => {
  const c = CONTENT[m.scenarioId];
  if (!c) throw new Error(`Missing scenario content for ${m.scenarioId}`);
  return { ...m, ...c };
});

export const scenarioById = (id: string): Scenario | undefined => SCENARIOS.find((s) => s.scenarioId === id);

export const scenarioBar = (s: Scenario, ui: UiState): number => clamp01(s.progress(ui));
