/**
 * Procedural city generation — tensor-field street networks (Chen et al. 2008,
 * see docs/research-city-gen.md).
 *
 * Order matters: terrain → river → CBD/subcenters → population → parks →
 * tensor field → arterial streamlines (with bridges) → local streamlines.
 * Population comes BEFORE streets; street density follows people.
 */
import { WORLD_SIZE } from '../constants';
import { cellCenter, cellIndexAt, createFieldGrid } from '../fields';
import { Noise2D, clamp, makePolyline, vec } from '../geometry';
import type { Vec2 } from '../geometry';
import { Rng } from '../rng';
import type { District, Difficulty, FieldGrid, RoadEdge } from '../types';
import { traceStreamlines } from './streamlines';
import type { TensorField } from './tensor';

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

/** Drop collinear-ish points to keep polylines lean. */
function decimate(pts: Vec2[]): Vec2[] {
  if (pts.length <= 4) return pts.map((p) => vec(Math.round(p.x), Math.round(p.y)));
  const out: Vec2[] = [pts[0] as Vec2];
  let lastAngle: number | null = null;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1] as Vec2;
    const b = pts[i] as Vec2;
    const c = pts[i + 1] as Vec2;
    const angAB = Math.atan2(b.y - a.y, b.x - a.x);
    const angBC = Math.atan2(c.y - b.y, c.x - b.x);
    const turn = Math.abs(angleDelta(angBC, angAB));
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (turn > 0.06 || dist > 220) {
      out.push(b);
      lastAngle = angAB;
    }
  }
  void lastAngle;
  out.push(pts[pts.length - 1] as Vec2);
  return out.map((p) => vec(Math.round(p.x), Math.round(p.y)));
}

