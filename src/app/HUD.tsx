import { TICKS_PER_DAY } from '@core/constants';
import {
  BudgetIcon,
  CoinsIcon,
  HelpIcon,
  PauseIcon,
  PeopleIcon,
  PinIcon,
  SettingsIcon,
  ShareIcon,
  ThumbIcon,
} from './icons';
import { GOALS } from './goals';
import { Wordmark } from './brand';
import { exportNetworkCard } from './exportCard';
import { isMuted, toggleMute, unlockAudio } from './audio';
import { syncMuteFromAudio } from './settings';
import { useStore } from './store';
import type { OverlayMode } from './store';
import { useEffect, useState } from 'react';
import { getRenderer } from './rendererBridge';

/** Map a sim tick to a wall clock within the game day. */
function clockOf(tick: number): string {
  const frac = (tick % TICKS_PER_DAY) / TICKS_PER_DAY;
  const mins = Math.floor(frac * 1440);
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

const OVERLAY_OPTIONS: [OverlayMode, string][] = [
  ['none', 'Map'],
  ['density', 'Density'],
  ['traffic', 'Traffic'],
  ['value', 'Value'],
  ['coverage', 'Reach'],
  ['nimby', 'NIMBY'],
  ['unserved', 'Gaps'],
];

const fmtMoney = (v: number): string => {
  const abs = Math.abs(v);
  const s = abs >= 1e6 ? `$${(abs / 1e6).toFixed(2)}M` : abs >= 1e3 ? `$${(abs / 1e3).toFixed(0)}K` : `$${abs.toFixed(0)}`;
  return v < 0 ? `-${s}` : s;
};

function Stat({ icon, value, title, onClick, className }: {
  icon: React.ReactNode;
  value: string;
  title: string;
  onClick?: () => void;
  className?: string;
}): React.JSX.Element {
  const cls = `flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap ${
    onClick ? 'hover:bg-zinc-800 cursor-pointer' : ''
  } ${className ?? 'text-zinc-300'}`;
  return onClick ? (
    <button className={cls} onClick={onClick} title={title}>
      {icon}
      {value}
    </button>
  ) : (
    <span className={cls} title={title}>
      {icon}
      {value}
    </span>
  );
}

export function HUD(): React.JSX.Element | null {
  const ui = useStore((s) => s.ui);
  const speed = useStore((s) => s.speed);
  const setSpeed = useStore((s) => s.setSpeed);
  const setPanel = useStore((s) => s.setPanel);
  const panel = useStore((s) => s.panel);
  const overlay = useStore((s) => s.overlay);
  const setOverlay = useStore((s) => s.setOverlay);
  const client = useStore((s) => s.client);
  const scenario = useStore((s) => s.scenario);
  const pushToast = useStore((s) => s.pushToast);
  const completedGoals = useStore((s) => s.completedGoals.length);
  const totalGoals = GOALS.length;
  const runStars = useStore((s) => s.runStars);
  const shortcutsOpen = useStore((s) => s.shortcutsOpen);
  const setShortcutsOpen = useStore((s) => s.setShortcutsOpen);
  const [muted, setMutedUi] = useState(isMuted);
  const [zoomPct, setZoomPct] = useState(100);

  useEffect(() => {
    const id = window.setInterval(() => {
      const r = getRenderer();
      if (!r) return;
      // 0.09 ≈ default city fit → 100%
      setZoomPct(Math.round((r.getZoom() / 0.09) * 100));
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  if (!ui) return null;

  const cashColor = ui.cash < 0 ? 'text-red-400' : ui.cash < 500_000 ? 'text-amber-400' : 'text-emerald-400';
  const net =
    ui.lastDay.fares + ui.lastDay.subsidy - ui.lastDay.operations - ui.lastDay.maintenance - ui.lastDay.interest;

  const share = async (): Promise<void> => {
    const cityLabel = scenario ? `${scenario.city} ${scenario.era}` : 'My Network';
    const ok = await exportNetworkCard({ cityLabel, ui });
    pushToast(ok ? 'Network card saved' : 'Could not capture the map yet', ok ? 'good' : 'warn');
  };

  const dayLabel =
    ui.maxDay != null ? `${ui.day}/${ui.maxDay}` : String(ui.day);
  const dayTone =
    ui.maxDay != null && ui.day / ui.maxDay > 0.85 ? 'text-rose-400' : 'text-zinc-300';
  const scProgress = scenario ? Math.min(1, scenario.progress(ui)) : 0;

  return (
    <>
      <div className="absolute top-0 left-0 right-0 bg-zinc-950/85 backdrop-blur-md border-b border-zinc-800/80 z-20 select-none">
        <div className="flex items-center gap-1 px-2 sm:px-4 h-11 overflow-x-auto scrollbar-none">
          <button
            onClick={() => {
              if (confirm('Return to the start screen? Save first if you want to keep this city.')) {
                useStore.setState({ started: false });
              }
            }}
            title="Home — back to start"
            className="shrink-0 mr-1 px-2 py-1 rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 10.5 12 3l9 7.5" />
              <path d="M5 9.5V21h14V9.5" />
            </svg>
          </button>
          <span className="hidden sm:flex items-center mr-2"><Wordmark size={16} /></span>
          {ui.eraLabel && (
            <span className="hidden sm:inline text-[10px] uppercase tracking-widest text-amber-400/80 mr-2 font-semibold">
              {ui.eraLabel}
            </span>
          )}
          <Stat
            icon={<CoinsIcon size={14} />}
            value={`${fmtMoney(ui.cash)} · ${net >= 0 ? '+' : ''}${fmtMoney(net)}/d`}
            title="Treasury and net daily result — tap for the budget"
            onClick={() => setPanel('budget')}
            className={cashColor}
          />
          <Stat
            icon={<span className="text-zinc-500 font-semibold">D</span>}
            value={`${dayLabel} · ${clockOf(ui.tick)}`}
            title={ui.maxDay != null ? `Day ${ui.day} of ${ui.maxDay}` : 'Game day and time of day'}
            className={dayTone}
          />
          {scenario && (
            <Stat
              icon={<span className="text-amber-400/80 font-semibold">◎</span>}
              value={scenario.readout(ui)}
              title={scenario.goal}
              className="hidden md:flex text-amber-200/90"
            />
          )}
          <Stat icon={<PeopleIcon size={14} />} value={Math.round(ui.population).toLocaleString()} title="City population" />
          <Stat icon={<ThumbIcon size={14} />} value={`${ui.approval.toFixed(0)}%`} title="Approval rating — drives your subsidy" />
          <Stat icon={<ShareIcon size={14} />} value={`${(ui.transitShare * 100).toFixed(1)}%`} title="Transit mode share" className="hidden sm:flex text-zinc-300" />
          <Stat icon={<PinIcon size={14} />} value={`${(ui.coverage * 100).toFixed(0)}%`} title="Population within walking distance of a station" className="hidden sm:flex text-zinc-300" />
          {scenario && (
            <div className="hidden lg:flex items-center ml-1 mr-1 w-24 h-1.5 rounded-full bg-zinc-800 overflow-hidden" title={scenario.goal}>
              <div className="h-full bg-amber-400 transition-all" style={{ width: `${scProgress * 100}%` }} />
            </div>
          )}
          <div className="ml-auto flex items-center gap-0.5 pl-2">
            <span
              className="hidden md:inline text-[10px] font-mono tabular-nums text-zinc-500 mr-1 px-1.5 py-0.5 rounded border border-zinc-800"
              title="Zoom level (+/− to change, Home to recenter, 0 to fit)"
            >
              {zoomPct}%
            </span>
            <div className="hidden sm:flex rounded-lg overflow-hidden border border-zinc-800 mr-2" title="Map overlays">
              {OVERLAY_OPTIONS.map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => setOverlay(m)}
                  className={`px-2 py-1 text-xs font-semibold ${
                    overlay === m ? 'bg-sky-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setPanel(panel === 'budget' ? 'none' : 'budget')}
              title="Finances (F)"
              aria-label="Finances"
              className={`mr-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-zinc-800 flex items-center gap-1.5 ${
                panel === 'budget' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-300 hover:text-zinc-100'
              }`}
            >
              <BudgetIcon size={13} />
              <span className="hidden sm:inline">Finances</span>
            </button>
            <button
              onClick={() => setPanel('routes')}
              title="Lines"
              aria-label="Lines"
              className="mr-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-zinc-100 hidden sm:flex items-center gap-1.5"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8 6h6a4 4 0 0 1 4 4v6"/></svg>
              Lines
            </button>
            <button
              onClick={() => setPanel('goals')}
              title={scenario ? scenario.goal : 'Objectives'}
              aria-label="Objectives"
              className="mr-2 px-2.5 py-1 rounded-lg text-xs font-semibold border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-zinc-100 flex items-center gap-1.5"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/></svg>
              <span className="tabular-nums">
                {scenario
                  ? (runStars > 0 ? `${'★'.repeat(runStars)}` : `${Math.round(scProgress * 100)}%`)
                  : `${completedGoals}/${totalGoals}`}
              </span>
            </button>
            <div className="flex rounded-lg overflow-hidden border border-zinc-800 items-stretch">
              {[0, 1, 10, 60].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  title={s === 0 ? 'Pause (Space)' : `${s}× speed`}
                  className={`px-2.5 py-1 text-xs font-semibold flex items-center justify-center ${
                    speed === s ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {s === 0 ? <PauseIcon size={12} /> : `${s}×`}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                unlockAudio();
                setMutedUi(toggleMute());
                syncMuteFromAudio();
              }}
              title={muted ? 'Unmute' : 'Mute'}
              className="ml-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100"
            >
              {muted ? 'Unmute' : 'Mute'}
            </button>
            <button
              onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')}
              title="Settings (,)"
              aria-label="Settings"
              className={`ml-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-zinc-800 flex items-center gap-1.5 ${
                panel === 'settings' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <SettingsIcon size={13} />
              <span className="hidden sm:inline">Settings</span>
            </button>
            <button
              onClick={() => setShortcutsOpen(!shortcutsOpen)}
              title="Keyboard shortcuts (?)"
              aria-label="Help"
              className="ml-1 px-2 py-1 rounded-lg text-xs font-semibold border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100"
            >
              <HelpIcon size={13} />
            </button>
            <button
              onClick={() => void share()}
              title="Share a network card"
              className="ml-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100"
            >
              Share
            </button>
            <button
              onClick={() => client.requestSave()}
              className="ml-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100"
            >
              Save
            </button>
          </div>
        </div>
        {/* Mobile layer switcher — the desktop overlay row is hidden on small screens */}
        <div className="sm:hidden flex items-center gap-1 px-2 pb-1.5 overflow-x-auto scrollbar-none">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500 pr-1 shrink-0">Layers</span>
          {OVERLAY_OPTIONS.map(([m, label]) => (
            <button
              key={m}
              onClick={() => setOverlay(m)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold shrink-0 ${
                overlay === m ? 'bg-sky-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setPanel(panel === 'budget' ? 'none' : 'budget')}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold shrink-0 ${
              panel === 'budget' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400'
            }`}
          >
            Finances
          </button>
          <button
            onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold shrink-0 ${
              panel === 'settings' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400'
            }`}
          >
            Settings
          </button>
        </div>
      </div>

      {speed === 0 && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-950/90 border border-amber-500/50 text-amber-300 text-xs font-semibold shadow-lg">
            <PauseIcon size={12} />
            Paused
            <span className="text-zinc-500 font-normal">· Space to resume</span>
          </div>
        </div>
      )}
    </>
  );
}

/** Transient keyboard shortcut overlay (toggled with ?). */
export function ShortcutsOverlay(): React.JSX.Element | null {
  const open = useStore((s) => s.shortcutsOpen);
  const setOpen = useStore((s) => s.setShortcutsOpen);
  if (!open) return null;
  const rows: [string, string][] = [
    ['1–4', 'Mode (bus / tram / metro / rail)'],
    ['S / T / R / B', 'Station / Track / Route / Bulldoze'],
    ['Space', 'Pause / resume'],
    ['+ / −', 'Zoom in / out'],
    ['Home', 'Recenter on network'],
    ['0', 'Zoom to fit city'],
    ['F', 'Finances'],
    [',', 'Settings'],
    ['Enter', 'Finish route'],
    ['Esc', 'Cancel / select'],
    ['?', 'This help'],
  ];
  return (
    <div
      className="absolute inset-0 z-40 bg-zinc-950/70 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-950/95 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg text-zinc-100">Keyboard</h2>
          <button
            className="text-zinc-500 hover:text-zinc-200 text-sm"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
        <div className="space-y-1.5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center gap-3 text-sm">
              <kbd className="shrink-0 min-w-[5.5rem] text-center px-2 py-1 rounded-md bg-zinc-900 border border-zinc-700 text-[11px] font-mono text-amber-200/90">
                {k}
              </kbd>
              <span className="text-zinc-400">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Large mid-screen banners when free-play goals complete. */
export function GoalBanners(): React.JSX.Element | null {
  const banners = useStore((s) => s.goalBanners);
  const dismiss = useStore((s) => s.dismissGoalBanner);
  if (banners.length === 0) return null;
  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 flex flex-col gap-2 w-[min(92vw,22rem)] pointer-events-auto">
      {banners.map((b) => (
        <button
          key={b.id}
          onClick={() => dismiss(b.id)}
          className="text-left rounded-xl border border-emerald-500/50 bg-emerald-950/90 backdrop-blur px-4 py-3 shadow-xl animate-[tutIn_280ms_ease-out]"
        >
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-400/90 font-semibold">Goal complete</div>
          <div className="text-sm text-emerald-100 font-medium mt-0.5">{b.label}</div>
        </button>
      ))}
    </div>
  );
}
