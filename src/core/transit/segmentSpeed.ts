/**
 * Grade-aware segment travel speed. Surface alignments share the street and
 * feel the diurnal congestion curve; elevated / tunnel keep full mode speed
 * at every hour. Density amplifies the surface slowdown (bus/tram in dense
 * districts at rush hurt most). Pure + deterministic — safe inside simTick
 * and assignment.
 */
import { MODES, SURFACE_CONGESTION_WEIGHT, TICKS_PER_DAY } from '../constants';
import { sampleField } from '../fields';
import type { Vec2 } from '../geometry';
import { DIURNAL_MEAN, DIURNAL_PEAK, diurnalFactor } from '../timeOfDay';
import type { FieldGrid, TrackGrade, TrackSegment, TransitMode } from '../types';

/**
 * Mean of max(0, diurnalFactor − 1) over a game day. Precomputed so headway
 * derivation can apply a day-average surface slowdown without integrating the
 * curve on every edge.
 */
export const MEAN_RUSH_EXCESS: number = (() => {
  let sum = 0;
  for (let t = 0; t < TICKS_PER_DAY; t++) sum += Math.max(0, diurnalFactor(t) - 1);
  return sum / TICKS_PER_DAY;
})();

/** Peak diurnalFactor (DIURNAL_PEAK / DIURNAL_MEAN) — used for assignment ride
 *  times so rush-hour surface pain shows up in the daily demand model. */
export const PEAK_DIURNAL_FACTOR: number = DIURNAL_PEAK / DIURNAL_MEAN;

/** Map land-value (~0..3) onto a [0,1] density weight for congestion. */
export function density01FromLandValue(lv: number): number {
  return Math.max(0, Math.min(1, lv / 2));
}

/**
 * Sample corridor density at a world point (land value). Falls back to a
 * mid-density default when fields are unavailable.
 */
export function sampleDensity01(fields: FieldGrid | undefined, pos: Vec2): number {
  if (!fields) return 0.5;
  return density01FromLandValue(sampleField(fields, fields.landValue, pos));
}

/** Density along a track segment (midpoint of its polyline). */
export function segmentDensity01(fields: FieldGrid | undefined, seg: TrackSegment): number {
  const pts = seg.polyline.points;
  if (!pts.length) return 0.5;
  const mid = pts[Math.floor(pts.length / 2)] as Vec2;
  return sampleDensity01(fields, mid);
}

/**
 * Congestion slowdown multiplier (≥1). Elevated/tunnel always 1. Surface
 * slows only when the diurnal factor is above its daily mean (rush); off-peak
 * and overnight leave surface at full mode speed so grade is an operating
 * tradeoff, not a permanent handicap.
 */
export function surfaceCongestionSlowdown(
  mode: TransitMode,
  density01: number,
  todFactor: number,
): number {
  const excess = Math.max(0, todFactor - 1);
  if (excess <= 0) return 1;
  const dens = 0.35 + 0.65 * Math.max(0, Math.min(1, density01));
  return 1 + excess * SURFACE_CONGESTION_WEIGHT[mode] * dens;
}

/** Day-average surface slowdown for cycle/headway (vehicles run all day). */
export function dayAverageSurfaceSlowdown(mode: TransitMode, density01: number): number {
  const dens = 0.35 + 0.65 * Math.max(0, Math.min(1, density01));
  return 1 + MEAN_RUSH_EXCESS * SURFACE_CONGESTION_WEIGHT[mode] * dens;
}

/** Peak surface slowdown for assignment trip times — rush is when the peak
 *  load (and crowding feedback) is measured, so grade separation shows up in
 *  the demand model without a separate time-of-day assignment. */
export function assignmentSurfaceSlowdown(mode: TransitMode, density01: number): number {
  return surfaceCongestionSlowdown(mode, density01, PEAK_DIURNAL_FACTOR);
}

export function segmentEffectiveSpeedMps(
  mode: TransitMode,
  grade: TrackGrade,
  todFactor: number,
  density01: number,
): number {
  const base = MODES[mode].speed;
  if (grade !== 'surface') return base;
  return base / surfaceCongestionSlowdown(mode, density01, todFactor);
}

/** Day-average effective speed used by cycle time / headway derivation. */
export function segmentDayAverageSpeedMps(
  mode: TransitMode,
  grade: TrackGrade,
  density01: number,
): number {
  const base = MODES[mode].speed;
  if (grade !== 'surface') return base;
  return base / dayAverageSurfaceSlowdown(mode, density01);
}

/** Peak-biased effective speed used by assignment ride edges. */
export function segmentAssignmentSpeedMps(
  mode: TransitMode,
  grade: TrackGrade,
  density01: number,
): number {
  const base = MODES[mode].speed;
  if (grade !== 'surface') return base;
  return base / assignmentSurfaceSlowdown(mode, density01);
}
