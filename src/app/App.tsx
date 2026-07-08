import { useState, useEffect } from 'react';
import { GameCanvas } from './GameCanvas';
import { HUD } from './HUD';
import { Toolbar } from './Toolbar';
import { BudgetPanel, GoalsPanel, RoutePanel, RoutesPanel, StationPanel } from './Panels';
import { CITY_PRESETS } from '@core/city/presets';
import type { MapSize } from '@core/city/presets';
import { OSM_CITY_KEYS } from '@core/city/osmRegistry';
import { Logo, Wordmark, TAGLINE } from './brand';
import { SCENARIOS } from './scenarios';
import { isUnlocked, starsToUnlock, totalStars } from '@content/campaign';
import { MAX_STARS } from '@content/scenarioRegistry';
import { authenticate, fetchLeaderboard, signOut, type LeaderEntry } from './api';
import { useStore } from './store';
import { TutorialCard } from './TutorialCard';
import { clearTutorialDone, loadTutorialDone } from './tutorial';

const randomSeed = (): number => Math.floor(Math.random() * 1e9);
const seedFrom = (s: string): number => {
  let n = Number(s);
  if (!Number.isFinite(n)) { n = 0; for (const ch of s) n = (n * 31 + ch.charCodeAt(0)) >>> 0; }
  return n >>> 0;
};
const DIFF_TONE: Record<string, string> = { easy: 'text-emerald-400', normal: 'text-sky-400', hard: 'text-rose-400' };

