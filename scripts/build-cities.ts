/**
 * Real-city importer. Pulls OSM geometry (roads + coastline + inland water) for
 * a city, projects it into the game's world square, simplifies, bakes a water
 * mask, and writes a compact bundle to src/data/cities/<key>.json — plus a
 * preview PNG so we can eyeball recognizability without the engine.
 *
 *   npx vite-node scripts/build-cities.ts          # all configured cities
 *   npx vite-node scripts/build-cities.ts nyc      # one city
 *
 * Raw Overpass responses are cached in /tmp so re-runs are fast.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { encodePng } from './png';

const WORLD = 12000; // fit each city into a 12km square (matches medium map)
const HALF = WORLD / 2;
const MASK_RES = 320; // water/park bitmask resolution over the world square

interface CityCfg {
  key: string;
  label: string;
  /** OSM bbox: south, west, north, east */
  bbox: [number, number, number, number];
  /** a known-on-land lat/lon, to orient the coastline water-side test */
  land: [number, number];
}

const CITIES: CityCfg[] = [
  { key: 'nyc', label: 'New York', bbox: [40.695, -74.02, 40.80, -73.93], land: [40.758, -73.985] },
  { key: 'boston', label: 'Boston', bbox: [42.33, -71.11, 42.40, -71.02], land: [42.355, -71.065] },
];

