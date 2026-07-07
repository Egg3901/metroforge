/**
 * Core simulation types. This file plus ARCHITECTURE.md is the portable spec.
 * Everything here must be plain-JSON-serializable (saves) except where noted.
 */
import type { Polyline, Vec2 } from './geometry';
import type { RngState } from './rng';

// ── World / fields ──────────────────────────────────────────────────────────

/** Scalar fields on a coarse grid. Data, not geometry. Row-major, size w*h. */
export interface FieldGrid {
  w: number;
  h: number;
  /** meters per cell */
  cellSize: number;
  /** world-space origin of cell (0,0) corner */
  originX: number;
  originY: number;
  terrain: Float32Array; // elevation 0..1
  water: Uint8Array; // 0|1
  population: Float32Array; // residents per cell
  jobs: Float32Array; // jobs per cell
  landValue: Float32Array; // relative 0..~3
  nimby: Float32Array; // resistance 0..100
}

export type RoadClass = 'arterial' | 'collector' | 'local';

export interface RoadEdge {
  id: number;
  cls: RoadClass;
  polyline: Polyline;
}

/** Demand aggregation unit: a cluster of field cells. */
export interface District {
  id: number;
  centroid: Vec2;
  cellIndices: number[];
  population: number;
  jobs: number;
  /** mean land value, drives NIMBY + fares elasticity later */
  landValue: number;
}

// ── Transit ─────────────────────────────────────────────────────────────────

export type TransitMode = 'bus' | 'tram' | 'metro' | 'rail';
export type TrackGrade = 'surface' | 'elevated' | 'tunnel';

export interface Station {
  id: number;
  name: string;
  pos: Vec2;
  mode: TransitMode;
  level: number; // 1..5
  /** rolling daily boardings, from flow assignment */
  ridership: number;
  buildTick: number;
}

export interface TrackSegment {
  id: number;
  mode: TransitMode;
  grade: TrackGrade;
  fromStationId: number;
  toStationId: number;
  polyline: Polyline;
  buildCost: number;
}

export interface RouteDef {
  id: number;
  name: string;
  color: string;
  mode: TransitMode;
  /** ordered station ids; consecutive pairs must have a track segment */
  stationIds: number[];
  /** ordered track segment ids, length = stationIds.length - 1 */
  segmentIds: number[];
  headwaySeconds: number;
  fare: number;
  vehicleCount: number;
  /** derived, from assignment */
  dailyRidership: number;
  dailyRevenue: number;
}

export interface VehicleState {
  id: number;
  routeId: number;
  /** distance along the route's full polyline (out-and-back path) */
  along: number;
  /** total out-and-back length cached at spawn */
  pathLength: number;
  dwellRemaining: number;
  /** 0..1 crowding, derived from segment flows */
  occupancy: number;
}

// ── Demand / flows ──────────────────────────────────────────────────────────

/** One assigned origin-destination flow over the transit network. */
export interface FlowResult {
  originDistrict: number;
  destDistrict: number;
  /** trips per day choosing transit */
  transitTrips: number;
  /** trips per day choosing car (mode share denominator) */
  carTrips: number;
  /** generalized cost minutes for the transit path */
  transitCost: number;
  /** route ids traversed in order (for agent sampling + revenue attribution) */
  routeIds: number[];
  /** station ids traversed in order: [board, ...transfers..., alight] */
  stationIds: number[];
}

// ── Economy ─────────────────────────────────────────────────────────────────

export interface Budget {
  cash: number;
  loanBalance: number;
  loanRate: number; // annual
  /** yesterday's totals for UI */
  lastDay: {
    fares: number;
    subsidy: number;
    operations: number;
    maintenance: number;
    interest: number;
  };
}

export interface CityStats {
  population: number;
  jobs: number;
  dailyTransitTrips: number;
  dailyCarTrips: number;
  transitShare: number; // 0..1
  coverage: number; // fraction of population within walk radius of a station
  approval: number; // 0..100
}

// ── Game state ──────────────────────────────────────────────────────────────

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface GameState {
  seed: number;
  tick: number; // 1 tick = 1 game-second
  rngState: RngState;
  difficulty: Difficulty;
  fields: FieldGrid;
  roads: RoadEdge[];
  districts: District[];
  stations: Station[];
  tracks: TrackSegment[];
  routes: RouteDef[];
  vehicles: VehicleState[];
  flows: FlowResult[];
  budget: Budget;
  stats: CityStats;
  /** monotonic entity id counter */
  nextId: number;
  /** set when land use / network changed; assignment reruns on next demand pass */
  demandDirty: boolean;
  unlockedModes: TransitMode[];
}

// ── Commands (the only mutation API) ────────────────────────────────────────

export type Command =
  | { kind: 'buildStation'; mode: TransitMode; pos: Vec2 }
  | { kind: 'buildTrack'; mode: TransitMode; grade: TrackGrade; fromStationId: number; toStationId: number; waypoints: Vec2[] }
  | { kind: 'createRoute'; mode: TransitMode; stationIds: number[] }
  | { kind: 'editRoute'; routeId: number; headwaySeconds?: number; fare?: number; vehicleCount?: number; name?: string; color?: string }
  | { kind: 'deleteRoute'; routeId: number }
  | { kind: 'demolishStation'; stationId: number }
  | { kind: 'demolishTrack'; trackId: number }
  | { kind: 'upgradeStation'; stationId: number }
  | { kind: 'takeLoan'; amount: number }
  | { kind: 'repayLoan'; amount: number }
  | { kind: 'renameStation'; stationId: number; name: string };

export interface CommandResult {
  ok: boolean;
  error?: string;
  /** id of a created entity, when applicable */
  createdId?: number;
}