function Toasts(): React.JSX.Element {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  const tutorialActive = useStore((s) => s.tutorialActive);
  const tone = { info: 'border-zinc-600', warn: 'border-red-500', good: 'border-emerald-500' };
  // sit above the tutorial coach card when it's on screen
  const pos = tutorialActive
    ? 'absolute top-14 right-2 md:right-4'
    : 'absolute bottom-28 md:bottom-4 right-2 md:right-4';
  return (
    <div className={`${pos} flex flex-col gap-2 z-30 max-w-[85vw] md:max-w-sm`}>
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

function FreePlay(): React.JSX.Element {
  const start = useStore((s) => s.start);
  // real cities only — procedural gen is retired from the player experience
  const cities = CITY_PRESETS.filter((p) => p.real);
  const [seed, setSeed] = useState(() => String(randomSeed()));
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');
  const [presetKey, setPresetKey] = useState<string>('__random');
  const [size, setSize] = useState<MapSize>('medium');
  const preset = cities.find((p) => p.key === presetKey);
  const chip = (active: boolean): string =>
    `flex-1 py-2 rounded-lg text-sm capitalize transition-colors ${active ? 'bg-amber-500 text-zinc-950 font-semibold' : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700'}`;
  const launch = (): void => {
    const key = presetKey === '__random' ? OSM_CITY_KEYS[Math.floor(Math.random() * OSM_CITY_KEYS.length)]! : presetKey;
    start(seedFrom(seed), difficulty, { size, presetKey: key });
  };
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs uppercase tracking-widest text-zinc-500 mb-1.5">City</div>
        <div className="grid grid-cols-3 gap-1.5">
          <button onClick={() => setPresetKey('__random')}
            className={`py-2 rounded-lg text-sm transition-colors ${presetKey === '__random' ? 'bg-amber-500 text-zinc-950 font-semibold' : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700'}`}>
            Random
          </button>
          {cities.map((p) => (
            <button key={p.key} onClick={() => setPresetKey(p.key)}
              className={`py-2 rounded-lg text-sm transition-colors ${presetKey === p.key ? 'bg-amber-500 text-zinc-950 font-semibold' : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500 mt-1.5 min-h-[1.5rem]">{preset ? preset.blurb : 'A random real city each time you play.'}</p>
      </div>
      <div className="flex gap-2">
        {(['small', 'medium', 'large'] as const).map((sz) => (
          <button key={sz} onClick={() => setSize(sz)} className={chip(size === sz)}>{sz}</button>
        ))}
      </div>
      <div className="flex gap-2">
        {(['easy', 'normal', 'hard'] as const).map((d) => (
          <button key={d} onClick={() => setDifficulty(d)} className={chip(difficulty === d)}>{d}</button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs text-zinc-500">
        Seed
        <input value={seed} onChange={(e) => setSeed(e.target.value)}
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 font-mono text-xs text-zinc-300" />
        <button onClick={() => setSeed(String(randomSeed()))} className="px-2 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-100" title="Randomize">⟳</button>
      </label>
      <button onClick={launch}
        className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold transition-colors">
        Found a Transit Authority
      </button>
    </div>
  );
}

function Stars({ earned, tone = 'text-amber-400' }: { earned: number; tone?: string }): React.JSX.Element {
  return (
    <span className="tracking-tight" title={`${earned} / 3 stars`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < earned ? tone : 'text-zinc-700'}>★</span>
      ))}
    </span>
  );
}

function ScenarioList(): React.JSX.Element {
  const startScenario = useStore((s) => s.startScenario);
  const stars = useStore((s) => s.stars);
  const banked = totalStars(stars);
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between text-xs text-zinc-500 px-0.5">
        <span>Earn stars to unlock new cities</span>
        <span className="text-amber-300/90 font-mono">{banked} / {MAX_STARS} ★</span>
      </div>
      {SCENARIOS.map((sc) => {
        const unlocked = isUnlocked(sc, banked);
        const need = starsToUnlock(sc, banked);
        const earned = stars[sc.scenarioId] ?? 0;
        return (
          <button
            key={sc.scenarioId}
            disabled={!unlocked}
            onClick={() => unlocked && startScenario(sc, randomSeed())}
            className={`group text-left rounded-xl border p-3.5 transition-colors ${
              unlocked
                ? 'border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/60 hover:border-zinc-700'
                : 'border-zinc-800/60 bg-zinc-900/30 opacity-70 cursor-not-allowed'
            }`}
          >
            <div className="flex items-baseline gap-2">
              <span className="text-base leading-none">{sc.flag}</span>
              <span className="font-semibold text-zinc-100">{sc.label}</span>
              <span className="text-xs text-zinc-500">{sc.city}</span>
              <span className={`ml-auto text-[10px] font-bold uppercase tracking-wide ${DIFF_TONE[sc.difficulty]}`}>{sc.difficulty}</span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">{sc.description}</p>
            {unlocked ? (
              <div className="flex items-center gap-2 mt-2 text-[11px]">
                <span className="flex items-center gap-1.5 text-amber-300/90">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  {sc.goal}
                </span>
                <span className="ml-auto"><Stars earned={earned} /></span>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-2 text-[11px] text-zinc-500">
                <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 uppercase tracking-wide text-[9px] font-bold">Locked</span>
                <span>Earn {need} more star{need > 1 ? 's' : ''} to unlock</span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function AuthModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const setAccount = useStore((s) => s.setAccount);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (): Promise<void> => {
    setBusy(true); setErr('');
    try { setAccount(await authenticate(mode, name.trim(), password)); onClose(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center px-6" onClick={onClose}>
      <div className="w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-1 p-1 bg-zinc-950/70 rounded-lg mb-4">
          {([['login', 'Sign in'], ['register', 'Create account']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} className={`flex-1 py-1.5 rounded-md text-xs font-medium ${mode === k ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500'}`}>{l}</button>
          ))}
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus
          className="w-full mb-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password"
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="w-full mb-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
        {err && <p className="text-xs text-rose-400 mb-2">{err}</p>}
        <button disabled={busy} onClick={submit} className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm disabled:opacity-60">
          {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </div>
    </div>
  );
}

function Leaderboard({ scenario }: { scenario: string }): React.JSX.Element {
  const [entries, setEntries] = useState<LeaderEntry[] | null>(null);
  const myName = useStore((s) => s.account?.name);
  useEffect(() => { let ok = true; fetchLeaderboard(scenario).then((e) => ok && setEntries(e)).catch(() => ok && setEntries([])); return () => { ok = false; }; }, [scenario]);
  if (entries === null) return <div className="text-xs text-zinc-500 py-2">Loading leaderboard…</div>;
  if (entries.length === 0) return <div className="text-xs text-zinc-500 py-2">No scores yet — be the first.</div>;
  return (
    <div className="text-left">
      {entries.map((e, i) => (
        <div key={i} className={`flex items-center gap-2 py-1 text-sm ${e.name === myName ? 'text-amber-300' : 'text-zinc-300'}`}>
          <span className="w-5 text-right text-zinc-500 tabular-nums">{i + 1}</span>
          <span className="flex-1 truncate">{e.name}</span>
          <span className="tabular-nums text-zinc-400">{Math.round(e.value).toLocaleString()}</span>
        </div>
      ))}
      <div className="text-[10px] text-zinc-600 mt-1">daily riders</div>
    </div>
  );
}

function NewGameScreen(): React.JSX.Element {
  const client = useStore((s) => s.client);
  const account = useStore((s) => s.account);
  const setAccount = useStore((s) => s.setAccount);
  const [tab, setTab] = useState<'scenarios' | 'free'>('scenarios');
  const [authOpen, setAuthOpen] = useState(false);
  const hasSave = localStorage.getItem('metroforge:save:auto') !== null;
  return (
    <div className="absolute inset-0 z-40 bg-zinc-950 overflow-y-auto">
      {/* subtle brand glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(255,182,61,0.08),transparent)]" />
      <div className="absolute top-3 right-3 z-10 text-xs">
        {account ? (
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="text-zinc-200">{account.name}</span>
            <button onClick={() => { signOut(); setAccount(null); }} className="text-zinc-500 hover:text-zinc-200">Sign out</button>
          </div>
        ) : (
          <button onClick={() => setAuthOpen(true)} className="px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/70 text-zinc-300 hover:text-zinc-100">Sign in</button>
        )}
      </div>
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      <div className="relative w-full max-w-md mx-auto px-5 py-10 min-h-full flex flex-col">
        <div className="flex flex-col items-center text-center mb-7">
          <Logo size={64} />
          <div className="mt-3"><Wordmark size={30} /></div>
          <p className="text-zinc-400 text-sm mt-2 font-sans">{TAGLINE}</p>
        </div>

        <div className="flex gap-1 p-1 bg-zinc-900/70 rounded-xl mb-4">
          {([['scenarios', 'Scenarios'], ['free', 'Free Play']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === k ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'scenarios' ? <ScenarioList /> : <FreePlay />}

        {hasSave && (
          <button
            onClick={() => {
              const json = localStorage.getItem('metroforge:save:auto');
              if (json) {
                client.loadSave(json);
                useStore.setState({ started: true, tutorialActive: false, tutorialStep: 0 });
              }
            }}
            className="mt-4 w-full py-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300 text-sm">
            Continue last save
          </button>
        )}
        {loadTutorialDone() && (
          <button
            onClick={() => {
              clearTutorialDone();
              useStore.getState().pushToast('Tutorial will start on your next city', 'info');
            }}
            className="mt-2 w-full py-2 rounded-xl text-zinc-500 hover:text-zinc-300 text-xs transition-colors">
            Replay the first-city lesson
          </button>
        )}
        <p className="text-[11px] text-zinc-600 text-center mt-auto pt-6">
          Buses first; grow to unlock tram · metro · rail. Keys: 1–4 modes · S T R B · Space pause.
        </p>
      </div>
    </div>
  );
}

const NO_EVENTS: { id: string; name: string; daysLeft: number }[] = [];
function EventsBanner(): React.JSX.Element | null {
  // NOTE: `?? NO_EVENTS` (a stable ref) — never `?? []`, which makes a new array
  // each render and sends Zustand into an infinite update loop before ui loads.
  const events = useStore((s) => s.ui?.activeEvents ?? NO_EVENTS);
  if (events.length === 0) return null;
  return (
    <div className="absolute top-14 sm:top-14 left-1/2 -translate-x-1/2 z-10 flex gap-2 pointer-events-none max-w-[90vw] flex-wrap justify-center">
      {events.map((e) => (
        <div key={e.id} className="flex items-center gap-1.5 rounded-full bg-zinc-950/85 backdrop-blur border border-amber-500/40 px-3 py-1 text-xs text-zinc-200 shadow-lg">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="font-medium">{e.name}</span>
          <span className="text-zinc-500 tabular-nums">{e.daysLeft}d</span>
        </div>
      ))}
    </div>
  );
}

function WinOverlay(): React.JSX.Element {
  const scenario = useStore((s) => s.scenario);
  const account = useStore((s) => s.account);
  const runStars = useStore((s) => s.runStars);
  const [authOpen, setAuthOpen] = useState(false);
  return (
    <div className="absolute inset-0 z-50 bg-zinc-950/92 backdrop-blur-sm flex items-center justify-center px-6 overflow-y-auto py-8">
      <div className="text-center max-w-sm w-full">
        <div className="flex justify-center mb-4"><Logo size={56} /></div>
        <div className="text-emerald-400 text-xs font-bold uppercase tracking-widest">Objective complete</div>
        <h2 className="text-3xl font-bold text-zinc-100 mt-2">{scenario?.label ?? 'You did it'}</h2>
        <div className="text-4xl mt-3 tracking-widest">
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < runStars ? 'text-amber-400' : 'text-zinc-700'}>★</span>
          ))}
        </div>
        <p className="text-zinc-400 mt-2">{scenario ? `${scenario.city} — ${scenario.goal}.` : ''} Keep building to earn more stars.</p>

        {scenario && (
          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Leaderboard · {scenario.label}</div>
            <Leaderboard scenario={scenario.scenarioId} />
            {!account && (
              <button onClick={() => setAuthOpen(true)} className="mt-3 w-full py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs">
                Sign in to post your score
              </button>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-center mt-6">
          <button onClick={() => useStore.setState({ won: false })} className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium">Keep building</button>
          <button onClick={() => useStore.setState({ started: false, won: false, scenario: null })} className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold">New game</button>
        </div>
      </div>
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  );
}

export function App(): React.JSX.Element {
  const started = useStore((s) => s.started);
  const panel = useStore((s) => s.panel);
  const won = useStore((s) => s.won);
  const bankrupt = useStore((s) => s.ui?.bankrupt ?? false);
  return (
    <div className="fixed inset-0 bg-zinc-950">
      <GameCanvas />
      {started && <HUD />}
      {started && <EventsBanner />}
      {started && <Toolbar />}
      {started && panel === 'station' && <StationPanel />}
      {started && panel === 'route' && <RoutePanel />}
      {started && panel === 'budget' && <BudgetPanel />}
      {started && panel === 'goals' && <GoalsPanel />}
      {started && panel === 'routes' && <RoutesPanel />}
      <Toasts />
      {started && <TutorialCard />}
      {started && won && <WinOverlay />}
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
