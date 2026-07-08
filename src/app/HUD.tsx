import { TICKS_PER_DAY } from '@core/constants';
import { CoinsIcon, PeopleIcon, PinIcon, ShareIcon, ThumbIcon } from './icons';
import { GOALS } from './goals';
import { useStore } from './store';
import type { OverlayMode } from './store';

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
  const overlay = useStore((s) => s.overlay);
  const setOverlay = useStore((s) => s.setOverlay);
  const client = useStore((s) => s.client);
  const completedGoals = useStore((s) => s.completedGoals.length);
  const totalGoals = GOALS.length;
  if (!ui) return null;

  const cashColor = ui.cash < 0 ? 'text-red-400' : ui.cash < 500_000 ? 'text-amber-400' : 'text-emerald-400';
  const net =
    ui.lastDay.fares + ui.lastDay.subsidy - ui.lastDay.operations - ui.lastDay.maintenance - ui.lastDay.interest;

  return (
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
        <span className="hidden sm:block font-bold tracking-tight text-zinc-100 mr-2">
          Metro<span className="text-amber-400">Forge</span>
        </span>
        <Stat
          icon={<CoinsIcon size={14} />}
          value={`${fmtMoney(ui.cash)} · ${net >= 0 ? '+' : ''}${fmtMoney(net)}/d`}
          title="Treasury and net daily result — tap for the budget"
          onClick={() => setPanel('budget')}
          className={cashColor}
        />
        <Stat
          icon={<span className="text-zinc-500 font-semibold">D</span>}
          value={`${ui.day} · ${clockOf(ui.tick)}`}
          title="Game day and time of day"
        />
        <Stat icon={<PeopleIcon size={14} />} value={Math.round(ui.population).toLocaleString()} title="City population" />
        <Stat icon={<ThumbIcon size={14} />} value={`${ui.approval.toFixed(0)}%`} title="Approval rating — drives your subsidy" />
        <Stat icon={<ShareIcon size={14} />} value={`${(ui.transitShare * 100).toFixed(1)}%`} title="Transit mode share" className="hidden sm:flex text-zinc-300" />
        <Stat icon={<PinIcon size={14} />} value={`${(ui.coverage * 100).toFixed(0)}%`} title="Population within walking distance of a station" className="hidden sm:flex text-zinc-300" />
        <div className="ml-auto flex items-center gap-0.5 pl-2">
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
            onClick={() => setPanel('goals')}
            title="Objectives"
            aria-label="Objectives"
            className="mr-2 px-2.5 py-1 rounded-lg text-xs font-semibold border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-zinc-100 flex items-center gap-1.5"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/></svg>
            <span className="tabular-nums">{completedGoals}/{totalGoals}</span>
          </button>
          <div className="flex rounded-lg overflow-hidden border border-zinc-800">
            {[0, 1, 10, 60].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-2.5 py-1 text-xs font-semibold ${
                  speed === s ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {s === 0 ? '❚❚' : `${s}×`}
              </button>
            ))}
          </div>
          <button
            onClick={() => client.requestSave()}
            className="ml-2 px-2.5 py-1 rounded-lg text-xs font-semibold border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100"
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
      </div>
    </div>
  );
}
