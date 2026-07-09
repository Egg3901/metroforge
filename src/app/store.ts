import { create } from 'zustand';
import type { TransitMode } from '@core/types';
import type { UiState } from '@host/protocol';
import { SimClient } from '@host/client';
import { GOALS, completedGoalIds } from './goals';
import type { Scenario } from './scenarios';
import { applyCloudStars, loadStars, persistStars, recordStars, starsForProgress, type StarMap } from '@content/campaign';
import { enqueueScore, fetchCampaign, flushScoreQueue, loadAccount, pushCampaign, submitScore, type Account } from './api';
import { sfxFail, sfxGood, unlockAudio } from './audio';
import { loadTutorialDone, markTutorialDone, TUTORIAL_STEPS } from './tutorial';
import { getSettings } from './settings';

export type Tool = 'select' | 'station' | 'track' | 'route' | 'bulldoze';
export type OverlayMode = 'none' | 'density' | 'value' | 'coverage' | 'nimby' | 'traffic' | 'unserved';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'warn' | 'good';
}

export interface GoalBanner {
  id: number;
  label: string;
}

interface AppState {
  client: SimClient;
  ui: UiState | null;
  tool: Tool;
  mode: TransitMode;
  speed: number;
  started: boolean;
  trackFrom: number | null;
  trackWaypoints: { x: number; y: number }[];
  trackCostEstimate: number | null;
  routeStops: number[];
  selectedStationId: number | null;
  selectedRouteId: number | null;
  toasts: Toast[];
  goalBanners: GoalBanner[];
  shortcutsOpen: boolean;
  panel: 'none' | 'budget' | 'station' | 'route' | 'goals' | 'routes' | 'settings';
  overlay: OverlayMode;
  completedGoals: string[];
  scenario: Scenario | null;
  won: boolean;
  /** seed used for the active run (for daily / replay) */
  runSeed: number | null;
  stars: StarMap;
  runStars: number;
  account: Account | null;
  setAccount: (a: Account | null) => void;
  /** pull/push campaign stars with the signed-in account */
  syncCampaign: () => Promise<void>;
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
  pushGoalBanner: (label: string) => void;
  dismissGoalBanner: (id: number) => void;
  setShortcutsOpen: (open: boolean) => void;
  cancelPending: () => void;
  select: (kind: 'station' | 'route' | null, id: number | null) => void;
  setPanel: (p: AppState['panel']) => void;
  setOverlay: (o: OverlayMode) => void;
}

let toastId = 1;
let bannerId = 1;
let scorePosted = false;
let lastFailed: string | null = null;

async function postVerifiedScore(sc: Scenario, ui: UiState, client: SimClient, token: string, pushToast: AppState['pushToast']): Promise<void> {
  try {
    const replay = await client.requestReplay();
    const sub = {
      scenario: sc.scenarioId,
      value: sc.score(ui),
      city: sc.city,
      replay,
    };
    try {
      const { verified } = await submitScore(token, sub);
      pushToast(verified ? 'Score verified on the server' : 'Score posted (pending verify)', 'good');
      sfxGood();
    } catch {
      enqueueScore(sub);
      pushToast('Score saved offline — will retry when connected', 'warn');
    }
  } catch {
    pushToast('Could not capture replay for score', 'warn');
  }
}

