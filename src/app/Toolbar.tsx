import { MODES } from '@core/constants';
import type { TransitMode } from '@core/types';
import type { Tool } from './store';
import { useStore } from './store';

const MODE_ICON: Record<TransitMode, string> = { bus: '🚌', tram: '🚊', metro: '🚇', rail: '🚆' };
const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'select', label: 'Select', key: 'Esc' },
  { id: 'station', label: 'Station', key: 'S' },
  { id: 'track', label: 'Track', key: 'T' },
  { id: 'route', label: 'Route', key: 'R' },
  { id: 'bulldoze', label: 'Bulldoze', key: 'B' },
];

export function Toolbar(): React.JSX.Element | null {
  const ui = useStore((s) => s.ui);
  const tool = useStore((s) => s.tool);
  const mode = useStore((s) => s.mode);
  const setTool = useStore((s) => s.setTool);
  const setMode = useStore((s) => s.setMode);
  const trackCostEstimate = useStore((s) => s.trackCostEstimate);
  const routeStops = useStore((s) => s.routeStops);
  const trackFrom = useStore((s) => s.trackFrom);
  const select = useStore((s) => s.select);
  if (!ui) return null;

  return (
    <div className="absolute left-0 top-12 bottom-0 w-56 bg-zinc-900/90 backdrop-blur border-r border-zinc-800 p-3 flex flex-col gap-3 z-10 overflow-y-auto select-none">
      <div>
        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Mode</div>
        <div className="grid grid-cols-2 gap-1">
          {(Object.keys(MODES) as TransitMode[]).map((m, i) => {
            const unlocked = ui.unlockedModes.includes(m);
            return (
              <button
                key={m}
                disabled={!unlocked}
                onClick={() => setMode(m)}
                title={unlocked ? `${MODES[m].label} (${i + 1})` : `Unlocks at ${(MODES[m].unlockPopulation / 1000).toFixed(0)}k population`}
                className={`px-2 py-1.5 rounded text-xs flex items-center gap-1 ${
                  mode === m ? 'bg-amber-500 text-zinc-950 font-bold' : unlocked ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' : 'bg-zinc-800/40 text-zinc-600'
                }`}
              >
                {MODE_ICON[m]} {MODES[m].label.split(' ')[0]} {!unlocked && '🔒'}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Tools</div>
        <div className="flex flex-col gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              className={`px-2 py-1.5 rounded text-xs text-left flex justify-between ${
                tool === t.id ? 'bg-amber-500 text-zinc-950 font-bold' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
              }`}
            >
              <span>{t.label}</span>
              <span className="opacity-50">{t.key}</span>
            </button>
          ))}
        </div>
      </div>

      {tool === 'station' && (
        <div className="text-xs text-zinc-400 bg-zinc-800/60 rounded p-2">
          Click the map to place a {MODES[mode].label} station.
          <div className="mt-1 text-zinc-300">Cost: ${(MODES[mode].stationCost / 1000).toFixed(0)}K</div>
          <div className="text-zinc-500">Ideal spacing {MODES[mode].stationSpacing[0]}–{MODES[mode].stationSpacing[1]}m</div>
        </div>
      )}
      {tool === 'track' && (
        <div className="text-xs text-zinc-400 bg-zinc-800/60 rounded p-2">
          {trackFrom === null
            ? `Click a ${MODES[mode].label} station to start.`
            : 'Click waypoints, then the destination station. Right-click cancels.'}
          {trackCostEstimate !== null && (
            <div className="mt-1 text-amber-300">Est. ${(trackCostEstimate / 1e6).toFixed(2)}M</div>
          )}
        </div>
      )}
      {tool === 'route' && (
        <div className="text-xs text-zinc-400 bg-zinc-800/60 rounded p-2">
          Click stations in order ({routeStops.length} so far). Press Enter or re-click the last stop to finish. Needs track between stops.
        </div>
      )}

      <div className="mt-auto">
        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Routes</div>
        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
          {ui.routes.length === 0 && <div className="text-xs text-zinc-600">No routes yet</div>}
          {ui.routes.map((r) => (
            <button
              key={r.id}
              onClick={() => select('route', r.id)}
              className="px-2 py-1 rounded text-xs text-left bg-zinc-800 hover:bg-zinc-700 flex items-center gap-2"
            >
              <span className="w-3 h-3 rounded-full inline-block" style={{ background: r.color }} />
              <span className="text-zinc-200 truncate">{r.name}</span>
              <span className="ml-auto text-zinc-500">{Math.round(r.dailyRidership).toLocaleString()}/d</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
