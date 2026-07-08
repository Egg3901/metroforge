import { useState } from 'react';
import { GameCanvas } from './GameCanvas';
import { HUD } from './HUD';
import { Toolbar } from './Toolbar';
import { BudgetPanel, GoalsPanel, RoutePanel, StationPanel } from './Panels';
import { CITY_PRESETS } from '@core/city/presets';
import type { MapSize } from '@core/city/presets';
import { useStore } from './store';

function Toasts(): React.JSX.Element {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  const tone = { info: 'border-zinc-600', warn: 'border-red-500', good: 'border-emerald-500' };
  return (
    <div className="absolute bottom-28 md:bottom-4 right-2 md:right-4 flex flex-col gap-2 z-30 max-w-[85vw] md:max-w-sm">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`text-left text-xs bg-zinc-900/95 border-l-4 ${tone[t.tone]} rounded px-3 py-2 text-zinc-200 shadow-lg`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}

function NewGameScreen(): React.JSX.Element {
  const start = useStore((s) => s.start);
  const client = useStore((s) => s.client);
  const [seed, setSeed] = useState(() => String(Math.floor(Math.random() * 1e9)));
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');
  const [presetKey, setPresetKey] = useState('generic');
  const [size, setSize] = useState<MapSize>('medium');
  const hasSave = localStorage.getItem('metroforge:save:auto') !== null;
  const selectedPreset = CITY_PRESETS.find((p) => p.key === presetKey) ?? CITY_PRESETS[0]!;
  return (
    <div className="absolute inset-0 z-40 bg-zinc-950 flex items-center justify-center">
      <div className="w-full max-w-sm px-5 space-y-5">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">MetroForge</h1>
          <p className="text-zinc-400 text-sm mt-1">Paint a transit network onto a living, growing city.</p>
        </div>
        <label className="block text-sm text-zinc-300">
          City seed
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 font-mono text-sm"
          />
        </label>
        <div>
          <div className="text-sm text-zinc-300 mb-1">City</div>
          <div className="grid grid-cols-2 gap-1.5">
            {[...CITY_PRESETS].sort((a, b) => Number(b.real ?? false) - Number(a.real ?? false)).map((p) => (
              <button
                key={p.key}
                onClick={() => setPresetKey(p.key)}
                className={`relative py-2 rounded text-sm ${
                  presetKey === p.key ? 'bg-amber-500 text-zinc-950 font-bold' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {p.label}
                {p.real && (
                  <span className={`absolute top-0.5 right-1 text-[8px] font-bold tracking-wide ${presetKey === p.key ? 'text-zinc-900' : 'text-emerald-400'}`}>
                    REAL
                  </span>
                )}
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-500 mt-1.5 min-h-[2rem]">{selectedPreset.blurb}</p>
        </div>
        <div>
          <div className="text-sm text-zinc-300 mb-1">Map size</div>
          <div className="flex gap-2">
            {(['small', 'medium', 'large'] as const).map((sz) => (
              <button
                key={sz}
                onClick={() => setSize(sz)}
                className={`flex-1 py-2 rounded text-sm capitalize ${
                  size === sz ? 'bg-amber-500 text-zinc-950 font-bold' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {sz}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {(['easy', 'normal', 'hard'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`flex-1 py-2 rounded text-sm capitalize ${
                difficulty === d ? 'bg-amber-500 text-zinc-950 font-bold' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            let n = Number(seed);
            if (!Number.isFinite(n)) {
              n = 0;
              for (const ch of seed) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
            }
            start(n >>> 0, difficulty, { size, presetKey });
          }}
          className="w-full py-3 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold"
        >
          Found a Transit Authority
        </button>
        {hasSave && (
          <button
            onClick={() => {
              const json = localStorage.getItem('metroforge:save:auto');
              if (json) {
                client.loadSave(json);
                useStore.setState({ started: true });
              }
            }}
            className="w-full py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm"
          >
            Continue last save
          </button>
        )}
        <p className="text-xs text-zinc-600">
          Start with buses. Grow the city to unlock trams (50k), metro (150k), and commuter rail (300k).
          Keys: 1–4 modes · S station · T track · R route · B bulldoze · Space pause.
        </p>
      </div>
    </div>
  );
}

export function App(): React.JSX.Element {
  const started = useStore((s) => s.started);
  const panel = useStore((s) => s.panel);
  const bankrupt = useStore((s) => s.ui?.bankrupt ?? false);
  return (
    <div className="fixed inset-0 bg-zinc-950">
      <GameCanvas />
      {started && <HUD />}
      {started && <Toolbar />}
      {started && panel === 'station' && <StationPanel />}
      {started && panel === 'route' && <RoutePanel />}
      {started && panel === 'budget' && <BudgetPanel />}
      {started && panel === 'goals' && <GoalsPanel />}
      <Toasts />
      {!started && <NewGameScreen />}
      {bankrupt && (
        <div className="absolute inset-0 z-40 bg-zinc-950/90 flex items-center justify-center">
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-bold text-red-400">Bankruptcy</h2>
            <p className="text-zinc-400">The city has taken over your transit authority.</p>
            <button onClick={() => location.reload()} className="px-6 py-2 rounded bg-amber-500 text-zinc-950 font-bold">
              New game
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
