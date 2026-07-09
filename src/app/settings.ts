/**
 * Player preferences — view modes, audio, and map presentation.
 * Persisted under metroforge:settings; applied to the renderer + audio layer.
 */
import { isMuted, setMuted } from './audio';

const KEY = 'metroforge:settings';

export type BasemapStyle = 'ink' | 'satellite';
export type ViewMode = 'flat' | 'iso';

export interface Settings {
  /** Stylized ink map (default) or aerial-inspired satellite basemap */
  basemap: BasemapStyle;
  /** Top-down flat, or soft isometric tilt with extruded buildings */
  view: ViewMode;
  /** Day/night wash over the canvas */
  dayNight: boolean;
  /** Soft edge vignette */
  vignette: boolean;
  /** Street / park / water name labels */
  mapLabels: boolean;
  /** Mute procedural audio (mirrors audio.ts) */
  muted: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  basemap: 'ink',
  view: 'flat',
  dayNight: true,
  vignette: true,
  mapLabels: true,
  muted: false,
};

type Listener = (s: Settings) => void;
const listeners = new Set<Listener>();

let current: Settings = loadInitial();

function loadInitial(): Settings {
  let muted = false;
  try {
    muted = isMuted();
  } catch {
    muted = false;
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, muted };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      basemap: parsed.basemap === 'satellite' ? 'satellite' : 'ink',
      view: parsed.view === 'iso' ? 'iso' : 'flat',
      dayNight: parsed.dayNight !== false,
      vignette: parsed.vignette !== false,
      mapLabels: parsed.mapLabels !== false,
      muted,
    };
  } catch {
    return { ...DEFAULT_SETTINGS, muted };
  }
}

function persist(s: Settings): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        basemap: s.basemap,
        view: s.view,
        dayNight: s.dayNight,
        vignette: s.vignette,
        mapLabels: s.mapLabels,
      }),
    );
  } catch {
    /* storage unavailable */
  }
}

export function getSettings(): Settings {
  return current;
}

export function subscribeSettings(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function patchSettings(partial: Partial<Settings>): Settings {
  const next: Settings = { ...current, ...partial };
  if (partial.muted !== undefined) setMuted(partial.muted);
  next.muted = isMuted();
  current = next;
  persist(next);
  for (const fn of listeners) fn(next);
  return next;
}

/** Sync mute flag if toggled from the HUD without going through settings. */
export function syncMuteFromAudio(): Settings {
  const m = isMuted();
  if (m === current.muted) return current;
  current = { ...current, muted: m };
  for (const fn of listeners) fn(current);
  return current;
}
