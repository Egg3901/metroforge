/// <reference lib="webworker" />
/**
 * Sim worker: owns the GameState, advances fixed-timestep ticks, and streams
 * render snapshots + UI state to the main thread. The renderer never touches
 * the sim directly.
 */
import { TICKS_PER_DAY } from '@core/constants';
import { applyCommand, trackCost } from '@core/commands';
import { pointAlong } from '@core/geometry';
import { newGame } from '@core/newGame';
import { loadOsmCity } from '@core/city/osmRegistry';
import { EVENT_DEFS } from '@core/events';
import { deserialize, serialize } from '@core/save';
import { simTick } from '@core/sim';
import { getRoutePath } from '@core/transit/routePath';
import type { GameState } from '@core/types';
import { AgentPool } from './agents';
import type { FromSim, ToSim, UiState } from './protocol';

let state: GameState | null = null;
let speed = 1; // game-seconds per real second (1x = 1); UI offers 1/10/30/120
let fieldsVersion = 1;
let bankrupt = false;
const agents = new AgentPool();
let lastFlowsRef: unknown = null;

const post = (msg: FromSim, transfer?: Transferable[]): void => {
  (self as unknown as Worker).postMessage(msg, transfer ?? []);
};

function sendStatic(s: GameState): void {
  post({
    type: 'ready',
    staticCity: {
      fieldW: s.fields.w,
      fieldH: s.fields.h,
      cellSize: s.fields.cellSize,
      originX: s.fields.originX,
      originY: s.fields.originY,
      worldSize: s.fields.w * s.fields.cellSize,
      // dense real-city imports have ~5-10k roads; thin them right down
      roadScale: s.roads.length > 3000 ? 0.28 : s.roads.length > 1500 ? 0.5 : 1,
      waterMask: s.osmWaterMask,
      parkMask: s.osmParkMask,
      buildingMask: s.osmBuildingMask,
      maskRes: s.osmMaskRes,
      labels: s.osmLabels,
      roads: s.roads.map((r) => ({
        cls: r.cls,
        points: r.polyline.points.flatMap((p) => [p.x, p.y]),
      })),
    },
  });
  sendFields(s);
}

function sendFields(s: GameState): void {
  post({
    type: 'fields',
    payload: {
      version: fieldsVersion,
      terrain: Float32Array.from(s.fields.terrain),
      water: Uint8Array.from(s.fields.water),
      parks: Uint8Array.from(s.fields.parks),
      population: Float32Array.from(s.fields.population),
      jobs: Float32Array.from(s.fields.jobs),
      landValue: Float32Array.from(s.fields.landValue),
    },
  });
}

function buildUi(s: GameState): UiState {
  return {
    tick: s.tick,
    day: Math.floor(s.tick / TICKS_PER_DAY) + 1,
    speed,
    cash: s.budget.cash,
    loanBalance: s.budget.loanBalance,
    lastDay: s.budget.lastDay,
    population: s.stats.population,
    approval: s.stats.approval,
    transitShare: s.stats.transitShare,
    coverage: s.stats.coverage,
    dailyTransitTrips: s.stats.dailyTransitTrips,
    unlockedModes: [...s.unlockedModes],
    stations: s.stations.map((st) => ({
      id: st.id,
      name: st.name,
      x: st.pos.x,
      y: st.pos.y,
      mode: st.mode,
      level: st.level,
      ridership: st.ridership,
    })),
    tracks: s.tracks.map((t) => ({
      id: t.id,
      mode: t.mode,
      grade: t.grade,
      points: t.polyline.points.flatMap((p) => [p.x, p.y]),
      fromStationId: t.fromStationId,
      toStationId: t.toStationId,
    })),
    routes: s.routes.map((r) => {
      const path = getRoutePath(s, r);
      return {
        id: r.id,
        name: r.name,
        color: r.color,
        mode: r.mode,
        stationIds: [...r.stationIds],
        headwaySeconds: r.headwaySeconds,
        fare: r.fare,
        vehicleCount: r.vehicleCount,
        dailyRidership: r.dailyRidership,
        dailyRevenue: r.dailyRevenue,
        lengthMeters: path ? path.length / 2 : 0,
        capacity: r.capacity ?? 0,
        load: r.load ?? 0,
        crowding: r.crowding ?? 0,
      };
    }),
    activeEvents: s.activeEvents.map((a) => ({ id: a.id, name: EVENT_DEFS.find((e) => e.id === a.id)?.name ?? a.id, daysLeft: a.daysLeft })),
    fieldsVersion,
    bankrupt,
  };
}

