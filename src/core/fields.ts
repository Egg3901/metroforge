import { FIELD_CELL, FIELD_H, FIELD_W, WORLD_SIZE } from './constants';
import { clamp } from './geometry';
import type { Vec2 } from './geometry';
import type { FieldGrid } from './types';

export function createFieldGrid(): FieldGrid {
  const n = FIELD_W * FIELD_H;
  return {
    w: FIELD_W,
    h: FIELD_H,
    cellSize: FIELD_CELL,
    originX: -WORLD_SIZE / 2,
    originY: -WORLD_SIZE / 2,
    terrain: new Float32Array(n),
    water: new Uint8Array(n),
    population: new Float32Array(n),
    jobs: new Float32Array(n),
    landValue: new Float32Array(n),
    nimby: new Float32Array(n),
  };
}

export function cellIndexAt(g: FieldGrid, p: Vec2): number {
  const cx = clamp(Math.floor((p.x - g.originX) / g.cellSize), 0, g.w - 1);
  const cy = clamp(Math.floor((p.y - g.originY) / g.cellSize), 0, g.h - 1);
  return cy * g.w + cx;
}

export function cellCenter(g: FieldGrid, idx: number): Vec2 {
  const cx = idx % g.w;
  const cy = Math.floor(idx / g.w);
  return {
    x: g.originX + (cx + 0.5) * g.cellSize,
    y: g.originY + (cy + 0.5) * g.cellSize,
  };
}

/** Bilinear sample of a Float32Array field at a world point. */
export function sampleField(g: FieldGrid, field: Float32Array, p: Vec2): number {
  const fx = clamp((p.x - g.originX) / g.cellSize - 0.5, 0, g.w - 1.001);
  const fy = clamp((p.y - g.originY) / g.cellSize - 0.5, 0, g.h - 1.001);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, g.w - 1);
  const y1 = Math.min(y0 + 1, g.h - 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const v00 = field[y0 * g.w + x0] as number;
  const v10 = field[y0 * g.w + x1] as number;
  const v01 = field[y1 * g.w + x0] as number;
  const v11 = field[y1 * g.w + x1] as number;
  return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
}

export function isWaterAt(g: FieldGrid, p: Vec2): boolean {
  return (g.water[cellIndexAt(g, p)] as number) === 1;
}

/** Serialize typed arrays for saves. */
export function fieldsToJSON(g: FieldGrid): object {
  return {
    w: g.w,
    h: g.h,
    cellSize: g.cellSize,
    originX: g.originX,
    originY: g.originY,
    terrain: Array.from(g.terrain),
    water: Array.from(g.water),
    population: Array.from(g.population),
    jobs: Array.from(g.jobs),
    landValue: Array.from(g.landValue),
    nimby: Array.from(g.nimby),
  };
}

export function fieldsFromJSON(o: {
  w: number; h: number; cellSize: number; originX: number; originY: number;
  terrain: number[]; water: number[]; population: number[]; jobs: number[];
  landValue: number[]; nimby: number[];
}): FieldGrid {
  return {
    w: o.w,
    h: o.h,
    cellSize: o.cellSize,
    originX: o.originX,
    originY: o.originY,
    terrain: Float32Array.from(o.terrain),
    water: Uint8Array.from(o.water),
    population: Float32Array.from(o.population),
    jobs: Float32Array.from(o.jobs),
    landValue: Float32Array.from(o.landValue),
    nimby: Float32Array.from(o.nimby),
  };
}
