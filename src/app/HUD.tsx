import { useStore } from './store';

const fmtMoney = (v: number): string => {
  const abs = Math.abs(v);
  const s = abs >= 1e6 ? `$${(abs / 1e6).toFixed(2)}M` : abs >= 1e3 ? `$${(abs / 1e3).toFixed(0)}K` : `$${abs.toFixed(0)}`;
  return v < 0 ? `-${s}` : s;
};

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
    <div className="absolute top-0 left-0 right-0 h-12 bg-zinc-900/90 backdrop-blur border-b border-zinc-800 flex items-center gap-5 px-4 text-sm z-20 select-none">
      <span className="font-semibold tracking-wide text-zinc-300">MetroForge</span>
      <button className={`${cashColor} font-mono hover:underline`} onClick={() => setPanel('budget')} title="Open budget">
        {fmtMoney(ui.cash)}
        <span className="text-zinc-500 ml-1 text-xs">({net >= 0 ? '+' : ''}{fmtMoney(net)}/day)</span>
      </button>
      <span className="text-zinc-300">Day {ui.day}</span>
      <span className="text-zinc-300">👥 {Math.round(ui.population).toLocaleString()}</span>
      <span className="text-zinc-300" title="Approval rating">☺ {ui.approval.toFixed(0)}%</span>
      <span className="text-zinc-300" title="Transit mode share">🚌 {(ui.transitShare * 100).toFixed(1)}%</span>
      <span className="text-zinc-300" title="Population within walking distance of a station">📍 {(ui.coverage * 100).toFixed(0)}% covered</span>
      <div className="ml-auto flex items-center gap-1">
        {[0, 1, 10, 60].map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={`px-2 py-1 rounded text-xs ${speed === s ? 'bg-amber-500 text-zinc-950 font-bold' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
          >
            {s === 0 ? '⏸' : `${s}×`}
          </button>
        ))}
        <button
          onClick={() => client.requestSave()}
          className="ml-3 px-2 py-1 rounded text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
        >
          Save
        </button>
      </div>
    </div>
  );
}