export const useStore = create<AppState>((set, get) => {
  const client = new SimClient();

  client.events.onUi = (ui) => {
    const prev = get().completedGoals;
    const done = completedGoalIds(ui);
    if (done.length > prev.length) {
      for (const id of done) {
        if (!prev.includes(id)) {
          const g = GOALS.find((x) => x.id === id);
          if (g) {
            get().pushGoalBanner(g.label);
            get().pushToast(`Goal complete — ${g.label}`, 'good');
            sfxGood();
          }
        }
      }
      set({ ui, completedGoals: done });
    } else {
      set({ ui });
    }

    // sync mode if current mode got locked out (era starts)
    if (!ui.unlockedModes.includes(get().mode) && ui.unlockedModes[0]) {
      set({ mode: ui.unlockedModes[0]! });
    }

    if (ui.failed && ui.failed !== lastFailed) {
      lastFailed = ui.failed;
      sfxFail();
    }
    if (!ui.failed) lastFailed = null;

    const sc = get().scenario;
    if (sc && !ui.failed) {
      const p = sc.progress(ui);
      if (!get().won && p >= 1) {
        set({ won: true });
        sfxGood();
        const acct = get().account;
        if (acct && !scorePosted) {
          scorePosted = true;
          void postVerifiedScore(sc, ui, client, acct.token, get().pushToast);
        }
      }
      // campaign stars only for non-daily scenarios
      if (!sc.scenarioId.startsWith('daily-')) {
        const earned = starsForProgress(p);
        if (earned > (get().stars[sc.scenarioId] ?? 0)) {
          const next = recordStars(sc.scenarioId, earned);
          set({ stars: next, runStars: Math.max(earned, get().runStars) });
          get().pushToast(`${'★'.repeat(earned)} ${sc.city}: ${earned} star${earned > 1 ? 's' : ''}`, 'good');
          if (get().account) void get().syncCampaign();
        } else if (earned > get().runStars) {
          set({ runStars: earned });
        }
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
    goalBanners: [],
    shortcutsOpen: false,
    panel: 'none',
    overlay: 'none',
    completedGoals: [],
    scenario: null,
    won: false,
    runSeed: null,
    stars: loadStars(),
    runStars: 0,
    account: loadAccount(),
    setAccount: (account) => {
      set({ account });
      if (account) {
        void get().syncCampaign();
        void flushScoreQueue(account.token).then((n) => {
          if (n > 0) get().pushToast(`Posted ${n} queued score${n === 1 ? '' : 's'}`, 'good');
        });
      }
    },
    syncCampaign: async () => {
      const acct = get().account;
      if (!acct) return;
      try {
        const cloud = await fetchCampaign(acct.token);
        const mergedLocal = applyCloudStars(cloud);
        const pushed = await pushCampaign(acct.token, mergedLocal);
        const final = applyCloudStars(pushed);
        persistStars(final);
        set({ stars: final });
        const n = await flushScoreQueue(acct.token);
        if (n > 0) get().pushToast(`Posted ${n} queued score${n === 1 ? '' : 's'}`, 'good');
      } catch {
        get().pushToast('Could not sync campaign stars — will retry when online', 'warn');
      }
    },
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
      scorePosted = false;
      lastFailed = null;
      unlockAudio();
      client.init(seed, difficulty, opts);
      const teach = !loadTutorialDone();
      const pause = getSettings().pauseOnStart;
      set({
        started: true,
        completedGoals: [],
        scenario: null,
        won: false,
        runStars: 0,
        runSeed: seed,
        tutorialActive: teach,
        tutorialStep: 0,
        overlay: teach ? 'density' : 'none',
        tool: 'select',
        mode: 'bus',
        speed: pause ? 0 : 1,
        goalBanners: [],
        shortcutsOpen: false,
      });
      if (pause) client.setSpeed(0);
    },
    startScenario: (s, seed) => {
      scorePosted = false;
      lastFailed = null;
      unlockAudio();
      client.init(seed, s.difficulty, { size: s.size, presetKey: s.cityKey, rules: s.rules });
      // Tutorial is free-play only — eras already teach under a clock and locked kit.
      const startMode = s.rules.startingModes[0] ?? 'bus';
      const pause = getSettings().pauseOnStart;
      set({
        started: true,
        completedGoals: [],
        scenario: s,
        won: false,
        runStars: 0,
        runSeed: seed,
        tutorialActive: false,
        tutorialStep: 0,
        overlay: 'none',
        tool: 'select',
        mode: startMode,
        speed: pause ? 0 : 1,
        goalBanners: [],
        shortcutsOpen: false,
      });
      if (pause) client.setSpeed(0);
    },
    pushToast: (message, tone) => {
      const id = toastId++;
      set((s) => ({ toasts: [...s.toasts.slice(-4), { id, message, tone }] }));
      setTimeout(() => get().dismissToast(id), 6000);
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    pushGoalBanner: (label) => {
      const id = bannerId++;
      set((s) => ({ goalBanners: [...s.goalBanners.slice(-2), { id, label }] }));
      setTimeout(() => get().dismissGoalBanner(id), 5000);
    },
    dismissGoalBanner: (id) => set((s) => ({ goalBanners: s.goalBanners.filter((b) => b.id !== id) })),
    setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
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