function sendTraffic(s: GameState): void {
  const t = s.traffic;
  if (!t) return;
  const values = Float32Array.from(t.values);
  post(
    {
      type: 'traffic',
      payload: {
        w: t.w,
        h: t.h,
        cellSize: t.cellSize,
        originX: t.originX,
        originY: t.originY,
        values,
        hotspots: t.hotspots.map((h) => ({ x: h.x, y: h.y, severity: h.severity })),
      },
    },
    [values.buffer],
  );
}

function sendFrame(s: GameState): void {
  const routeColorOf: Record<number, string> = {};
  const buf = new Float32Array(s.vehicles.length * 6);
  let n = 0;
  s.routes.forEach((r, i) => {
    routeColorOf[i] = r.color;
  });
  const routeIndex = new Map(s.routes.map((r, i) => [r.id, i]));
  for (const v of s.vehicles) {
    const route = s.routes.find((r) => r.id === v.routeId);
    if (!route) continue;
    const path = getRoutePath(s, route);
    if (!path) continue;
    const { pos, heading } = pointAlong(path, v.along);
    buf[n * 6] = v.id;
    buf[n * 6 + 1] = pos.x;
    buf[n * 6 + 2] = pos.y;
    buf[n * 6 + 3] = heading;
    buf[n * 6 + 4] = v.occupancy;
    buf[n * 6 + 5] = routeIndex.get(v.routeId) ?? 0;
    n++;
  }
  const agentBuf = agents.buffer.slice(0, agents.count * 3);
  post(
    {
      type: 'frame',
      snapshot: {
        tick: s.tick,
        vehicles: buf,
        vehicleCount: n,
        agents: agentBuf,
        agentCount: agents.count,
        routeColorOf,
      },
    },
    [buf.buffer, agentBuf.buffer],
  );
}

// ── Main loop: 20 host steps/sec; each step advances `speed/20` game-seconds ──
let accumulator = 0;
let uiCountdown = 0;
setInterval(() => {
  if (!state || bankrupt) return;
  accumulator += speed / 20;
  let ticksRun = 0;
  while (accumulator >= 1 && ticksRun < 400) {
    const events = simTick(state);
    accumulator -= 1;
    ticksRun++;
    for (const m of events.messages) post({ type: 'toast', message: m, tone: 'info' });
    for (const t of events.toasts ?? []) post({ type: 'toast', message: t.message, tone: t.tone });
    if (events.modeUnlocked) post({ type: 'toast', message: `${events.modeUnlocked} unlocked!`, tone: 'good' });
    if (events.bankrupt) {
      bankrupt = true;
      post({ type: 'toast', message: 'Bankruptcy — the city has taken over your transit authority.', tone: 'warn' });
    }
    if (events.dayCompleted !== undefined && events.dayCompleted % 7 === 0) {
      fieldsVersion++;
      sendFields(state);
    }
  }
  if (state.flows !== lastFlowsRef) {
    lastFlowsRef = state.flows;
    agents.resample(state);
    sendTraffic(state); // congestion recomputed with the flows
  }
  agents.update(speed / 20);
  sendFrame(state);
  if (--uiCountdown <= 0) {
    uiCountdown = 10; // UI state at 2 Hz
    post({ type: 'ui', ui: buildUi(state) });
  }
}, 50);

self.onmessage = (e: MessageEvent<ToSim>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      // real-city presets load their OSM bundle before generating
      loadOsmCity(msg.presetKey).then((osm) => {
        state = newGame(msg.seed, msg.difficulty, { size: msg.size, presetKey: msg.presetKey, osm });
        bankrupt = false;
        fieldsVersion++;
        sendStatic(state);
        post({ type: 'ui', ui: buildUi(state) });
      });
      break;
    case 'loadSave':
      try {
        state = deserialize(msg.json);
        bankrupt = false;
        fieldsVersion++;
        sendStatic(state);
        post({ type: 'ui', ui: buildUi(state) });
      } catch (err) {
        post({ type: 'toast', message: `Load failed: ${err instanceof Error ? err.message : 'corrupt save'}`, tone: 'warn' });
      }
      break;
    case 'requestSave':
      if (state) post({ type: 'saved', json: serialize(state) });
      break;
    case 'setSpeed':
      speed = msg.speed;
      break;
    case 'command': {
      if (!state) break;
      const result = applyCommand(state, msg.cmd);
      post({ type: 'commandResult', requestId: msg.requestId, result });
      post({ type: 'ui', ui: buildUi(state) });
      break;
    }
    case 'queryTrackCost': {
      if (!state) break;
      post({ type: 'trackCost', requestId: msg.requestId, cost: trackCost(state, msg.mode, msg.grade, msg.points) });
      break;
    }
  }
};
