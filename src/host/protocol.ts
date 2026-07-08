/**
 * Host ↔ sim message protocol. This boundary is deliberately shaped like the
 * FFI surface a native core would expose: JSON control messages + typed-array
 * render snapshots.
 */
import type { Command, CommandResult, Difficulty, GameState, TransitMode } from '@core/types';

export interface UiStation {
  id: number;
  name: string;
  x: number;
  y: number;
  mode: TransitMode;
  level: number;
  ridership: number;
}

export interface UiTrack {
  id: number;
  mode: TransitMode;
  grade: string;
  points: number[]; // flat x,y pairs
  fromStationId: number;
  toStationId: number;
}

export interface UiRoute {
  id: number;
  name: string;
  color: string;
  mode: TransitMode;
  stationIds: number[];
  headwaySeconds: number;
  fare: number;
  vehicleCount: number;
  dailyRidership: number;
  dailyRevenue: number;
  lengthMeters: number;
}

export interface UiState {
  tick: number;
  day: number;
  speed: number;
  cash: number;
  loanBalance: number;
  lastDay: GameState['budget']['lastDay'];
  population: number;
  approval: number;
  transitShare: number;
  coverage: number;
  dailyTransitTrips: number;
  unlockedModes: TransitMode[];
  stations: UiStation[];
  tracks: UiTrack[];
  routes: UiRoute[];
  /** bumped when land-use fields changed (renderer re-bakes) */
  fieldsVersion: number;
  bankrupt: boolean;
}

export interface StaticCity {
  fieldW: number;
  fieldH: number;
  cellSize: number;
  originX: number;
  originY: number;
  worldSize: number;
  roads: { cls: string; points: number[] }[];
}

export interface FieldsPayload {
  version: number;
  terrain: Float32Array;
  water: Uint8Array;
  parks: Uint8Array;
  population: Float32Array;
  jobs: Float32Array;
  landValue: Float32Array;
}

/** vehicles: stride 6 = [id, x, y, heading, occupancy, routeColorIndex] */
/** agents: stride 3 = [x, y, phase(0 walk,1 ride,2 wait)] */
export interface FrameSnapshot {
  tick: number;
  vehicles: Float32Array;
  vehicleCount: number;
  agents: Float32Array;
  agentCount: number;
  routeColorOf: Record<number, string>;
}

export type ToSim =
  | { type: 'init'; seed: number; difficulty: Difficulty }
  | { type: 'loadSave'; json: string }
  | { type: 'requestSave' }
  | { type: 'setSpeed'; speed: number }
  | { type: 'command'; requestId: number; cmd: Command }
  | { type: 'queryTrackCost'; requestId: number; mode: TransitMode; grade: 'surface' | 'elevated' | 'tunnel'; points: { x: number; y: number }[] };

export type FromSim =
  | { type: 'ready'; staticCity: StaticCity }
  | { type: 'fields'; payload: FieldsPayload }
  | { type: 'frame'; snapshot: FrameSnapshot }
  | { type: 'ui'; ui: UiState }
  | { type: 'commandResult'; requestId: number; result: CommandResult }
  | { type: 'trackCost'; requestId: number; cost: number }
  | { type: 'saved'; json: string }
  | { type: 'toast'; message: string; tone: 'info' | 'warn' | 'good' };
