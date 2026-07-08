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

/** Signed smallest angle from b to a. */
function angleDelta(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

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

  // ── River: meanders from an inland edge downhill to the sea ──
  {
    // pick the inland edge (opposite the coast direction)
    const startAngle = waterAngle + Math.PI + rng.range(-0.5, 0.5);
    let px = Math.cos(startAngle) * HALF * 0.95;
    let py = Math.sin(startAngle) * HALF * 0.95;
    let dirAngle = Math.atan2(-py, -px); // head toward map center
    const meander = rng.range(2, 5);
    for (let step = 0; step < 400; step++) {
      // stamp river width ~1.5 cells
      const ci = cellIndexAt(fields, vec(px, py));
      const cx0 = ci % fields.w;
      const cy0 = Math.floor(ci / fields.w);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (Math.abs(ox) + Math.abs(oy) > 1 && !(rng.next() < 0.4)) continue;
          const nx = cx0 + ox;
          const ny = cy0 + oy;
          if (nx >= 0 && ny >= 0 && nx < fields.w && ny < fields.h) {
            fields.water[ny * fields.w + nx] = 1;
            fields.terrain[ny * fields.w + nx] = Math.min(fields.terrain[ny * fields.w + nx] as number, 0.2);
          }
        }
      }
      if ((fields.water[ci] as number) === 1 && step > 30) {
        // reached the sea (we're in pre-existing water away from the source)
        const coastDist = px * waterDir.x + py * waterDir.y - waterOffset;
        if (coastDist > -600) break;
      }
      // steer: toward the coast + meander sine + slight noise
      const toCoast = Math.atan2(waterDir.y, waterDir.x);
      const wiggle = Math.sin(step / 14) * 0.5 * Math.sin(meander + step / 40);
      dirAngle += (angleDelta(toCoast, dirAngle)) * 0.035 + wiggle * 0.14 + rng.range(-0.08, 0.08);
      px += Math.cos(dirAngle) * 95;
      py += Math.sin(dirAngle) * 95;
      if (Math.abs(px) > HALF || Math.abs(py) > HALF) break;
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

  // ── Road network: radial arterials + rings + per-neighborhood street grids ──
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
      if ((fields.water[cellIndexAt(fields, next)] as number) === 1) {
        // short span (a river): bridge straight across; wide water: deflect
        let landAt = -1;
        for (let look = 1; look <= 5; look++) {
          const probe = vec(p.x + Math.cos(a) * step * look, p.y + Math.sin(a) * step * look);
          if (Math.abs(probe.x) > HALF * 0.98 || Math.abs(probe.y) > HALF * 0.98) break;
          if ((fields.water[cellIndexAt(fields, probe)] as number) === 0) {
            landAt = look;
            break;
          }
        }
        if (landAt > 0) {
          // bridge: jump straight to the far bank
          const far = vec(p.x + Math.cos(a) * step * landAt, p.y + Math.sin(a) * step * landAt);
          pts.push(far);
          p = far;
          d += step * (landAt - 1);
          continue;
        }
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
    const pts = march(cbd, angle, rng.range(HALF * 0.75, HALF * 0.95), 0.02, 260);
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
    const pts = march(start, branchAngle, rng.range(600, 1800), 0.03, 200);
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

  // ── Parks: noise pockets + a couple of big signature parks near the core ──
  {
    for (let i = 0; i < fields.parks.length; i++) {
      if ((fields.water[i] as number) === 1) continue;
      const c = cellCenter(fields, i);
      const n = detailNoise.fbm(c.x / 1400 + 300, c.y / 1400 + 300, 3);
      const dCbd = Math.hypot(c.x - cbd.x, c.y - cbd.y);
      if (n > 0.66 && dCbd > 700) fields.parks[i] = 1;
    }
    // signature parks (Central-Park-ish rectangles near, not on, the CBD)
    const bigParks = rng.int(1, 2);
    for (let k = 0; k < bigParks; k++) {
      const ang = rng.range(0, Math.PI * 2);
      const cx0 = cbd.x + Math.cos(ang) * rng.range(1200, 2400);
      const cy0 = cbd.y + Math.sin(ang) * rng.range(1200, 2400);
      const w = rng.range(500, 900);
      const h = rng.range(350, 650);
      for (let i = 0; i < fields.parks.length; i++) {
        const c = cellCenter(fields, i);
        if (Math.abs(c.x - cx0) < w / 2 && Math.abs(c.y - cy0) < h / 2 && (fields.water[i] as number) === 0) {
          fields.parks[i] = 1;
        }
      }
    }
    // parks displace residents/jobs
    for (let i = 0; i < fields.parks.length; i++) {
      if ((fields.parks[i] as number) === 1) {
        fields.population[i] = 0;
        fields.jobs[i] = 0;
      }
    }
  }

  // ── Local street grids: patchwork of oriented grids where people live ──
  // Each 1 km neighborhood gets a grid orientation (snapped noise) and a
  // spacing tied to density; streets form real blocks instead of squiggles.
  {
    const HOOD = 1000; // meters
    const meanCellPop = target / (fields.w * fields.h);
    const densityAt = (p: Vec2): number => {
      const i = cellIndexAt(fields, p);
      if ((fields.water[i] as number) === 1 || (fields.parks[i] as number) === 1) return -1;
      return ((fields.population[i] as number) + (fields.jobs[i] as number)) / meanCellPop;
    };
    const cbdTheta = Math.round(rng.range(0, Math.PI) / (Math.PI / 12)) * (Math.PI / 12);
    for (let hy = -HALF; hy < HALF; hy += HOOD) {
      for (let hx = -HALF; hx < HALF; hx += HOOD) {
        const center = vec(hx + HOOD / 2, hy + HOOD / 2);
        // neighborhood density gate: average over a few probes
        let dens = 0;
        for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75], [0.5, 0.5]] as const) {
          dens += Math.max(0, densityAt(vec(hx + ox * HOOD, hy + oy * HOOD)));
        }
        dens /= 5;
        if (dens < 0.5) continue;
        // orientation: downtown shares one grid; elsewhere smooth noise snapped
        // to 15° so neighboring hoods line up
        const dCbdHood = Math.hypot(center.x - cbd.x, center.y - cbd.y);
        const downtown = dCbdHood < 1600;
        const rawTheta = detailNoise.at(center.x / 4200 + 200, center.y / 4200 + 200) * Math.PI;
        const theta = downtown ? cbdTheta : Math.round(rawTheta / (Math.PI / 12)) * (Math.PI / 12);
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const spacing = downtown ? 85 : dens > 2.5 ? 100 : dens > 1.2 ? 125 : 160;
        const R = HOOD * 0.75; // cover the hood incl. rotation overhang
        for (const dir of [0, 1] as const) {
          // dir 0: lines along (cosT,sinT); dir 1: perpendicular
          const ux = dir === 0 ? cosT : -sinT;
          const uy = dir === 0 ? sinT : cosT;
          const vx = dir === 0 ? -sinT : cosT;
          const vy = dir === 0 ? cosT : sinT;
          for (let off = -R; off <= R; off += spacing) {
            // walk the line, emitting runs that stay on land and populated ground
            let run: Vec2[] = [];
            const flush = (): void => {
              // runs are straight — store endpoints only
              if (run.length >= 2) {
                const a = run[0] as Vec2;
                const b = run[run.length - 1] as Vec2;
                roads.push({
                  id: roadId++,
                  cls: 'local',
                  polyline: makePolyline([vec(Math.round(a.x), Math.round(a.y)), vec(Math.round(b.x), Math.round(b.y))]),
                });
              }
              run = [];
            };
            const STEP = 55;
            for (let t = -R; t <= R; t += STEP) {
              const p = vec(center.x + vx * off + ux * t, center.y + vy * off + uy * t);
              const inHood = p.x >= hx - 20 && p.x < hx + HOOD + 20 && p.y >= hy - 20 && p.y < hy + HOOD + 20;
              if (inHood && Math.abs(p.x) < HALF * 0.98 && Math.abs(p.y) < HALF * 0.98 && densityAt(p) > 0.35) {
                run.push(p);
              } else {
                flush();
              }
            }
            flush();
          }
        }
      }
    }
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