type LL = { lat: number; lon: number };
type Way = { tags: Record<string, string>; geometry: LL[] };

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
function sleep(ms: number): void {
  execFileSync('sleep', [String(ms / 1000)]);
}
type OsmEl = {
  type: string;
  tags?: Record<string, string>;
  geometry?: LL[];
  members?: { type: string; role: string; geometry?: LL[] }[];
};
function fetchRaw(query: string, cacheKey: string): OsmEl[] {
  const cache = `/tmp/osm-${cacheKey}.json`;
  let json = '';
  if (existsSync(cache) && readFileSync(cache, 'utf8').trimStart().startsWith('{')) {
    json = readFileSync(cache, 'utf8');
  } else {
    writeFileSync('/tmp/q.overpass', query);
    for (let attempt = 0; attempt < 6 && !json.trimStart().startsWith('{'); attempt++) {
      const url = ENDPOINTS[attempt % ENDPOINTS.length]!;
      try {
        json = execFileSync(
          'curl',
          ['-s', '--max-time', '120', '-G', url, '--data-urlencode', 'data@/tmp/q.overpass'],
          { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
        );
      } catch {
        json = '';
      }
      if (!json.trimStart().startsWith('{')) {
        console.log(`  ${cacheKey}: retry ${attempt + 1} (endpoint busy), backing off…`);
        sleep(6000);
      }
    }
    if (!json.trimStart().startsWith('{')) throw new Error(`Overpass failed for ${cacheKey}`);
    writeFileSync(cache, json);
  }
  return (JSON.parse(json) as { elements: OsmEl[] }).elements;
}

/** Ways with usable geometry (roads, coastline). */
function waysOf(els: OsmEl[]): Way[] {
  return els
    .filter((e) => e.type === 'way' && e.geometry && e.geometry.length >= 2)
    .map((e) => ({ tags: e.tags ?? {}, geometry: e.geometry as LL[] }));
}
/** Closed rings from ways + relation outer members (water/park polygons). */
function ringsOf(els: OsmEl[]): LL[][] {
  const rings: LL[][] = [];
  for (const e of els) {
    if (e.type === 'way' && e.geometry && e.geometry.length >= 3) rings.push(e.geometry);
    else if (e.type === 'relation' && e.members) {
      for (const m of e.members) {
        if (m.type === 'way' && m.role !== 'inner' && m.geometry && m.geometry.length >= 3) rings.push(m.geometry);
      }
    }
  }
  return rings;
}

const CLASS: Record<string, 'arterial' | 'collector' | 'local'> = {
  motorway: 'arterial', trunk: 'arterial', primary: 'arterial',
  motorway_link: 'arterial', trunk_link: 'arterial', primary_link: 'arterial',
  secondary: 'collector', tertiary: 'collector', secondary_link: 'collector', tertiary_link: 'collector',
  residential: 'local', living_street: 'local', unclassified: 'local',
};

function build(cfg: CityCfg): void {
  const [s, w, n, e] = cfg.bbox;
  const bb = `${s},${w},${n},${e}`;
  const roads = waysOf(fetchRaw(
    `[out:json][timeout:90];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|living_street|unclassified)(_link)?$"](${bb});out geom;`,
    `${cfg.key}-roads`,
  ));
  const coast = waysOf(fetchRaw(`[out:json][timeout:90];way["natural"="coastline"](${bb});out geom;`, `${cfg.key}-coast`));
  // water: ways AND relations (big rivers like the Charles are multipolygons)
  const waterRings = ringsOf(fetchRaw(
    `[out:json][timeout:90];(way["natural"="water"](${bb});way["waterway"="riverbank"](${bb});relation["natural"="water"](${bb});relation["waterway"="riverbank"](${bb}););out geom;`,
    `${cfg.key}-water2`,
  ));
  // parks/greens: ways AND relations (Boston Common, Central Park, ...)
  const parkRings = ringsOf(fetchRaw(
    `[out:json][timeout:90];(way["leisure"~"^(park|garden)$"](${bb});way["natural"="wood"](${bb});relation["leisure"="park"](${bb}););out geom;`,
    `${cfg.key}-parks`,
  ));

  // equirectangular projection around bbox center, north-up, fit to world square
  const lat0 = (s + n) / 2;
  const lon0 = (w + e) / 2;
  const mx = (ll: LL): number => (ll.lon - lon0) * Math.cos((lat0 * Math.PI) / 180) * 111320;
  const my = (ll: LL): number => (ll.lat - lat0) * 110540; // north positive
  const spanX = (e - w) * Math.cos((lat0 * Math.PI) / 180) * 111320;
  const spanY = (n - s) * 110540;
  const scale = (WORLD * 0.94) / Math.max(spanX, spanY);
  const P = (ll: LL): [number, number] => [mx(ll) * scale, -my(ll) * scale]; // world: y down, north up

  // ── roads: classify, project, simplify ──
  const outRoads: { cls: string; pts: number[] }[] = [];
  for (const way of roads) {
    const cls = CLASS[way.tags.highway ?? ''];
    if (!cls) continue;
    const pts = way.geometry.map(P);
    const simp = simplify(pts, 5);
    if (simp.length < 2) continue;
    outRoads.push({ cls, pts: simp.flatMap(([x, y]) => [Math.round(x), Math.round(y)]) });
  }

  // ── water: coastline segments (dir preserved) + inland polygons ──
  const coastSegs: [number, number, number, number][] = [];
  for (const way of coast) {
    const pts = way.geometry.map(P);
    for (let i = 0; i + 1 < pts.length; i++) coastSegs.push([pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1]]);
  }
  const waterPolys: number[][] = waterRings.map((ring) => ring.map(P).flat());
  const parkPolys: number[][] = parkRings.map((ring) => ring.map(P).flat());

  // orient the coastline: OSM keeps land on the left; find the sign that puts
  // the known land point on the land side.
  const [lx, ly] = P({ lat: cfg.land[0], lon: cfg.land[1] });
  const sideAt = (x: number, y: number): number => {
    let best = Infinity;
    let cross = 0;
    for (const [ax, ay, bx, by] of coastSegs) {
      const dx = bx - ax;
      const dy = by - ay;
      const L2 = dx * dx + dy * dy || 1;
      let t = ((x - ax) * dx + (y - ay) * dy) / L2;
      t = Math.max(0, Math.min(1, t));
      const qx = ax + dx * t;
      const qy = ay + dy * t;
      const d = (qx - x) * (qx - x) + (qy - y) * (qy - y);
      if (d < best) {
        best = d;
        cross = dx * (y - ay) - dy * (x - ax); // >0 : left of a->b
      }
    }
    return cross;
  };
  const landSign = Math.sign(sideAt(lx, ly)) || 1; // land is on this sign; water is the other
  const pointInPoly = (x: number, y: number, poly: number[]): boolean => {
    let inside = false;
    for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
      const xi = poly[i]!, yi = poly[i + 1]!, xj = poly[j]!, yj = poly[j + 1]!;
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const N = MASK_RES;
  const cellW = WORLD / N;
  // raw water: coastline side-test + inland water polygons. Mark poly cells so we
  // can keep those components even if small (real lakes).
  const raw = new Uint8Array(N * N);
  const polyCell = new Uint8Array(N * N);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const x = -HALF + (c + 0.5) * cellW;
      const y = -HALF + (r + 0.5) * cellW;
      let isWater = false;
      for (const poly of waterPolys) if (pointInPoly(x, y, poly)) { isWater = true; polyCell[r * N + c] = 1; break; }
      if (!isWater && coastSegs.length) isWater = Math.sign(sideAt(x, y)) !== landSign;
      raw[r * N + c] = isWater ? 1 : 0;
    }
  }
  // ── Keep only water components that touch the map border or a real water
  // polygon. This deletes the small inland "ponds" the side-test sprays near
  // concave shorelines, while keeping the harbor/rivers/lakes. ──
  const water = new Uint8Array(N * N);
  const comp = new Int32Array(N * N).fill(-1);
  let nc = 0;
  for (let start = 0; start < N * N; start++) {
    if (raw[start] === 0 || comp[start] !== -1) continue;
    // BFS this component
    const cells: number[] = [start];
    comp[start] = nc;
    let touchesBorder = false;
    let hasPoly = false;
    for (let qi = 0; qi < cells.length; qi++) {
      const i = cells[qi]!;
      const cx = i % N, cy = (i / N) | 0;
      if (cx === 0 || cy === 0 || cx === N - 1 || cy === N - 1) touchesBorder = true;
      if (polyCell[i]) hasPoly = true;
      const nb = [cx + 1 < N ? i + 1 : -1, cx - 1 >= 0 ? i - 1 : -1, cy + 1 < N ? i + N : -1, cy - 1 >= 0 ? i - N : -1];
      for (const j of nb) if (j >= 0 && raw[j] === 1 && comp[j] === -1) { comp[j] = nc; cells.push(j); }
    }
    if (touchesBorder || hasPoly || cells.length > (N * N) / 40) for (const i of cells) water[i] = 1;
    nc++;
  }

  // bake final masks
  const bits = new Uint8Array(N * N);
  const parkBits = new Uint8Array(N * N);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const i = r * N + c;
      bits[i] = water[i];
      if (!water[i]) {
        const x = -HALF + (c + 0.5) * cellW;
        const y = -HALF + (r + 0.5) * cellW;
        for (const poly of parkPolys) if (pointInPoly(x, y, poly)) { parkBits[i] = 1; break; }
      }
    }
  }

  // ── preview PNG ──
  writePreview(cfg.key, outRoads, bits, parkBits);

  // ── bundle ──
  const bundle = {
    key: cfg.key,
    label: cfg.label,
    worldSize: WORLD,
    maskRes: MASK_RES,
    waterMask: Buffer.from(bits).toString('base64'),
    parkMask: Buffer.from(parkBits).toString('base64'),
    roads: outRoads,
  };
  mkdirSync('src/data/cities', { recursive: true });
  const path = `src/data/cities/${cfg.key}.json`;
  writeFileSync(path, JSON.stringify(bundle));
  const kb = (JSON.stringify(bundle).length / 1024) | 0;
  console.log(`${cfg.key}: ${outRoads.length} roads, ${coastSegs.length} coast segs, ${waterPolys.length} water polys, ${parkPolys.length} parks → ${path} (${kb} KB)`);
}

