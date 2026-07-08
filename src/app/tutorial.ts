/**
 * Guided first-city tutorial — interactive steps to first ridership.
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
  /** short call-to-action shown under the body */
  action: string;
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
    action: 'Scan the map, then continue',
    tool: 'select',
    overlay: 'density',
    progress: () => 'Density overlay on',
    done: () => false,
  },
  {
    id: 'stations',
    title: 'Place two stations',
    body: 'Station tool is ready. Drop two bus stops on bright density, a short walk apart so a line between them makes sense.',
    action: 'Tap the map twice on bright amber',
    tool: 'station',
    overlay: 'density',
    progress: (ui) => `${ui?.stations.length ?? 0} / 2 stations`,
    done: (ui) => (ui?.stations.length ?? 0) >= 2,
  },
  {
    id: 'track',
    title: 'Connect them',
    body: 'Track tool is ready. Click the first station, then the second. The path follows the streets — that is your infrastructure.',
    action: 'Click station A, then station B',
    tool: 'track',
    overlay: 'none',
    progress: (ui) => `${ui?.tracks.length ?? 0} / 1 track`,
    done: (ui) => (ui?.tracks.length ?? 0) >= 1,
  },
  {
    id: 'route',
    title: 'Run a route',
    body: 'Route tool is ready. Click both stations in order, then re-tap the last stop (or press Enter) to launch. Vehicles start rolling immediately.',
    action: 'Click both stops, then re-tap the last',
    tool: 'route',
    overlay: 'none',
    progress: (ui) => `${ui?.routes.length ?? 0} / 1 route`,
    done: (ui) => (ui?.routes.length ?? 0) >= 1,
  },
  {
    id: 'riders',
    title: 'Watch the riders',
    body: 'Time is sped up. Wait for the first daily trips — dots will stream along your line. Crowding and Gaps overlays tell you where to build next.',
    action: 'Let the clock run',
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

/** World-space focus point for a tutorial step (centroid of relevant geometry). */
export function tutorialFocus(ui: UiState | null, stepId: TutorialStepId): { x: number; y: number; scale?: number } | null {
  if (!ui) return null;
  if (stepId === 'track' || stepId === 'route') {
    if (ui.stations.length === 0) return null;
    let x = 0;
    let y = 0;
    for (const s of ui.stations) {
      x += s.x;
      y += s.y;
    }
    return { x: x / ui.stations.length, y: y / ui.stations.length, scale: 0.22 };
  }
  if (stepId === 'riders' && ui.routes.length > 0) {
    const ids = new Set(ui.routes.flatMap((r) => r.stationIds));
    const pts = ui.stations.filter((s) => ids.has(s.id));
    if (pts.length === 0) return null;
    let x = 0;
    let y = 0;
    for (const s of pts) {
      x += s.x;
      y += s.y;
    }
    return { x: x / pts.length, y: y / pts.length, scale: 0.18 };
  }
  return null;
}
