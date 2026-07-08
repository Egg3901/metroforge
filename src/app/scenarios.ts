/**
 * Scenarios — real cities with a curated objective and a win condition. This is
 * what turns the sandbox into a game with a start and a finish. Each scenario
 * fixes the city/size/difficulty and defines one primary goal; the standard
 * progression goals still track underneath.
 */
import type { UiState } from '@host/protocol';

export interface Scenario {
  id: string;
  presetKey: string;
  size: 'small' | 'medium' | 'large';
  difficulty: 'easy' | 'normal' | 'hard';
  title: string;
  city: string;
  blurb: string;
  /** the win objective */
  goal: string;
  progress: (ui: UiState) => number; // 0..1; ≥1 = won
  readout: (ui: UiState) => string;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const pct = (v: number): string => `${Math.round(v * 100)}%`;
const num = (v: number): string => Math.round(v).toLocaleString();

export const SCENARIOS: Scenario[] = [
  {
    id: 'nyc-grid', presetKey: 'nyc', size: 'medium', difficulty: 'normal',
    title: 'The Grid', city: 'New York',
    blurb: 'Eight million people, two rivers, one island. Move them.',
    goal: 'Reach 35% transit mode share',
    progress: (ui) => clamp01(ui.transitShare / 0.35),
    readout: (ui) => `${pct(ui.transitShare)} / 35%`,
  },
  {
    id: 'boston-hub', presetKey: 'boston', size: 'medium', difficulty: 'normal',
    title: 'The Hub', city: 'Boston',
    blurb: 'Tangled streets, a cut-in harbor. Get everyone within reach.',
    goal: 'Cover 65% of residents',
    progress: (ui) => clamp01(ui.coverage / 0.65),
    readout: (ui) => `${pct(ui.coverage)} / 65%`,
  },
  {
    id: 'chicago-l', presetKey: 'chicago', size: 'medium', difficulty: 'normal',
    title: 'The L', city: 'Chicago',
    blurb: 'The grid and the lake. Build ridership to match.',
    goal: 'Carry 120,000 daily riders',
    progress: (ui) => clamp01(ui.dailyTransitTrips / 120000),
    readout: (ui) => `${num(ui.dailyTransitTrips)} / 120,000`,
  },
  {
    id: 'la-cars', presetKey: 'la', size: 'medium', difficulty: 'hard',
    title: 'Break the Car', city: 'Los Angeles',
    blurb: 'The hardest sell in America. Win commuters off the freeway.',
    goal: 'Reach 20% transit mode share',
    progress: (ui) => clamp01(ui.transitShare / 0.2),
    readout: (ui) => `${pct(ui.transitShare)} / 20%`,
  },
  {
    id: 'cleveland-comeback', presetKey: 'cleveland', size: 'medium', difficulty: 'normal',
    title: 'Comeback', city: 'Cleveland',
    blurb: 'A lakefront city on the rebound. Make the network pay for itself.',
    goal: 'Fares cover operating costs',
    progress: (ui) => { const c = ui.lastDay.operations + ui.lastDay.maintenance; return c > 0 ? clamp01(ui.lastDay.fares / c) : 0; },
    readout: (ui) => { const c = ui.lastDay.operations + ui.lastDay.maintenance; return `${c > 0 ? pct(ui.lastDay.fares / c) : '0%'} / 100%`; },
  },
  {
    id: 'atlanta-sprawl', presetKey: 'atlanta', size: 'medium', difficulty: 'hard',
    title: 'The Sprawl', city: 'Atlanta',
    blurb: 'Landlocked and spread thin. Stitch it together.',
    goal: 'Cover 45% of residents',
    progress: (ui) => clamp01(ui.coverage / 0.45),
    readout: (ui) => `${pct(ui.coverage)} / 45%`,
  },
];
