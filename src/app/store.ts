import { create } from 'zustand';
import type { TransitMode } from '@core/types';
import type { UiState } from '@host/protocol';
import { SimClient } from '@host/client';
import { GOALS, completedGoalIds } from './goals';
import type { Scenario } from './scenarios';
import { loadAccount, submitScore, type Account } from './api';

export type Tool = 'select' | 'station' | 'track' | 'route' | 'bulldoze';
export type OverlayMode = 'none' | 'density' | 'value' | 'coverage' | 'nimby' | 'traffic';

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
  panel: 'none' | 'budget' | 'station' | 'route' | 'goals';
  overlay: OverlayMode;
  /** ids of completed progression goals */
  completedGoals: string[];
  /** active scenario + whether its objective has been met */
  scenario: Scenario | null;
  won: boolean;
  /** signed-in account (for leaderboards), or null */
  account: Account | null;
  setAccount: (a: Account | null) => void;

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
    // scenario win → post the score (daily riders) to the leaderboard
    const sc = get().scenario;
    if (sc && !get().won && sc.progress(ui) >= 1) {
      set({ won: true });
      const acct = get().account;
      if (acct) {
        submitScore(acct.token, sc.id, Math.round(ui.dailyTransitTrips), sc.city)
          .then(() => get().pushToast('Score posted to the leaderboard', 'good'))
          .catch(() => {});
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
    account: loadAccount(),
    setAccount: (account) => set({ account }),

    setTool: (tool) => set({ tool, trackFrom: null, trackWaypoints: [], routeStops: [], trackCostEstimate: null }),
    setMode: (mode) => set({ mode, trackFrom: null, trackWaypoints: [], routeStops: [], trackCostEstimate: null }),
    setSpeed: (speed) => {
      client.setSpeed(speed);
      set({ speed });
    },
    setUi: (ui) => set({ ui }),
    start: (seed, difficulty, opts) => {
      client.init(seed, difficulty, opts);
      set({ started: true, completedGoals: [], scenario: null, won: false });
    },
    startScenario: (s, seed) => {
      client.init(seed, s.difficulty, { size: s.size, presetKey: s.presetKey });
      set({ started: true, completedGoals: [], scenario: s, won: false });
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
