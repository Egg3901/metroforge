/**
 * Procedural audio for MetroForge — Web Audio API only, no asset files.
 * Soft ambient bed + short UI cues. Respects a mute flag in localStorage.
 */
const MUTE_KEY = 'metroforge:mute';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let ambientGain: GainNode | null = null;
let ambientNodes: AudioNode[] = [];
let muted = false;
let unlocked = false;

try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
} catch {
  muted = false;
}

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(ctx.destination);
    ambientGain = ctx.createGain();
    ambientGain.gain.value = 0;
    ambientGain.connect(master);
  }
  return ctx;
}

/** Call from a user gesture so the browser allows audio. */
export function unlockAudio(): void {
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  unlocked = true;
  if (!muted) startAmbient();
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* ignore */
  }
  const c = ensure();
  if (!c || !master) return;
  master.gain.cancelScheduledValues(c.currentTime);
  master.gain.linearRampToValueAtTime(m ? 0 : 0.55, c.currentTime + 0.15);
  if (m) stopAmbient();
  else if (unlocked) startAmbient();
}

export function toggleMute(): boolean {
  setMuted(!muted);
  return muted;
}

function beep(
  freq: number,
  dur: number,
  type: OscillatorType = 'sine',
  gain = 0.08,
  when = 0,
): void {
  const c = ensure();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function sfxClick(): void {
  beep(520, 0.05, 'triangle', 0.04);
}

export function sfxStation(): void {
  beep(440, 0.09, 'sine', 0.07);
  beep(660, 0.12, 'sine', 0.05, 0.06);
}

export function sfxTrack(): void {
  beep(300, 0.08, 'sawtooth', 0.03);
  beep(360, 0.1, 'sawtooth', 0.025, 0.05);
}

export function sfxRoute(): void {
  beep(392, 0.1, 'sine', 0.06);
  beep(494, 0.12, 'sine', 0.05, 0.08);
  beep(587, 0.16, 'sine', 0.05, 0.16);
}

export function sfxGood(): void {
  beep(523, 0.1, 'sine', 0.06);
  beep(659, 0.12, 'sine', 0.05, 0.09);
  beep(784, 0.18, 'sine', 0.05, 0.18);
}

export function sfxWarn(): void {
  beep(220, 0.2, 'square', 0.04);
  beep(180, 0.25, 'square', 0.035, 0.12);
}

export function sfxFail(): void {
  beep(196, 0.35, 'sawtooth', 0.05);
  beep(147, 0.45, 'sawtooth', 0.04, 0.2);
}

function startAmbient(): void {
  const c = ensure();
  if (!c || !ambientGain || muted || ambientNodes.length) return;
  // two slow detuned sines → soft bed under the map
  const freqs = [110, 164.5];
  for (const f of freqs) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    g.gain.value = 0.035;
    osc.connect(g);
    g.connect(ambientGain);
    osc.start();
    ambientNodes.push(osc, g);
  }
  const t = c.currentTime;
  ambientGain.gain.cancelScheduledValues(t);
  ambientGain.gain.setValueAtTime(ambientGain.gain.value, t);
  ambientGain.gain.linearRampToValueAtTime(1, t + 2.5);
}

function stopAmbient(): void {
  const c = ctx;
  if (!c || !ambientGain) return;
  const t = c.currentTime;
  ambientGain.gain.cancelScheduledValues(t);
  ambientGain.gain.linearRampToValueAtTime(0, t + 0.4);
  const nodes = ambientNodes;
  ambientNodes = [];
  window.setTimeout(() => {
    for (const n of nodes) {
      try {
        if ('stop' in n && typeof (n as OscillatorNode).stop === 'function') (n as OscillatorNode).stop();
        n.disconnect();
      } catch {
        /* already stopped */
      }
    }
  }, 500);
}
