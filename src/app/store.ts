import { create } from 'zustand';
import type { TransitMode } from '@core/types';
import type { UiState } from '@host/protocol';
import { SimClient } from '@host/client';
import { GOALS, completedGoalIds } from './goals';
import type { Scenario } from './scenarios';
import { loadStars, recordStars, starsForProgress, type StarMap } from '@content/campaign';
import { loadAccount, submitScore, type Account } from './api';
import { loadTutorialDone, markTutorialDone, TUTORIAL_STEPS } from './tutorial';

export type Tool = 'select' | 'station' | 'track' | 'route' | 'bulldoze';
export type OverlayMode = 'none' | 'density' | 'value' | 'coverage' | 'nimby' | 'traffic' | 'unserved';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'warn' | 'good';
}

interface AppState {
  client: SimClient;
  ui: UiState | null;
  tool: Tool;
  mode: TransitMode;
  speed: number;
  started: boolean;
  /** track tool: origin station + waypoints in progress */
  trackFrom: number | null;
  trackWaypoints: { x: number; y: number }[];
  trackCostEstimate: number | null;
  /** route tool: station ids clicked so far */
  routeStops: number[];
  selectedStationId: number | null;
  selectedRouteId: number | null;
  toasts: Toast[];
  panel: 'none' | 'budget' | 'station' | 'route' | 'goals' | 'routes';
  overlay: OverlayMode;
  /** ids of completed progression goals */
  completedGoals: string[];
  /** active scenario + whether its objective has been met */
  scenario: Scenario | null;
  won: boolean;
  /** best stars earned per scenarioId (campaign progression) */
  stars: StarMap;
  /** stars awarded to the active run so far (for the win overlay) */
  runStars: number;
  /** signed-in account (for leaderboards), or null */
  account: Account | null;
  setAccount: (a: Account | null) => void;
  /** guided first-city tutorial */
  tutorialActive: boolean;
  tutorialStep: number;
  advanceTutorial: () => void;
  skipTutorial: () => void;

  setTool: (t: Tool) => void;
  setMode: (m: TransitMode) => void;
  setSpeed: (s: number) => void;
  setUi: (ui: UiState) => void;
  start: (seed: number, difficulty: 'easy' | 'normal' | 'hard', opts?: { size?: 'small' | 'medium' | 'large' | undefined; presetKey?: string | undefined }) => void;
  startScenario: (s: Scenario, seed: number) => void;
  pushToast: (message: string, tone: Toast['tone']) => void;
  dismissToast: (id: number) => void;
  cancelPending: () => void;
  select: (kind: 'station' | 'route' | null, id: number | null) => void;
  setPanel: (p: AppState['panel']) => void;
  setOverlay: (o: OverlayMode) => void;
}

let toastId = 1;