export function generateCity(seed: number, difficulty: Difficulty): GeneratedCity {
  const rng = new Rng(seed);
  const terrainNoise = new Noise2D(() => rng.nextUint());
  const detailNoise = new Noise2D(() => rng.nextUint());
  const fields = createFieldGrid();

  // ── Terrain + coastal water ──
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
      const coastDist = p.x * waterDir.x + p.y * waterDir.y - waterOffset;
      if (coastDist > 0) elev -= (coastDist / HALF) * 0.9;
      fields.terrain[i] = clamp(elev, 0, 1);
      fields.water[i] = elev < 0.22 ? 1 : 0;
    }
  }

  // ── River: meanders from an inland edge downhill to the sea ──
  {
    const startAngle = waterAngle + Math.PI + rng.range(-0.5, 0.5);
    let px = Math.cos(startAngle) * HALF * 0.95;
    let py = Math.sin(startAngle) * HALF * 0.95;
    let dirAngle = Math.atan2(-py, -px);
    const meander = rng.range(2, 5);
    for (let step = 0; step < 400; step++) {
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
        const coastDist = px * waterDir.x + py * waterDir.y - waterOffset;
        if (coastDist > -600) break;
      }
      const toCoast = Math.atan2(waterDir.y, waterDir.x);
      const wiggle = Math.sin(step / 14) * 0.5 * Math.sin(meander + step / 40);
      dirAngle += angleDelta(toCoast, dirAngle) * 0.035 + wiggle * 0.14 + rng.range(-0.08, 0.08);
      px += Math.cos(dirAngle) * 95;
      py += Math.sin(dirAngle) * 95;
      if (Math.abs(px) > HALF || Math.abs(py) > HALF) break;
    }
  }

  const isWaterAt = (p: Vec2): boolean => (fields.water[cellIndexAt(fields, p)] as number) === 1;

  // ── CBD: on land, biased toward the water (port cities) ──
  let cbd = vec(0, 0);
  {
    let best = -Infinity;
    for (let attempt = 0; attempt < 60; attempt++) {
      const cand = vec(rng.range(-HALF * 0.35, HALF * 0.35), rng.range(-HALF * 0.35, HALF * 0.35));
      if (isWaterAt(cand)) continue;
      const coastDist = Math.abs(cand.x * waterDir.x + cand.y * waterDir.y - waterOffset);
      const score = -coastDist / HALF - Math.hypot(cand.x, cand.y) / HALF + rng.range(0, 0.3);
      if (score > best) {
        best = score;
        cbd = cand;
      }
    }
  }

  // ── Employment subcenters (edge-city anchors) ──
  const subcenters: Vec2[] = [];
  for (let k = 0; k < rng.int(3, 5); k++) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const ang = rng.range(0, Math.PI * 2);
      const cand = vec(cbd.x + Math.cos(ang) * rng.range(2000, 4200), cbd.y + Math.sin(ang) * rng.range(2000, 4200));
      if (Math.abs(cand.x) > HALF * 0.9 || Math.abs(cand.y) > HALF * 0.9 || isWaterAt(cand)) continue;
      if (subcenters.every((s) => Math.hypot(s.x - cand.x, s.y - cand.y) > 1800)) {
        subcenters.push(cand);
        break;
      }
    }
  }

  // ── Population & jobs (BEFORE streets — density drives the network) ──
  const popTarget: Record<Difficulty, number> = { easy: 220000, normal: 160000, hard: 110000 };
  const target = popTarget[difficulty];
  const rawPop = new Float32Array(fields.w * fields.h);
  const rawJobs = new Float32Array(fields.w * fields.h);
  let rawPopSum = 0;
  let rawJobsSum = 0;
  for (let i = 0; i < rawPop.length; i++) {
    if ((fields.water[i] as number) === 1) continue;
    const c = cellCenter(fields, i);
    const dCbd = Math.hypot(c.x - cbd.x, c.y - cbd.y);
    const noise = detailNoise.fbm(c.x / 3000 + 50, c.y / 3000 + 50, 3);
    let pop = Math.exp(-dCbd / 2600);
    for (const s of subcenters) {
      const dS = Math.hypot(c.x - s.x, c.y - s.y);
      pop += 0.45 * Math.exp(-dS / 1400);
    }
    pop *= 0.45 + noise;
    rawPop[i] = pop;
    rawPopSum += pop;
    let jobs = Math.exp(-dCbd / 1100) * 3;
    for (const s of subcenters) {
      const dS = Math.hypot(c.x - s.x, c.y - s.y);
      jobs += Math.exp(-dS / 800) * 0.8;
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

  // ── Parks: noise pockets + signature parks; displace residents ──
  {
    for (let i = 0; i < fields.parks.length; i++) {
      if ((fields.water[i] as number) === 1) continue;
      const c = cellCenter(fields, i);
      const n = detailNoise.fbm(c.x / 1400 + 300, c.y / 1400 + 300, 3);
      const dCbd = Math.hypot(c.x - cbd.x, c.y - cbd.y);
      if (n > 0.66 && dCbd > 700) fields.parks[i] = 1;
    }
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
    for (let i = 0; i < fields.parks.length; i++) {
      if ((fields.parks[i] as number) === 1) {
        fields.population[i] = 0;
        fields.jobs[i] = 0;
      }
    }
  }

  const meanCellPop = target / (fields.w * fields.h);
  const densityAt = (p: Vec2): number => {
    if (Math.abs(p.x) > HALF || Math.abs(p.y) > HALF) return -1;
    const i = cellIndexAt(fields, p);
    if ((fields.water[i] as number) === 1 || (fields.parks[i] as number) === 1) return -1;
    return ((fields.population[i] as number) + (fields.jobs[i] as number)) / meanCellPop;
  };

  // ── Tensor field: grid patches + CBD radial + water-boundary alignment ──
  const field: TensorField = {
    grids: [],
    radialCenter: cbd,
    radialWeight: 2.2,
    radialSigma: 2600,
    boundaries: [],
    boundarySigma: 550,
    boundaryWeight: 1.6,
    noise: (x, y) => detailNoise.at(x / 5200 + 400, y / 5200 + 400),
    noiseWeight: 0.22,
  };
  // grid patches: at subcenters + random populated points, orientation snapped to 15°
  const gridSeeds: Vec2[] = [...subcenters];
  for (let k = 0; k < 6; k++) {
    gridSeeds.push(vec(rng.range(-HALF * 0.8, HALF * 0.8), rng.range(-HALF * 0.8, HALF * 0.8)));
  }
  for (const gcenter of gridSeeds) {
    const raw = detailNoise.at(gcenter.x / 4200 + 200, gcenter.y / 4200 + 200) * Math.PI;
    field.grids.push({
      center: gcenter,
      theta: Math.round(raw / (Math.PI / 12)) * (Math.PI / 12),
      sigma: rng.range(1600, 2600),
      weight: 1,
    });
  }
  // boundary samples: shoreline cells with tangent from the water gradient
  for (let cy = 1; cy < fields.h - 1; cy++) {
    for (let cx = 1; cx < fields.w - 1; cx++) {
      const i = cy * fields.w + cx;
      if ((fields.water[i] as number) === 1) continue;
      // land cell adjacent to water = shoreline
      const wR = fields.water[cy * fields.w + cx + 1] as number;
      const wL = fields.water[cy * fields.w + cx - 1] as number;
      const wD = fields.water[(cy + 1) * fields.w + cx] as number;
      const wU = fields.water[(cy - 1) * fields.w + cx] as number;
      if (wR + wL + wD + wU === 0) continue;
      if ((cx + cy) % 2 !== 0) continue; // thin the samples
      const gx = wR - wL;
      const gy = wD - wU;
      field.boundaries.push({ pos: cellCenter(fields, i), theta: Math.atan2(gy, gx) + Math.PI / 2 });
    }
  }

  // ── Arterials: sparse streamlines, both eigen directions, may bridge water ──
  const roads: RoadEdge[] = [];
  let roadId = 1;
  const arterialSeeds: Vec2[] = [cbd, ...subcenters];
  for (let k = 0; k < 18; k++) {
    const cand = vec(rng.range(-HALF * 0.85, HALF * 0.85), rng.range(-HALF * 0.85, HALF * 0.85));
    if (densityAt(cand) > 0.4) arterialSeeds.push(cand);
  }
  const arterials = traceStreamlines(field, rng.fork(11), {
    separation: 620,
    inDomain: (p) => Math.abs(p.x) < HALF * 0.97 && Math.abs(p.y) < HALF * 0.97 && (densityAt(p) > 0.12 || Math.hypot(p.x - cbd.x, p.y - cbd.y) < 2800),
    bridgeMaxSteps: 9,
    blocked: isWaterAt,
    maxLength: 11000,
    minLength: 900,
    seeds: arterialSeeds,
    spawnSeeds: true,
    eigenDirs: [0, 1],
  });
  for (const line of arterials) {
    roads.push({ id: roadId++, cls: 'arterial', polyline: makePolyline(decimate(line)) });
  }

  // ── Locals: dense streamlines through populated land, spacing by density ──
  const localSeeds: Vec2[] = [cbd, ...subcenters];
  for (let k = 0; k < 80; k++) {
    const cand = vec(rng.range(-HALF * 0.9, HALF * 0.9), rng.range(-HALF * 0.9, HALF * 0.9));
    if (densityAt(cand) > 0.5) localSeeds.push(cand);
  }
  const arterialSamples: Vec2[] = [];
  for (const line of arterials) for (const p of line) arterialSamples.push(p);
  const locals = traceStreamlines(field, rng.fork(13), {
    separation: (p) => {
      const d = densityAt(p);
      return d > 2.5 ? 100 : d > 1.2 ? 130 : 170;
    },
    inDomain: (p) => densityAt(p) > 0.35,
    bridgeMaxSteps: 0,
    blocked: isWaterAt,
    maxLength: 2600,
    minLength: 200,
    seeds: localSeeds,
    snapTargets: arterialSamples,
    spawnSeeds: true,
    eigenDirs: [0, 1],
  });
  for (const line of locals) {
    roads.push({ id: roadId++, cls: 'local', polyline: makePolyline(decimate(line)) });
  }

  // ── Land value: CBD proximity + waterfront + noise; NIMBY from wealth ──
  for (let i = 0; i < fields.landValue.length; i++) {
    if ((fields.water[i] as number) === 1) continue;
    const c = cellCenter(fields, i);
    const dCbd = Math.hypot(c.x - cbd.x, c.y - cbd.y);
    let nearWater = 0;
    const probe = 2;
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
    const popNorm = (fields.population[i] as number) / meanCellPop;
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
      if (pop + jobs < 50) continue;
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
