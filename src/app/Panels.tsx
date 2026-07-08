import { MODES } from '@core/constants';
import { useStore } from './store';

const fmt = (v: number): string => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${(v / 1e3).toFixed(1)}K`);

function PanelShell({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  const setPanel = useStore((s) => s.setPanel);
  const select = useStore((s) => s.select);
  return (
    <div
      className="absolute z-20 bg-zinc-950/95 backdrop-blur-md border-zinc-800/80 text-sm overflow-y-auto
        max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[55%] max-md:rounded-t-2xl max-md:border-t max-md:pb-[env(safe-area-inset-bottom)]
        md:right-3 md:top-14 md:bottom-3 md:w-80 md:rounded-xl md:border"
    >
      <div className="md:hidden flex justify-center pt-2">
        <div className="w-9 h-1 rounded-full bg-zinc-700" />
      </div>
      <div className="p-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-zinc-100">{title}</h2>
          <button
            className="w-7 h-7 grid place-items-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
            onClick={() => {
              setPanel('none');
              select(null, null);
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StationPanel(): React.JSX.Element | null {
  const ui = useStore((s) => s.ui);
  const id = useStore((s) => s.selectedStationId);
  const client = useStore((s) => s.client);
  const pushToast = useStore((s) => s.pushToast);
  const station = ui?.stations.find((s) => s.id === id);
  if (!ui || !station) return null;
  const routes = ui.routes.filter((r) => r.stationIds.includes(station.id));
  const upgradeCost = MODES[station.mode].stationCost * 0.5 * station.level;
  return (
    <PanelShell title={station.name}>
      <div className="space-y-3 text-zinc-300">
        <div className="flex gap-2 items-center">
          <span className="px-2 py-0.5 rounded bg-zinc-800 text-xs">{MODES[station.mode].label}</span>
          <span className="px-2 py-0.5 rounded bg-zinc-800 text-xs">Level {station.level}/5</span>
        </div>
        <div>
          Daily boardings: <span className="text-zinc-100 font-mono">{Math.round(station.ridership).toLocaleString()}</span>
        </div>
        <div>
          <div className="text-xs text-zinc-500 uppercase mb-1">Routes serving</div>
          {routes.length === 0 && <div className="text-zinc-600 text-xs">None — connect it with a track and route</div>}
          {routes.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-xs py-0.5">
              <span className="w-3 h-3 rounded-full" style={{ background: r.color }} />
              {r.name}
            </div>
          ))}
        </div>
        <button
          className="w-full py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs disabled:opacity-40"
          disabled={station.level >= 5}
          onClick={() =>
            void client.command({ kind: 'upgradeStation', stationId: station.id }).then((r) => {
              if (!r.ok && r.error) pushToast(r.error, 'warn');
            })
          }
        >
          Upgrade ({fmt(upgradeCost)}) — bigger growth halo
        </button>
      </div>
    </PanelShell>
  );
}

export function RoutePanel(): React.JSX.Element | null {
  const ui = useStore((s) => s.ui);
  const id = useStore((s) => s.selectedRouteId);
  const client = useStore((s) => s.client);
  const pushToast = useStore((s) => s.pushToast);
  const route = ui?.routes.find((r) => r.id === id);
  if (!ui || !route) return null;
  const cfg = MODES[route.mode];
  const edit = (patch: Partial<{ headwaySeconds: number; fare: number; vehicleCount: number }>): void => {
    void client.command({ kind: 'editRoute', routeId: route.id, ...patch }).then((r) => {
      if (!r.ok && r.error) pushToast(r.error, 'warn');
    });
  };
  return (
    <PanelShell title={route.name}>
      <div className="space-y-4 text-zinc-300">
        <div className="flex gap-2 items-center">
          <span className="w-4 h-4 rounded-full" style={{ background: route.color }} />
          <span className="px-2 py-0.5 rounded bg-zinc-800 text-xs">{cfg.label}</span>
          <span className="text-xs text-zinc-500">{(route.lengthMeters / 1000).toFixed(1)} km · {route.stationIds.length} stops</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-zinc-800/60 rounded p-2">
            <div className="text-zinc-500">Ridership</div>
            <div className="text-zinc-100 font-mono">{Math.round(route.dailyRidership).toLocaleString()}/day</div>
          </div>
          <div className="bg-zinc-800/60 rounded p-2">
            <div className="text-zinc-500">Fare revenue</div>
            <div className="text-emerald-300 font-mono">{fmt(route.dailyRevenue)}/day</div>
          </div>
        </div>
        <label className="block text-xs">
          Vehicles: <span className="text-zinc-100">{route.vehicleCount}</span>
          <span className="text-zinc-500"> ({fmt(cfg.vehicleCost)} each, {cfg.vehicleCapacity} pax)</span>
          <input
            type="range"
            min={0}
            max={20}
            value={route.vehicleCount}
            className="w-full accent-amber-400"
            onChange={(e) => edit({ vehicleCount: Number(e.target.value) })}
          />
        </label>
        <label className="block text-xs">
          Fare: <span className="text-zinc-100">${route.fare.toFixed(2)}</span>
          <input
            type="range"
            min={0}
            max={8}
            step={0.25}
            value={route.fare}
            className="w-full accent-amber-400"
            onChange={(e) => edit({ fare: Number(e.target.value) })}
          />
        </label>
        <button
          className="w-full py-1.5 rounded bg-red-900/50 hover:bg-red-900 text-red-200 text-xs"
          onClick={() => {
            void client.command({ kind: 'deleteRoute', routeId: route.id });
            useStore.getState().select(null, null);
          }}
        >
          Delete route (40% vehicle resale)
        </button>
      </div>
    </PanelShell>
  );
}

export function BudgetPanel(): React.JSX.Element | null {
  const ui = useStore((s) => s.ui);
  const client = useStore((s) => s.client);
  if (!ui) return null;
  const d = ui.lastDay;
  const rows: [string, number, boolean][] = [
    ['Fares', d.fares, true],
    ['Subsidy', d.subsidy, true],
    ['Operations', -d.operations, false],
    ['Maintenance', -d.maintenance, false],
    ['Loan interest', -d.interest, false],
  ];
  const net = rows.reduce((a, [, v]) => a + v, 0);
  return (
    <PanelShell title="Budget">
      <div className="space-y-3 text-zinc-300">
        <table className="w-full text-xs">
          <tbody>
            {rows.map(([label, v]) => (
              <tr key={label} className="border-b border-zinc-800/60">
                <td className="py-1">{label}</td>
                <td className={`py-1 text-right font-mono ${v >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{fmt(v)}</td>
              </tr>
            ))}
            <tr>
              <td className="py-1 font-semibold">Net / day</td>
              <td className={`py-1 text-right font-mono font-semibold ${net >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{fmt(net)}</td>
            </tr>
          </tbody>
        </table>
        <div className="text-xs">
          Loan balance: <span className="font-mono text-zinc-100">{fmt(ui.loanBalance)}</span> @ 8%/yr
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            className="py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs"
            onClick={() => void client.command({ kind: 'takeLoan', amount: 5_000_000 })}
          >
            Borrow $5M
          </button>
          <button
            className="py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs disabled:opacity-40"
            disabled={ui.loanBalance <= 0}
            onClick={() => void client.command({ kind: 'repayLoan', amount: 5_000_000 })}
          >
            Repay $5M
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          Subsidy scales with approval and shrinks 2% per year — the city expects the network to carry itself eventually.
          Bankruptcy at −$500K for 7 straight days.
        </p>
      </div>
    </PanelShell>
  );
}
