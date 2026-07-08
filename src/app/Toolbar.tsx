import { MODES } from '@core/constants';
import type { TransitMode } from '@core/types';
import { BulldozeIcon, BusIcon, MetroIcon, RailIcon, RouteIcon, SelectIcon, StationIcon, TrackIcon, TramIcon } from './icons';
import type { Tool } from './store';
import { useStore } from './store';

const MODE_ICON: Record<TransitMode, (p: { size?: number }) => React.JSX.Element> = {
  bus: BusIcon,
  tram: TramIcon,
  metro: MetroIcon,
  rail: RailIcon,
};
const MODE_TINT: Record<TransitMode, string> = {
  bus: 'text-amber-300',
  tram: 'text-sky-300',
  metro: 'text-rose-300',
  rail: 'text-emerald-300',
};
const TOOLS: { id: Tool; label: string; key: string; icon: (p: { size?: number }) => React.JSX.Element }[] = [
  { id: 'select', label: 'Select', key: 'Esc', icon: SelectIcon },
  { id: 'station', label: 'Station', key: 'S', icon: StationIcon },
  { id: 'track', label: 'Track', key: 'T', icon: TrackIcon },
  { id: 'route', label: 'Route', key: 'R', icon: RouteIcon },
  { id: 'bulldoze', label: 'Bulldoze', key: 'B', icon: BulldozeIcon },
];

function HintCard(): React.JSX.Element | null {
  const tool = useStore((s) => s.tool);
  const mode = useStore((s) => s.mode);
  const trackFrom = useStore((s) => s.trackFrom);
  const trackCostEstimate = useStore((s) => s.trackCostEstimate);
  const routeStops = useStore((s) => s.routeStops);
  if (tool === 'station') {
    return (
      <div className="text-xs text-zinc-400 leading-relaxed">
        Tap the map to place a <span className="text-zinc-200">{MODES[mode].label}</span> station —
        <span className="text-amber-300"> ${(MODES[mode].stationCost / 1000).toFixed(0)}K</span>.
        Build where the city glows: density is ridership.
      </div>
    );
  }
  if (tool === 'track') {
    return (
      <div className="text-xs text-zinc-400 leading-relaxed">
        {trackFrom === null ? `Tap a ${MODES[mode].label} station to start.` : 'Tap waypoints, then the destination station.'}
        {trackCostEstimate !== null && <span className="block text-amber-300 mt-0.5">Est. ${(trackCostEstimate / 1e6).toFixed(2)}M</span>}
      </div>
    );
  }
  if (tool === 'route') {
    return (
      <div className="text-xs text-zinc-400 leading-relaxed">
        Tap stations in order ({routeStops.length} picked). Re-tap the last stop to launch. Stops need track between them.
      </div>
    );
  }
  if (tool === 'bulldoze') {
    return <div className="text-xs text-zinc-400">Tap a station or track to demolish (25% refund).</div>;
  }
  return null;
}

export function Toolbar(): React.JSX.Element | null {
  const ui = useStore((s) => s.ui);
  const tool = useStore((s) => s.tool);
  const mode = useStore((s) => s.mode);
  const setTool = useStore((s) => s.setTool);
  const setMode = useStore((s) => s.setMode);
  const select = useStore((s) => s.select);
  if (!ui) return null;

  const modeButtons = (compact: boolean): React.JSX.Element[] =>
    (Object.keys(MODES) as TransitMode[]).map((m) => {
      const unlocked = ui.unlockedModes.includes(m);
      const Icon = MODE_ICON[m];
      const active = mode === m;
      return (
        <button
          key={m}
          disabled={!unlocked}
          onClick={() => setMode(m)}
          title={unlocked ? MODES[m].label : `Unlocks at ${(MODES[m].unlockPopulation / 1000).toFixed(0)}k population`}
          className={`flex items-center justify-center gap-1.5 rounded-lg transition-colors ${compact ? 'p-2.5' : 'px-2 py-2 flex-1'} ${
            active
              ? 'bg-zinc-800 ring-1 ring-amber-400/70 ' + MODE_TINT[m]
              : unlocked
                ? 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200'
                : 'text-zinc-700'
          }`}
        >
          <Icon size={compact ? 20 : 16} />
          {!compact && <span className="text-xs font-medium">{MODES[m].label.split(' ')[0]}</span>}
        </button>
      );
    });

  const toolButtons = (compact: boolean): React.JSX.Element[] =>
    TOOLS.map((t) => {
      const Icon = t.icon;
      const active = tool === t.id;
      return (
        <button
          key={t.id}
          onClick={() => setTool(t.id)}
          title={`${t.label} (${t.key})`}
          className={`flex items-center gap-2 rounded-lg transition-colors ${compact ? 'p-2.5 justify-center' : 'px-2.5 py-2 w-full'} ${
            active ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200'
          }`}
        >
          <Icon size={compact ? 20 : 16} />
          {!compact && <span className="text-xs font-medium flex-1 text-left">{t.label}</span>}
          {!compact && <span className={`text-[10px] ${active ? 'text-zinc-800' : 'text-zinc-600'}`}>{t.key}</span>}
        </button>
      );
    });

  return (
    <>
      {/* Desktop: left rail */}
      <div className="hidden md:flex absolute left-3 top-14 w-52 flex-col gap-3 z-10 select-none">
        <div className="bg-zinc-950/85 backdrop-blur-md border border-zinc-800/80 rounded-xl p-2 grid grid-cols-2 gap-1">{modeButtons(false)}</div>
        <div className="bg-zinc-950/85 backdrop-blur-md border border-zinc-800/80 rounded-xl p-2 flex flex-col gap-0.5">
          {toolButtons(false)}
          <div className="px-1 pt-1.5 empty:hidden">
            <HintCard />
          </div>
        </div>
        {ui.routes.length > 0 && (
          <div className="bg-zinc-950/85 backdrop-blur-md border border-zinc-800/80 rounded-xl p-2 max-h-56 overflow-y-auto">
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest px-1 pb-1">Lines</div>
            {ui.routes.map((r) => (
              <button
                key={r.id}
                onClick={() => select('route', r.id)}
                className="w-full px-1.5 py-1.5 rounded-lg text-xs text-left hover:bg-zinc-800/70 flex items-center gap-2"
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />
                <span className="text-zinc-200 truncate">{r.name}</span>
                <span className="ml-auto text-zinc-500 tabular-nums">{Math.round(r.dailyRidership).toLocaleString()}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mobile: bottom bars */}
      <div className="md:hidden absolute bottom-0 inset-x-0 z-10 select-none pb-[env(safe-area-inset-bottom)]">
        <div className="mx-2 mb-1 empty:hidden rounded-lg bg-zinc-950/90 backdrop-blur px-3 py-1.5 border border-zinc-800/80">
          <HintCard />
        </div>
        <div className="bg-zinc-950/90 backdrop-blur-md border-t border-zinc-800/80 px-2 py-1.5 flex items-center justify-between gap-1">
          <div className="flex gap-0.5">{modeButtons(true)}</div>
          <div className="w-px h-8 bg-zinc-800" />
          <div className="flex gap-0.5">{toolButtons(true)}</div>
        </div>
      </div>
    </>
  );
}