// Ramer–Douglas–Peucker
function simplify(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 3) return pts;
  let maxD = 0;
  let idx = 0;
  const [ax, ay] = pts[0]!;
  const [bx, by] = pts[pts.length - 1]!;
  const dx = bx - ax, dy = by - ay;
  const L = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i]!;
    const d = Math.abs((px - ax) * dy - (py - ay) * dx) / L;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= eps) return [pts[0]!, pts[pts.length - 1]!];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

function writePreview(key: string, roads: { cls: string; pts: number[] }[], bits: Uint8Array, parkBits: Uint8Array): void {
  const S = 3;
  const W = MASK_RES * S;
  const rgb = new Uint8Array(W * W * 3);
  const put = (px: number, py: number, r: number, g: number, b: number): void => {
    if (px < 0 || py < 0 || px >= W || py >= W) return;
    const o = (py * W + px) * 3;
    rgb[o] = r; rgb[o + 1] = g; rgb[o + 2] = b;
  };
  for (let r = 0; r < MASK_RES; r++) for (let c = 0; c < MASK_RES; c++) {
    const wtr = bits[r * MASK_RES + c] === 1;
    const park = parkBits[r * MASK_RES + c] === 1;
    const [rr, gg, bb] = wtr ? [26, 52, 82] : park ? [46, 82, 50] : [58, 66, 52];
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) put(c * S + sx, r * S + sy, rr, gg, bb);
  }
  const toPx = (x: number, y: number): [number, number] => [
    Math.round(((x + HALF) / WORLD) * W),
    Math.round(((y + HALF) / WORLD) * W),
  ];
  const drawRoads = (cls: string, thick: number, col: [number, number, number]): void => {
    for (const road of roads) {
      if (road.cls !== cls) continue;
      const p = road.pts;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const [ax, ay] = toPx(p[i]!, p[i + 1]!);
        const [bx, by] = toPx(p[i + 2]!, p[i + 3]!);
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
        for (let s = 0; s <= steps; s++) {
          const x = Math.round(ax + ((bx - ax) * s) / steps);
          const y = Math.round(ay + ((by - ay) * s) / steps);
          for (let oy = -thick; oy <= thick; oy++) for (let ox = -thick; ox <= thick; ox++) put(x + ox, y + oy, ...col);
        }
      }
    }
  };
  drawRoads('local', 0, [120, 118, 110]);
  drawRoads('collector', 1, [180, 178, 168]);
  drawRoads('arterial', 1, [220, 210, 180]);
  mkdirSync('grader', { recursive: true });
  writeFileSync(`grader/city-${key}.png`, encodePng(W, W, rgb));
}

const only = process.argv[2];
for (const c of CITIES) {
  if (only && c.key !== only) continue;
  build(c);
}
console.log('done. previews: grader/city-*.png');
