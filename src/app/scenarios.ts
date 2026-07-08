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
  'nyc-grid': {
    goal: 'Reach 35% transit mode share',
    progress: (ui) => ui.transitShare / 0.35,
    readout: (ui) => `${pct(ui.transitShare)} / 35%`,
  },
  'boston-hub': {
    goal: 'Cover 65% of residents',
    progress: (ui) => ui.coverage / 0.65,
    readout: (ui) => `${pct(ui.coverage)} / 65%`,
  },
  'chicago-l': {
    goal: 'Carry 120,000 daily riders',
    progress: (ui) => ui.dailyTransitTrips / 120000,
    readout: (ui) => `${num(ui.dailyTransitTrips)} / 120,000`,
  },
  'cleveland-comeback': {
    goal: 'Fares cover operating costs',
    progress: (ui) => recovery(ui),
    readout: (ui) => `${pct(recovery(ui))} / 100%`,
  },
  'atlanta-sprawl': {
    goal: 'Cover 45% of residents',
    progress: (ui) => ui.coverage / 0.45,
    readout: (ui) => `${pct(ui.coverage)} / 45%`,
  },
  'la-cars': {
    goal: 'Reach 20% transit mode share',
    progress: (ui) => ui.transitShare / 0.2,
    readout: (ui) => `${pct(ui.transitShare)} / 20%`,
  },
};

export const SCENARIOS: Scenario[] = SCENARIO_REGISTRY.map((m) => {
  const c = CONTENT[m.scenarioId];
  if (!c) throw new Error(`scenario ${m.scenarioId} has no content`);
  return { ...m, ...c };
});

export const scenarioById = (id: string): Scenario | undefined => SCENARIOS.find((s) => s.scenarioId === id);

// progress is unbounded (for star tiers); expose a clamped variant for bars
export const scenarioBar = (s: Scenario, ui: UiState): number => clamp01(s.progress(ui));
