import { useEffect, useRef } from 'react';
import { GameRenderer } from '@render/renderer';
import { sfxRoute, sfxStation, sfxTrack, sfxWarn, unlockAudio } from './audio';
import { setRenderer } from './rendererBridge';
import { getSettings, subscribeSettings } from './settings';
import { useStore } from './store';

/** Mounts the Pixi renderer and wires input → commands. */
export function GameCanvas(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const hoverRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new GameRenderer();
    rendererRef.current = renderer;
    setRenderer(renderer);
    let disposed = false;

    const applyPrefs = (): void => {
      const s = getSettings();
      renderer.setPrefs({
        basemap: s.basemap,
        view: s.view,
        dayNight: s.dayNight,
        vignette: s.vignette,
        mapLabels: s.mapLabels,
        reduceMotion: s.reduceMotion,
        cameraSensitivity: s.cameraSensitivity,
      });
    };

    void renderer.init(host).then(() => {
      if (disposed) {
        renderer.destroy();
        return;
      }
      applyPrefs();
      const { client } = useStore.getState();
      client.events.onReady = (city) => renderer.setStaticCity(city);
      client.events.onFields = (payload) => renderer.setFields(payload);
      client.events.onTraffic = (payload) => renderer.setTraffic(payload);
      client.events.onDemand = (payload) => renderer.setDemand(payload);
      client.events.onFrame = (snap) => renderer.setFrame(snap);
      const prevOnUi = client.events.onUi;
      client.events.onUi = (ui) => {
        prevOnUi?.(ui);
        renderer.setUi(ui);
      };

      renderer.callbacks.onClickWorld = (x, y) => {
        unlockAudio();
        void handleClick(x, y);
      };
      renderer.callbacks.onRightClick = () => {
        useStore.getState().cancelPending();
        useStore.getState().select(null, null);
      };
      renderer.callbacks.onHoverWorld = (x, y) => {
        hoverRef.current = { x, y };
        updateGhost();
      };

      // dev-only: expose the sim client so the screenshot harness can build a
      // demo network to verify transit rendering (?dev in the URL).
      if (new URLSearchParams(location.search).has('dev')) {
        (window as unknown as { __mf?: unknown }).__mf = client;
      }
    });

    const nearestStationInfo = (
      x: number,
      y: number,
      maxDist: number,
      mode?: string,
    ): { id: number; x: number; y: number; dist: number } | null => {
      const ui = useStore.getState().ui;
      if (!ui) return null;
      let best: { id: number; x: number; y: number; dist: number } | null = null;
      for (const s of ui.stations) {
        if (mode && s.mode !== mode) continue;
        const d = Math.hypot(s.x - x, s.y - y);
        if (!best || d < best.dist) best = { id: s.id, x: s.x, y: s.y, dist: d };
      }
      if (!best || best.dist > maxDist) return null;
      return best;
    };

    const nearestStation = (x: number, y: number, maxDist: number, mode?: string): number | null =>
      nearestStationInfo(x, y, maxDist, mode)?.id ?? null;

    const updateGhost = (): void => {
      const st = useStore.getState();
      const r = rendererRef.current;
      if (!r) return;
      const h = hoverRef.current;
      const SNAP = 260;
      if (st.tool === 'station') {
        r.setGhost({ kind: 'station', points: [h], valid: true, cost: null, mode: st.mode });
      } else if (st.tool === 'track') {
        const ui = st.ui;
        const hover = nearestStationInfo(h.x, h.y, SNAP * 1.4, st.mode);
        const hoverStation = hover
          ? { x: hover.x, y: hover.y, valid: hover.dist <= SNAP }
          : null;
        if (st.trackFrom !== null) {
          const from = ui?.stations.find((s) => s.id === st.trackFrom);
          if (from) {
            const pts = [{ x: from.x, y: from.y }, ...st.trackWaypoints, h];
            r.setGhost({
              kind: 'track',
              points: pts,
              valid: true,
              cost: st.trackCostEstimate,
              mode: st.mode,
              hoverStation,
            });
            void st.client.trackCost(st.mode, st.mode === 'metro' ? 'tunnel' : 'surface', pts).then((cost) => {
              useStore.setState({ trackCostEstimate: cost });
            });
          }
        } else {
          r.setGhost({
            kind: 'track',
            points: [],
            valid: !!hoverStation?.valid,
            cost: null,
            mode: st.mode,
            hoverStation,
          });
        }
      } else if (st.tool === 'route') {
        const ui = st.ui;
        const hover = nearestStationInfo(h.x, h.y, SNAP * 1.4, st.mode);
        const hoverStation = hover
          ? { x: hover.x, y: hover.y, valid: hover.dist <= SNAP }
          : null;
        const markers =
          ui?.stations
            .filter((s) => st.routeStops.includes(s.id))
            .map((s) => ({ x: s.x, y: s.y, n: st.routeStops.indexOf(s.id) + 1 }))
            .sort((a, b) => a.n - b.n) ?? [];
        if (st.routeStops.length > 0 && ui) {
          const pts = st.routeStops
            .map((id) => ui.stations.find((s) => s.id === id))
            .filter((s): s is NonNullable<typeof s> => !!s)
            .map((s) => ({ x: s.x, y: s.y }));
          r.setGhost({
            kind: 'route',
            points: [...pts, h],
            valid: true,
            cost: null,
            mode: st.mode,
            hoverStation,
            routeMarkers: markers,
          });
        } else {
          r.setGhost({
            kind: 'route',
            points: [],
            valid: !!hoverStation?.valid,
            cost: null,
            mode: st.mode,
            hoverStation,
            routeMarkers: markers,
          });
        }
      } else {
        r.setGhost({ kind: 'none', points: [], valid: true, cost: null, mode: st.mode });
      }
    };

    const handleClick = async (x: number, y: number): Promise<void> => {
      const st = useStore.getState();
      const { client, tool, mode } = st;
      if (tool === 'station') {
        const result = await client.command({ kind: 'buildStation', mode, pos: { x, y } });
        if (!result.ok && result.error) { st.pushToast(result.error, 'warn'); sfxWarn(); }
        else sfxStation();
      } else if (tool === 'track') {
        const hit = nearestStation(x, y, 260, mode);
        if (st.trackFrom === null) {
          if (hit !== null) useStore.setState({ trackFrom: hit, trackWaypoints: [] });
          else st.pushToast(`Click a ${mode} station to start the track`, 'info');
        } else if (hit !== null && hit !== st.trackFrom) {
          const result = await client.command({
            kind: 'buildTrack',
            mode,
            grade: mode === 'metro' ? 'tunnel' : 'surface',
            fromStationId: st.trackFrom,
            toStationId: hit,
            waypoints: st.trackWaypoints,
          });
          if (!result.ok && result.error) { st.pushToast(result.error, 'warn'); sfxWarn(); }
          else sfxTrack();
          useStore.setState({ trackFrom: null, trackWaypoints: [], trackCostEstimate: null });
        } else {
          useStore.setState({ trackWaypoints: [...st.trackWaypoints, { x, y }] });
        }
      } else if (tool === 'route') {
        const hit = nearestStation(x, y, 260, mode);
        if (hit !== null) {
          const last = st.routeStops[st.routeStops.length - 1];
          if (hit === last && st.routeStops.length >= 2) {
            await finishRoute();
          } else if (hit !== last) {
            useStore.setState({ routeStops: [...st.routeStops, hit] });
          }
        }
      } else if (tool === 'bulldoze') {
        const hit = nearestStation(x, y, 200);
        if (hit !== null) {
          const result = await client.command({ kind: 'demolishStation', stationId: hit });
          if (!result.ok && result.error) st.pushToast(result.error, 'warn');
        } else {
          // nearest track segment by endpoint midpoints
          const ui = st.ui;
          if (ui) {
            let bestId: number | null = null;
            let bestD = 200;
            for (const t of ui.tracks) {
              for (let i = 0; i + 3 < t.points.length; i += 2) {
                const mx = ((t.points[i] as number) + (t.points[i + 2] as number)) / 2;
                const my = ((t.points[i + 1] as number) + (t.points[i + 3] as number)) / 2;
                const d = Math.hypot(mx - x, my - y);
                if (d < bestD) {
                  bestD = d;
                  bestId = t.id;
                }
              }
            }
            if (bestId !== null) {
              const result = await client.command({ kind: 'demolishTrack', trackId: bestId });
              if (!result.ok && result.error) st.pushToast(result.error, 'warn');
            }
          }
        }
      } else {
        // select
        const hit = nearestStation(x, y, 220);
        st.select(hit !== null ? 'station' : null, hit);
      }
      updateGhost();
    };

    const finishRoute = async (): Promise<void> => {
      const st = useStore.getState();
      if (st.routeStops.length < 2) return;
      const result = await st.client.command({ kind: 'createRoute', mode: st.mode, stationIds: st.routeStops });
      if (!result.ok && result.error) { st.pushToast(result.error, 'warn'); sfxWarn(); }
      else { st.pushToast('Route created — vehicles are rolling', 'good'); sfxRoute(); }
      useStore.setState({ routeStops: [] });
      if (result.ok && result.createdId !== undefined) st.select('route', result.createdId);
    };

    const onKey = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      const st = useStore.getState();
      const r = rendererRef.current;
      const modeKeys: Record<string, 'bus' | 'tram' | 'metro' | 'rail'> = { '1': 'bus', '2': 'tram', '3': 'metro', '4': 'rail' };
      const mk = modeKeys[e.key];
      if (mk) st.setMode(mk);
      else if (e.key === 's' || e.key === 'S') st.setTool('station');
      else if (e.key === 't' || e.key === 'T') st.setTool('track');
      else if (e.key === 'r' || e.key === 'R') st.setTool('route');
      else if (e.key === 'b' || e.key === 'B') st.setTool('bulldoze');
      else if (e.key === 'Escape') {
        st.cancelPending();
        st.setTool('select');
        st.select(null, null);
        st.setShortcutsOpen(false);
      } else if (e.key === 'Enter') void finishRoute();
      else if (e.key === ' ') {
        e.preventDefault();
        st.setSpeed(st.speed === 0 ? 1 : 0);
      } else if (e.key === '=' || e.key === '+' || e.key === 'Add') {
        e.preventDefault();
        r?.zoomBy(1.2);
      } else if (e.key === '-' || e.key === '_' || e.key === 'Subtract') {
        e.preventDefault();
        r?.zoomBy(1 / 1.2);
      } else if (e.key === 'Home') {
        e.preventDefault();
        r?.recenter();
      } else if (e.key === '0' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        r?.zoomToFit();
      } else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        st.setShortcutsOpen(!st.shortcutsOpen);
      } else if (e.key === 'f' || e.key === 'F') {
        st.setPanel(st.panel === 'budget' ? 'none' : 'budget');
      } else if (e.key === ',' || e.key === 'Comma') {
        st.setPanel(st.panel === 'settings' ? 'none' : 'settings');
      }
      updateGhost();
    };
    window.addEventListener('keydown', onKey);

    const unsub = useStore.subscribe((st) => {
      updateGhost();
      rendererRef.current?.setOverlay(st.overlay);
    });
    const unsubSettings = subscribeSettings(() => applyPrefs());

    return () => {
      disposed = true;
      window.removeEventListener('keydown', onKey);
      unsub();
      unsubSettings();
      setRenderer(null);
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, []);

  return <div ref={hostRef} className="absolute inset-0" />;
}