export const useStore = create<AppState>((set, get) => {
  const client = new SimClient();

  client.events.onUi = (ui) => {
    // celebrate any newly-completed goals
    const prev = get().completedGoals;
    const done = completedGoalIds(ui);
    if (done.length > prev.length) {
      for (const id of done) {
        if (!prev.includes(id)) {
          const g = GOALS.find((x) => x.id === id);
          if (g) get().pushToast(`Goal complete — ${g.label}`, 'good');
        }
      }
      set({ ui, completedGoals: done });
    } else {
      set({ ui });
    }
    // scenario progress → win + stars (1 at goal, 2 at 1.3x, 3 at 1.7x)
    const sc = get().scenario;
    if (sc) {
      const p = sc.progress(ui);
      if (!get().won && p >= 1) {
        set({ won: true });
        const acct = get().account;
        if (acct) {
          submitScore(acct.token, sc.scenarioId, Math.round(ui.dailyTransitTrips), sc.city)
            .then(() => get().pushToast('Score posted to the leaderboard', 'good'))
            .catch(() => {});
        }
      }
      const earned = starsForProgress(p);
      if (earned > (get().stars[sc.scenarioId] ?? 0)) {
        set({ stars: recordStars(sc.scenarioId, earned), runStars: Math.max(earned, get().runStars) });
        get().pushToast(`${'★'.repeat(earned)} ${sc.city}: ${earned} star${earned > 1 ? 's' : ''}`, 'good');
      } else if (earned > get().runStars) {
        set({ runStars: earned });
      }
    }
  };
  client.events.onToast = (message, tone) => get().pushToast(message, tone);
  client.events.onSaved = (json) => {
    localStorage.setItem('metroforge:save:auto', json);
    get().pushToast('Game saved', 'good');
  };

  return {
    client,
    ui: null,
    tool: 'select',
    mode: 'bus',
    speed: 1,
    started: false,
    trackFrom: null,
    trackWaypoints: [],
    trackCostEstimate: null,
    routeStops: [],
    selectedStationId: null,
    selectedRouteId: null,
    toasts: [],
    panel: 'none',
    overlay: 'none',
    completedGoals: [],
    scenario: null,
    won: false,
    stars: loadStars(),
    runStars: 0,
    account: loadAccount(),
    setAccount: (account) => set({ account }),
    tutorialActive: false,
    tutorialStep: 0,
    advanceTutorial: () => {
      const { tutorialStep, tutorialActive } = get();
      if (!tutorialActive) return;
      const next = tutorialStep + 1;
      if (next >= TUTORIAL_STEPS.length) {
        markTutorialDone();
        set({ tutorialActive: false, tutorialStep: 0, overlay: 'none', tool: 'select' });
        get().pushToast('Tutorial complete — keep building', 'good');
        return;
      }
      set({ tutorialStep: next });
    },
    skipTutorial: () => {
      markTutorialDone();
      set({ tutorialActive: false, tutorialStep: 0, overlay: 'none' });
      get().pushToast('Tutorial skipped — reopen anytime from Home', 'info');
    },

    setTool: (tool) => set({ tool, trackFrom: null, trackWaypoints: [], routeStops: [], trackCostEstimate: null }),
    setMode: (mode) => set({ mode, trackFrom: null, trackWaypoints: [], routeStops: [], trackCostEstimate: null }),
    setSpeed: (speed) => {
      client.setSpeed(speed);
      set({ speed });
    },
    setUi: (ui) => set({ ui }),
    start: (seed, difficulty, opts) => {
      client.init(seed, difficulty, opts);
      const teach = !loadTutorialDone();
      set({
        started: true,
        completedGoals: [],
        scenario: null,
        won: false,
        runStars: 0,
        tutorialActive: teach,
        tutorialStep: 0,
        overlay: teach ? 'density' : 'none',
        tool: 'select',
        mode: 'bus',
      });
    },
    startScenario: (s, seed) => {
      client.init(seed, s.difficulty, { size: s.size, presetKey: s.cityKey });
      const teach = !loadTutorialDone();
      set({
        started: true,
        completedGoals: [],
        scenario: s,
        won: false,
        runStars: 0,
        tutorialActive: teach,
        tutorialStep: 0,
        overlay: teach ? 'density' : 'none',
        tool: 'select',
        mode: 'bus',
      });
    },
    pushToast: (message, tone) => {
      const id = toastId++;
      set((s) => ({ toasts: [...s.toasts.slice(-4), { id, message, tone }] }));
      setTimeout(() => get().dismissToast(id), 6000);
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    cancelPending: () => set({ trackFrom: null, trackWaypoints: [], routeStops: [], trackCostEstimate: null }),
    select: (kind, id) =>
      set({
        selectedStationId: kind === 'station' ? id : null,
        selectedRouteId: kind === 'route' ? id : null,
        panel: kind === 'station' ? 'station' : kind === 'route' ? 'route' : 'none',
      }),
    setPanel: (panel) => set({ panel }),
    setOverlay: (overlay) => set({ overlay }),
  };
});
