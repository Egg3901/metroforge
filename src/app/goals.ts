/**
 * Progression goals — the sandbox's spine. Each goal reads live UI stats and
 * reports 0..1 progress; the store tracks completion and celebrates it. Ordered
 * as a rough arc from first riders to a mature, beloved, self-sustaining network.
 */
import type { UiState } from '@host/protocol';

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export interface Goal {
  id: string;
  label: string;
  hint: string;
  /** current value + target, for the progress bar readout */
  readout: (ui: UiState) => { value: string; target: string };
  progress: (ui: UiState) => number;
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const num = (v: number): string => Math.round(v).toLocaleString();

export const GOALS: Goal[] = [
  {
    id: 'first-riders',
    label: 'First Riders',
    hint: 'Carry 1,000 daily transit trips',
    readout: (ui) => ({ value: num(ui.dailyTransitTrips), target: '1,000' }),
    progress: (ui) => clamp01(ui.dailyTransitTrips / 1000),
  },
  {
    id: 'traction',
    label: 'Getting Traction',
    hint: 'Reach 10% transit mode share',
    readout: (ui) => ({ value: pct(ui.transitShare), target: '10%' }),
    progress: (ui) => clamp01(ui.transitShare / 0.1),
  },
  {
    id: 'half-covered',
    label: 'Within Reach',
    hint: 'Get 50% of residents near a stop',
    readout: (ui) => ({ value: pct(ui.coverage), target: '50%' }),
    progress: (ui) => clamp01(ui.coverage / 0.5),
  },
  {
    id: 'farebox',
    label: 'Farebox Recovery',
    hint: 'Fares cover day-to-day operating costs',
    readout: (ui) => {
      const costs = ui.lastDay.operations + ui.lastDay.maintenance;
      return { value: costs > 0 ? pct(ui.lastDay.fares / costs) : '0%', target: '100%' };
    },
    progress: (ui) => {
      const costs = ui.lastDay.operations + ui.lastDay.maintenance;
      return costs > 0 ? clamp01(ui.lastDay.fares / costs) : 0;
    },
  },
  {
    id: 'real-network',
    label: 'A Real Network',
    hint: 'Reach 25% transit mode share',
    readout: (ui) => ({ value: pct(ui.transitShare), target: '25%' }),
    progress: (ui) => clamp01(ui.transitShare / 0.25),
  },
  {
    id: 'rush-hour',
    label: 'Rush Hour',
    hint: 'Carry 50,000 daily transit trips',
    readout: (ui) => ({ value: num(ui.dailyTransitTrips), target: '50,000' }),
    progress: (ui) => clamp01(ui.dailyTransitTrips / 50000),
  },
  {
    id: 'beloved',
    label: 'Beloved',
    hint: 'Reach 75% approval',
    readout: (ui) => ({ value: pct(ui.approval / 100), target: '75%' }),
    progress: (ui) => clamp01(ui.approval / 75),
  },
  {
    id: 'backbone',
    label: 'City Backbone',
    hint: 'Reach 40% transit mode share',
    readout: (ui) => ({ value: pct(ui.transitShare), target: '40%' }),
    progress: (ui) => clamp01(ui.transitShare / 0.4),
  },
];

/** Ids of goals whose progress has reached 1. */
export function completedGoalIds(ui: UiState): string[] {
  return GOALS.filter((g) => g.progress(ui) >= 1).map((g) => g.id);
}
