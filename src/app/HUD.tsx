import { CoinsIcon, PeopleIcon, PinIcon, ShareIcon, ThumbIcon } from './icons';
import { useStore } from './store';

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
  const client = useStore((s) => s.client);
  if (!ui) return null;

  const cashColor = ui.cash < 0 ? 'text-red-400' : ui.cash < 500_000 ? 'text-amber-400' : 'text-emerald-400';
  const net =
    ui.lastDay.fares + ui.lastDay.subsidy - ui.lastDay.operations - ui.lastDay.maintenance - ui.lastDay.interest;

  return (
    <div className="absolute top-0 left-0 right-0 bg-zinc-950/85 backdrop-blur-md border-b border-zinc-800/80 z-20 select-none">
      <div className="flex items-center gap-1 px-2 sm:px-4 h-11 overflow-x-auto scrollbar-none">
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
        <Stat icon={<span className="text-zinc-500 font-semibold">D</span>} value={String(ui.day)} title="Game day" />
        <Stat icon={<PeopleIcon size={14} />} value={Math.round(ui.population).toLocaleString()} title="City population" />
        <Stat icon={<ThumbIcon size={14} />} value={`${ui.approval.toFixed(0)}%`} title="Approval rating — drives your subsidy" />
        <Stat icon={<ShareIcon size={14} />} value={`${(ui.transitShare * 100).toFixed(1)}%`} title="Transit mode share" className="hidden sm:flex text-zinc-300" />
        <Stat icon={<PinIcon size={14} />} value={`${(ui.coverage * 100).toFixed(0)}%`} title="Population within walking distance of a station" className="hidden sm:flex text-zinc-300" />
        <div className="ml-auto flex items-center gap-0.5 pl-2">
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
    </div>
  );
}
