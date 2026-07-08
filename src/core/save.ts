/**
 * Versioned save format. Plain JSON of core state only. A native client
 * implements this exact schema; bump SAVE_VERSION + add a migration for any
 * breaking change.
 */
import { fieldsFromJSON, fieldsToJSON } from './fields';
import { makePolyline } from './geometry';
import { getBankruptDays, setBankruptDays } from './sim';
import type { GameState, RoadEdge, TrackSegment } from './types';

export const SAVE_VERSION = 1;

export function serialize(state: GameState): string {
  // transient fields (recomputed / reloaded), never serialized
  const { traffic: _t, osmWaterMask: _w, osmParkMask: _p, osmMaskRes: _r, osmLabels: _l, ...persist } = state;
  return JSON.stringify({
    version: SAVE_VERSION,
    bankruptDays: getBankruptDays(),
    state: {
      ...persist,
      fields: fieldsToJSON(state.fields),
      // polylines: store points only; cumulative lengths rebuilt on load
      roads: state.roads.map((r) => ({ id: r.id, cls: r.cls, points: r.polyline.points })),
      tracks: state.tracks.map((t) => ({
        id: t.id,
        mode: t.mode,
        grade: t.grade,
        fromStationId: t.fromStationId,
        toStationId: t.toStationId,
        buildCost: t.buildCost,
        points: t.polyline.points,
      })),
    },
  });
}

export function deserialize(json: string): GameState {
  const raw = JSON.parse(json) as { version: number; bankruptDays?: number; state: Record<string, unknown> };
  if (raw.version !== SAVE_VERSION) {
    throw new Error(`Unsupported save version ${raw.version} (expected ${SAVE_VERSION})`);
  }
  setBankruptDays(raw.bankruptDays ?? 0);
  const s = raw.state as unknown as Omit<GameState, 'fields' | 'roads' | 'tracks'> & {
    fields: Parameters<typeof fieldsFromJSON>[0];
    roads: { id: number; cls: RoadEdge['cls']; points: { x: number; y: number }[] }[];
    tracks: (Omit<TrackSegment, 'polyline'> & { points: { x: number; y: number }[] })[];
  };
  return {
    ...s,
    fields: fieldsFromJSON(s.fields),
    roads: s.roads.map((r) => ({ id: r.id, cls: r.cls, polyline: makePolyline(r.points) })),
    tracks: s.tracks.map((t) => ({
      id: t.id,
      mode: t.mode,
      grade: t.grade,
      fromStationId: t.fromStationId,
      toStationId: t.toStationId,
      buildCost: t.buildCost,
      polyline: makePolyline(t.points),
    })),
  };
}

/** Cheap deterministic state fingerprint for replay verification / port acceptance. */
export function stateHash(state: GameState): number {
  let h = 2166136261 >>> 0;
  const mix = (v: number): void => {
    // hash the float's rounded micro-units to tolerate JSON round-trips, not FP drift
    const x = Math.round(v * 1000);
    h = Math.imul(h ^ (x & 0xffff), 16777619) >>> 0;
    h = Math.imul(h ^ ((x >> 16) & 0xffff), 16777619) >>> 0;
  };
  mix(state.tick);
  mix(state.budget.cash);
  mix(state.stats.population);
  mix(state.stations.length);
  mix(state.tracks.length);
  mix(state.routes.length);
  for (const r of state.routes) {
    mix(r.dailyRidership);
    mix(r.vehicleCount);
  }
  for (const v of state.vehicles) mix(v.along);
  return h;
}
