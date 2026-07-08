/**
 * Guided first-city tutorial — 4 interactive steps to first ridership.
 * Highest-ROI onboarding: most players quit before they understand the loop
 * (stations → track → route → riders). Progress is driven by live UI state;
 * the card only coaches and auto-selects the right tool/overlay.
 */
import type { UiState } from '@host/protocol';
import type { OverlayMode, Tool } from './store';

const KEY = 'metroforge:tutorial';

export type TutorialStepId = 'density' | 'stations' | 'track' | 'route' | 'riders';

export interface TutorialStep {
  id: TutorialStepId;
  title: string;
  body: string;
  /** tool to put the player in when this step becomes active */
  tool: Tool;
  /** overlay to show (density glow for station placement) */
  overlay: OverlayMode;
  /** short progress readout under the body */
  progress: (ui: UiState | null) => string;
  done: (ui: UiState | null) => boolean;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'density',
    title: 'Find the glow',
    body: 'Amber density marks where people live and work. Your first line should serve the bright spots — that is where riders come from.',
    tool: 'select',
    overlay: 'density',
    progress: () => 'Look at the map, then continue',
    // advanced manually via Continue — nothing to build yet
    done: () => false,
  },
  {
    id: 'stations',
    title: 'Place two stations',
    body: 'Tap Station, then drop two bus stops on bright density. Keep them a short walk apart so a line between them makes sense.',
    tool: 'station',
    overlay: 'density',
    progress: (ui) => `${ui?.stations.length ?? 0} / 2 stations`,
    done: (ui) => (ui?.stations.length ?? 0) >= 2,
  },
  {
    id: 'track',
    title: 'Connect them',
    body: 'Tap Track, click the first station, then the second. The path follows the streets — that is your infrastructure.',
    tool: 'track',
    overlay: 'none',
    progress: (ui) => `${ui?.tracks.length ?? 0} / 1 track`,
    done: (ui) => (ui?.tracks.length ?? 0) >= 1,
  },
  {
    id: 'route',
    title: 'Run a route',
    body: 'Tap Route, click both stations in order, then re-tap the last stop (or press Enter) to launch. Vehicles start rolling immediately.',
    tool: 'route',
    overlay: 'none',
    progress: (ui) => `${ui?.routes.length ?? 0} / 1 route`,
    done: (ui) => (ui?.routes.length ?? 0) >= 1,
  },
  {
    id: 'riders',
    title: 'Watch the riders',
    body: 'Speed up time and wait for the first daily trips. Crowding and Gaps overlays will tell you where to build next.',
    tool: 'select',
    overlay: 'none',
    progress: (ui) => {
      const n = Math.round(ui?.dailyTransitTrips ?? 0);
      return `${n.toLocaleString()} / 100 daily trips`;
    },
    done: (ui) => (ui?.dailyTransitTrips ?? 0) >= 100,
  },
];

export function loadTutorialDone(): boolean {
  try {
    return localStorage.getItem(KEY) === 'done';
  } catch {
    return false;
  }
}

export function markTutorialDone(): void {
  try {
    localStorage.setItem(KEY, 'done');
  } catch {
    /* ignore */
  }
}

export function clearTutorialDone(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
