import { create } from 'zustand';
import type { TransitMode } from '@core/types';
import type { UiState } from '@host/protocol';
import { SimClient } from '@host/client';

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
  panel: 'none' | 'budget' | 'station' | 'route';
  overlay: OverlayMode;

  setTool: (t: Tool) => void;
  setMode: (m: TransitMode) => void;
  setSpeed: (s: number) => void;
  setUi: (ui: UiState) => void;
  start: (seed: number, difficulty: 'easy' | 'normal' | 'hard', opts?: { size?: 'small' | 'medium' | 'large' | undefined; presetKey?: string | undefined }) => void;
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

  client.events.onUi = (ui) => set({ ui });
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

    setTool: (tool) => set({ tool, trackFrom: null, trackWaypoints: [], routeStops: [], trackCostEstimate: null }),
    setMode: (mode) => set({ mode, trackFrom: null, trackWaypoints: [], routeStops: [], trackCostEstimate: null }),
    setSpeed: (speed) => {
      client.setSpeed(speed);
      set({ speed });
    },
    setUi: (ui) => set({ ui }),
    start: (seed, difficulty, opts) => {
      client.init(seed, difficulty, opts);
      set({ started: true });
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
