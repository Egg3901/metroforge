import { MODES } from '@core/constants';
import { useStore } from './store';
import { GOALS } from './goals';

const fmt = (v: number): string => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${(v / 1e3).toFixed(1)}K`);

/** A vehicle every Xm Ys, from headway seconds. */
function fmtHeadway(sec: number): string {
  if (!sec || sec >= 1800) return 'rarely';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `every ${m}m${s ? ` ${s}s` : ''}` : `every ${s}s`;
}

/** Crowding → label + color, keyed to the sim's CROWD_KNEE (0.8) / over-capacity (1.0). */
function crowdInfo(c: number): { label: string; color: string; pct: number } {
  const pct = Math.min(1, c);
  if (c >= 1) return { label: 'Overcrowded', color: '#ff453a', pct };
  if (c >= 0.8) return { label: 'Crowded', color: '#ff9f0a', pct };
  if (c >= 0.5) return { label: 'Busy', color: '#ffd60a', pct };
  if (c > 0) return { label: 'Comfortable', color: '#30d158', pct };
  return { label: 'No riders', color: '#48484a', pct: 0 };
}

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

export function GoalsPanel(): React.JSX.Element | null {
  const ui = useStore((s) => s.ui);
  const completed = useStore((s) => s.completedGoals);
  if (!ui) return null;
  const doneCount = completed.length;
  return (
    <PanelShell title={`Objectives · ${doneCount}/${GOALS.length}`}>
      <div className="space-y-2.5">
        {GOALS.map((g) => {
          const p = Math.max(0, Math.min(1, g.progress(ui)));
          const done = p >= 1;
          const r = g.readout(ui);
          return (
            <div key={g.id} className={`rounded-lg border p-2.5 ${done ? 'border-emerald-600/60 bg-emerald-950/30' : 'border-zinc-800 bg-zinc-900/40'}`}>
              <div className="flex items-center gap-2">
                <span className={`grid place-items-center w-4 h-4 rounded-full text-[10px] ${done ? 'bg-emerald-500 text-zinc-950' : 'border border-zinc-600 text-transparent'}`}>✓</span>
                <span className={`text-sm font-medium ${done ? 'text-emerald-300' : 'text-zinc-100'}`}>{g.label}</span>
                <span className="ml-auto text-[11px] tabular-nums text-zinc-400">{r.value} / {r.target}</span>
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5 mb-1.5 pl-6">{g.hint}</div>
              <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div className={`h-full rounded-full ${done ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${p * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </PanelShell>
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
        {(() => {
          const crowd = Math.max(0, Math.min(1, station.ridership / 2600));
          const label = crowd > 0.8 ? 'Crowded' : crowd > 0.5 ? 'Busy' : crowd > 0.2 ? 'Steady' : 'Quiet';
          const tone = crowd > 0.8 ? 'text-rose-400' : crowd > 0.5 ? 'text-amber-400' : 'text-emerald-400';
          return (
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-zinc-400 text-xs">Daily boardings</span>
                <span className={`text-xs font-semibold ${tone}`}>{label}</span>
              </div>
              <div className="text-zinc-100 font-mono text-lg">{Math.round(station.ridership).toLocaleString()}</div>
              <div className="h-1.5 mt-1 rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${crowd * 100}%`, background: crowd > 0.8 ? '#fb7185' : crowd > 0.5 ? '#fbbf24' : '#34d399' }} />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                <div className="bg-zinc-800/60 rounded p-1.5">
                  <div className="text-zinc-500">Boarding here</div>
                  <div className="text-sky-300 font-mono">{Math.round(station.ridership).toLocaleString()}/day</div>
                </div>
                <div className="bg-zinc-800/60 rounded p-1.5">
                  <div className="text-zinc-500">Arriving here</div>
                  <div className="text-violet-300 font-mono">{Math.round(station.alightings).toLocaleString()}/day</div>
                </div>
              </div>
            </div>
          );
        })()}
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

export function RoutesPanel(): React.JSX.Element | null {
  const ui = useStore((s) => s.ui);
  const select = useStore((s) => s.select);
  if (!ui) return null;
  const routes = ui.routes;
  const totRiders = routes.reduce((a, r) => a + r.dailyRidership, 0);
  const totRevenue = routes.reduce((a, r) => a + r.dailyRevenue, 0);
  const totKm = routes.reduce((a, r) => a + r.lengthMeters / 1000, 0);
  return (
    <PanelShell title={`Lines · ${routes.length}`}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[['Riders/day', Math.round(totRiders).toLocaleString()], ['Fares/day', fmt(totRevenue)], ['Network', `${totKm.toFixed(1)} km`]].map(([l, v]) => (
            <div key={l} className="bg-zinc-900/60 rounded-lg py-2">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">{l}</div>
              <div className="text-sm font-mono text-zinc-100">{v}</div>
            </div>
          ))}
        </div>
        {routes.length === 0 && <div className="text-zinc-600 text-xs py-3 text-center">No lines yet. Place stations, lay track, then create a route.</div>}
        <div className="space-y-1">
          {routes.map((r) => (
            <button key={r.id} onClick={() => select('route', r.id)}
              className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-zinc-800/70 text-left">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: r.color }} />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-zinc-100 truncate">{r.name}</div>
                <div className="text-[11px] text-zinc-500">{MODES[r.mode].label} · {r.stationIds.length} stops · {(r.lengthMeters / 1000).toFixed(1)} km</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-mono text-zinc-200">{Math.round(r.dailyRidership).toLocaleString()}</div>
                <div className="text-[11px] font-mono text-emerald-400/90">{fmt(r.dailyRevenue)}</div>
              </div>
              <span
                className="w-1.5 h-8 rounded-full shrink-0"
                title={`${crowdInfo(r.crowding).label} · ${Math.round(r.crowding * 100)}%`}
                style={{ background: crowdInfo(r.crowding).color }}
              />
            </button>
          ))}
        </div>
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
        {(() => {
          const ci = crowdInfo(route.crowding);
          return (
            <div className="bg-zinc-800/60 rounded p-2 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-zinc-500">Crowding</span>
                <span className="font-mono" style={{ color: ci.color }}>{ci.label} · {Math.round(route.crowding * 100)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-700 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${ci.pct * 100}%`, background: ci.color }} />
              </div>
              <div className="text-[11px] text-zinc-500">
                Peak {Math.round(route.load).toLocaleString()} / {Math.round(route.capacity).toLocaleString()} pax per hour
              </div>
            </div>
          );
        })()}
        <label className="block text-xs">
          <div className="flex justify-between">
            <span>Vehicles: <span className="text-zinc-100">{route.vehicleCount}</span></span>
            <span className="text-sky-300/90">arrives {fmtHeadway(route.headwaySeconds)}</span>
          </div>
          <span className="text-zinc-500">{fmt(cfg.vehicleCost)} each, {cfg.vehicleCapacity} pax. More vehicles come more often.</span>
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
  const costs = d.operations + d.maintenance;
  const recovery = costs > 0 ? d.fares / costs : 0;
  return (
    <PanelShell title="Finances">
      <div className="space-y-3 text-zinc-300">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-zinc-900/60 rounded-lg py-2">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Cash</div>
            <div className={`text-sm font-mono ${ui.cash < 0 ? 'text-red-400' : 'text-emerald-300'}`}>{fmt(ui.cash)}</div>
          </div>
          <div className="bg-zinc-900/60 rounded-lg py-2">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Net / day</div>
            <div className={`text-sm font-mono ${net >= 0 ? 'text-emerald-300' : 'text-red-400'}`}>{fmt(net)}</div>
          </div>
          <div className="bg-zinc-900/60 rounded-lg py-2">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Farebox</div>
            <div className={`text-sm font-mono ${recovery >= 1 ? 'text-emerald-300' : 'text-zinc-200'}`}>{Math.round(recovery * 100)}%</div>
          </div>
        </div>
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
