/**
 * Procedural city generation. Produces terrain/water fields, a road polyline
 * graph (arterial radials + rings, collector infill), population/jobs/land
 * value fields, and demand districts. Plausible over perfect (per spec).
 */
import { WORLD_SIZE } from '../constants';
import { cellCenter, cellIndexAt, createFieldGrid } from '../fields';
import { Noise2D, clamp, makePolyline, vec } from '../geometry';
import type { Vec2 } from '../geometry';
import { Rng } from '../rng';
import type { District, Difficulty, FieldGrid, RoadEdge } from '../types';

const HALF = WORLD_SIZE / 2;

export interface GeneratedCity {
  fields: FieldGrid;
  roads: RoadEdge[];
  districts: District[];
  cbd: Vec2;
}

export function generateCity(seed: number, difficulty: Difficulty): GeneratedCity {
  const rng = new Rng(seed);
  const terrainNoise = new Noise2D(() => rng.nextUint());
  const detailNoise = new Noise2D(() => rng.nextUint());
  const fields = createFieldGrid();

  // ── Terrain + water ──
  // One dominant water body entering from a random edge (coast or wide river),
  // plus noise lakes at low elevation.
  const waterAngle = rng.range(0, Math.PI * 2);
  const waterDir = vec(Math.cos(waterAngle), Math.sin(waterAngle));
  const waterOffset = rng.range(0.55, 0.85) * HALF;

  for (let cy = 0; cy < fields.h; cy++) {
    for (let cx = 0; cx < fields.w; cx++) {
      const i = cy * fields.w + cx;
      const p = cellCenter(fields, i);
      const nx = p.x / WORLD_SIZE;
      const ny = p.y / WORLD_SIZE;
      let elev = terrainNoise.fbm(nx * 4 + 10, ny * 4 + 10, 4);
      // coastal shelf: depress elevation past the water line
      const coastDist = p.x * waterDir.x + p.y * waterDir.y - waterOffset;
      if (coastDist > 0) elev -= (coastDist / HALF) * 0.9;
      fields.terrain[i] = clamp(elev, 0, 1);
      fields.water[i] = elev < 0.22 ? 1 : 0;
    }
  }

  // ── CBD placement: on land, biased toward the water body (port cities) ──
  let cbd = vec(0, 0);
  {
    let best = -Infinity;
    for (let attempt = 0; attempt < 60; attempt++) {
      const cand = vec(rng.range(-HALF * 0.35, HALF * 0.35), rng.range(-HALF * 0.35, HALF * 0.35));
      const i = cellIndexAt(fields, cand);
      if ((fields.water[i] as number) === 1) continue;
      const coastDist = Math.abs(cand.x * waterDir.x + cand.y * waterDir.y - waterOffset);
      const score = -coastDist / HALF - Math.hypot(cand.x, cand.y) / HALF + rng.range(0, 0.3);
      if (score > best) {
        best = score;
        cbd = cand;
      }
    }
  }

  // ── Road network: radial arterials from CBD + ring roads + collectors ──
  const roads: RoadEdge[] = [];
  let roadId = 1;
  const arterialCount = rng.int(6, 9);
  const arterialEnds: Vec2[] = [];

  const march = (from: Vec2, angle: number, maxLen: number, wobble: number, step: number): Vec2[] => {
    const pts: Vec2[] = [{ ...from }];
    let a = angle;
    let p = { ...from };
    for (let d = 0; d < maxLen; d += step) {
      a += rng.range(-wobble, wobble);
      const next = vec(p.x + Math.cos(a) * step, p.y + Math.sin(a) * step);
      if (Math.abs(next.x) > HALF * 0.98 || Math.abs(next.y) > HALF * 0.98) break;
      // deflect along coastlines rather than plunging in
      if ((fields.water[cellIndexAt(fields, next)] as number) === 1) {
        a += rng.chance(0.5) ? 0.5 : -0.5;
        continue;
      }
      pts.push(next);
      p = next;
    }
    return pts;
  };

  for (let k = 0; k < arterialCount; k++) {
    const angle = (k / arterialCount) * Math.PI * 2 + rng.range(-0.15, 0.15);
    const pts = march(cbd, angle, rng.range(HALF * 0.75, HALF * 0.95), 0.06, 220);
    if (pts.length < 4) continue;
    roads.push({ id: roadId++, cls: 'arterial', polyline: makePolyline(pts) });
    arterialEnds.push(pts[pts.length - 1] as Vec2);
  }

  // ring roads at ~2.2km and ~4.5km
  for (const ringR of [2200, 4500]) {
    const pts: Vec2[] = [];
    const steps = 48;
    let broken = false;
    for (let s = 0; s <= steps; s++) {
      const a = (s / steps) * Math.PI * 2;
      const r = ringR * (1 + 0.12 * detailNoise.at(Math.cos(a) * 2 + 30, Math.sin(a) * 2 + 30));
      const p = vec(cbd.x + Math.cos(a) * r, cbd.y + Math.sin(a) * r);
      if (Math.abs(p.x) > HALF * 0.97 || Math.abs(p.y) > HALF * 0.97 || (fields.water[cellIndexAt(fields, p)] as number) === 1) {
        // break the ring at water/map edge — emit accumulated arc
        if (pts.length > 6) {
          roads.push({ id: roadId++, cls: 'arterial', polyline: makePolyline([...pts]) });
          broken = true;
        }
        pts.length = 0;
        continue;
      }
      pts.push(p);
    }
    if (pts.length > 6) roads.push({ id: roadId++, cls: broken ? 'collector' : 'arterial', polyline: makePolyline(pts) });
  }

  // collectors: short branches off random points of arterials
  const arterials = roads.filter((r) => r.cls === 'arterial');
  const collectorCount = arterials.length * 4;
  for (let k = 0; k < collectorCount; k++) {
    const parent = rng.pick(arterials);
    const along = rng.range(0.2, 0.9) * parent.polyline.length;
    let start = vec(0, 0);
    {
      // walk cumulative to find segment (cheap linear ok at gen time)
      const pl = parent.polyline;
      let idx = 1;
      while (idx < pl.cumulative.length - 1 && (pl.cumulative[idx] as number) < along) idx++;
      const a = pl.points[idx - 1] as Vec2;
      const b = pl.points[idx] as Vec2;
      const segStart = pl.cumulative[idx - 1] as number;
      const segLen = (pl.cumulative[idx] as number) - segStart || 1;
      const t = (along - segStart) / segLen;
      start = vec(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    }
    const branchAngle = rng.range(0, Math.PI * 2);
    const pts = march(start, branchAngle, rng.range(600, 1800), 0.12, 160);
    if (pts.length >= 3) roads.push({ id: roadId++, cls: 'collector', polyline: makePolyline(pts) });
  }

  // ── Population / jobs fields ──
  // Distance to nearest road (coarse) boosts density; CBD kernel dominates jobs.
  const popTarget: Record<Difficulty, number> = { easy: 220000, normal: 160000, hard: 110000 };
  const target = popTarget[difficulty];

  // precompute per-cell nearest-arterial distance (sampled — plausible, cheap)
  const roadBoost = new Float32Array(fields.w * fields.h);
  const roadSamples: Vec2[] = [];
  for (const r of roads) {
    const step = r.cls === 'arterial' ? 300 : 500;
    for (let d = 0; d < r.polyline.length; d += step) {
      let idx = 1;
      const pl = r.polyline;
      while (idx < pl.cumulative.length - 1 && (pl.cumulative[idx] as number) < d) idx++;
      const a = pl.points[idx - 1] as Vec2;
      const b = pl.points[idx] as Vec2;
      const segStart = pl.cumulative[idx - 1] as number;
      const segLen = (pl.cumulative[idx] as number) - segStart || 1;
      const t = (d - segStart) / segLen;
      roadSamples.push(vec(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
    }
  }
  for (let i = 0; i < roadBoost.length; i++) {
    const c = cellCenter(fields, i);
    let bestSq = Infinity;
    for (const s of roadSamples) {
      const dx = s.x - c.x;
      const dy = s.y - c.y;
      const dsq = dx * dx + dy * dy;
      if (dsq < bestSq) bestSq = dsq;
    }
    roadBoost[i] = Math.exp(-Math.sqrt(bestSq) / 900);
  }

  let rawPopSum = 0;
  const rawPop = new Float32Array(fields.w * fields.h);
  const rawJobs = new Float32Array(fields.w * fields.h);
  let rawJobsSum = 0;
  for (let i = 0; i < rawPop.length; i++) {
    if ((fields.water[i] as number) === 1) continue;
    const c = cellCenter(fields, i);
    const dCbd = Math.hypot(c.x - cbd.x, c.y - cbd.y);
    const centerKernel = Math.exp(-dCbd / 2800);
    const noise = detailNoise.fbm(c.x / 3000 + 50, c.y / 3000 + 50, 3);
    const pop = (0.35 * centerKernel + 0.65 * (roadBoost[i] as number)) * (0.5 + noise);
    rawPop[i] = pop;
    rawPopSum += pop;
    // jobs: strong CBD kernel + secondary employment sub-centers at arterial ends
    let jobs = Math.exp(-dCbd / 1200) * 3;
    for (const end of arterialEnds) {
      const dEnd = Math.hypot(c.x - end.x, c.y - end.y);
      jobs += Math.exp(-dEnd / 900) * 0.5;
    }
    jobs *= 0.6 + noise;
    rawJobs[i] = jobs;
    rawJobsSum += jobs;
  }
  const jobsTarget = target * 0.45;
  for (let i = 0; i < rawPop.length; i++) {
    fields.population[i] = ((rawPop[i] as number) / rawPopSum) * target;
    fields.jobs[i] = ((rawJobs[i] as number) / rawJobsSum) * jobsTarget;
  }

  // ── Land value: CBD proximity + waterfront premium + noise; NIMBY from wealth ──
  for (let i = 0; i < fields.landValue.length; i++) {
    if ((fields.water[i] as number) === 1) continue;
    const c = cellCenter(fields, i);
    const dCbd = Math.hypot(c.x - cbd.x, c.y - cbd.y);
    // waterfront: near water but not in it
    let nearWater = 0;
    const probe = 2; // cells
    const cx = i % fields.w;
    const cy = Math.floor(i / fields.w);
    outer: for (let oy = -probe; oy <= probe; oy++) {
      for (let ox = -probe; ox <= probe; ox++) {
        const nx2 = cx + ox;
        const ny2 = cy + oy;
        if (nx2 < 0 || ny2 < 0 || nx2 >= fields.w || ny2 >= fields.h) continue;
        if ((fields.water[ny2 * fields.w + nx2] as number) === 1) {
          nearWater = 1;
          break outer;
        }
      }
    }
    const lv =
      Math.exp(-dCbd / 3500) * 1.2 +
      nearWater * 0.6 +
      detailNoise.fbm(c.x / 2500 + 90, c.y / 2500 + 90, 3) * 0.5;
    fields.landValue[i] = lv;
    // wealthy low-density areas resist transit: high land value, low population
    const popNorm = (fields.population[i] as number) / (target / (fields.w * fields.h)) ;
    fields.nimby[i] = lv > 1.1 && popNorm < 1.2 ? clamp((lv - 1.0) * 55, 0, 90) : 0;
  }

  // ── Districts: 4×4-cell (500 m) blocks — must stay finer than walk radii ──
  const districts: District[] = [];
  const BLOCK = 4;
  let districtId = 0;
  for (let by = 0; by < fields.h; by += BLOCK) {
    for (let bx = 0; bx < fields.w; bx += BLOCK) {
      let pop = 0;
      let jobs = 0;
      let lvSum = 0;
      let landCells = 0;
      const cellIndices: number[] = [];
      let wx = 0;
      let wy = 0;
      let wSum = 0;
      for (let oy = 0; oy < BLOCK && by + oy < fields.h; oy++) {
        for (let ox = 0; ox < BLOCK && bx + ox < fields.w; ox++) {
          const i = (by + oy) * fields.w + (bx + ox);
          cellIndices.push(i);
          const cp = fields.population[i] as number;
          const cj = fields.jobs[i] as number;
          pop += cp;
          jobs += cj;
          if ((fields.water[i] as number) === 0) {
            lvSum += fields.landValue[i] as number;
            landCells++;
          }
          const w = cp + cj;
          if (w > 0) {
            const c = cellCenter(fields, i);
            wx += c.x * w;
            wy += c.y * w;
            wSum += w;
          }
        }
      }
      if (pop + jobs < 50) continue; // skip empty blocks
      districts.push({
        id: districtId++,
        centroid: wSum > 0 ? vec(wx / wSum, wy / wSum) : cellCenter(fields, cellIndices[Math.floor(cellIndices.length / 2)] as number),
        cellIndices,
        population: pop,
        jobs,
        landValue: landCells > 0 ? lvSum / landCells : 0,
      });
    }
  }

  return { fields, roads, districts, cbd };
}
