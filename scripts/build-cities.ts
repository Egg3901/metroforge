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
const MASK_RES = 640; // water/park bitmask resolution over the world square (~19m/cell)

/** Pack a 0/1 mask to 1 bit per cell, base64. */
function packMask(bits: Uint8Array): string {
  const packed = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) if (bits[i]) packed[i >> 3]! |= 1 << (i & 7);
  return Buffer.from(packed).toString('base64');
}

interface CityCfg {
  key: string;
  label: string;
  /** OSM bbox: south, west, north, east */
  bbox: [number, number, number, number];
}

// bboxes must match scripts/extract-water.ts
const CITIES: CityCfg[] = [
  { key: 'nyc', label: 'New York', bbox: [40.695, -74.02, 40.80, -73.93] },
  { key: 'boston', label: 'Boston', bbox: [42.33, -71.11, 42.40, -71.02] },
  { key: 'chicago', label: 'Chicago', bbox: [41.83, -87.70, 41.95, -87.58] },
  { key: 'cleveland', label: 'Cleveland', bbox: [41.45, -81.75, 41.54, -81.63] },
  { key: 'la', label: 'Los Angeles', bbox: [33.99, -118.30, 34.10, -118.18] },
  { key: 'atlanta', label: 'Atlanta', bbox: [33.72, -84.44, 33.82, -84.34] },
  // ~12 km downtown cores with transit-history hooks
  { key: 'philly', label: 'Philadelphia', bbox: [39.925, -75.20, 39.985, -75.12] },
  { key: 'sf', label: 'San Francisco', bbox: [37.74, -122.48, 37.82, -122.38] },
  { key: 'dc', label: 'Washington', bbox: [38.86, -77.07, 38.94, -76.97] },
  { key: 'seattle', label: 'Seattle', bbox: [47.57, -122.38, 47.65, -122.28] },
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

/** Stitch member ways into closed rings by connecting shared endpoints — an OSM
 *  multipolygon's outer/inner boundary is often split across several ways. */
function assembleRings(ways: LL[][]): LL[][] {
  const key = (p: LL): string => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;
  const rings: LL[][] = [];
  const rem = ways.filter((w) => w.length >= 2).map((w) => w.slice());
  while (rem.length) {
    const ring = rem.shift()!.slice();
    let go = true;
    while (go && key(ring[0]!) !== key(ring[ring.length - 1]!)) {
      go = false;
      const end = key(ring[ring.length - 1]!);
      const start = key(ring[0]!);
      for (let i = 0; i < rem.length; i++) {
        const s = rem[i]!;
        const a = key(s[0]!), b = key(s[s.length - 1]!);
        if (a === end) { ring.push(...s.slice(1)); }
        else if (b === end) { ring.push(...s.slice(0, -1).reverse()); }
        else if (b === start) { ring.unshift(...s.slice(0, -1)); }
        else if (a === start) { ring.unshift(...s.slice(1).reverse()); }
        else continue;
        rem.splice(i, 1); go = true; break;
      }
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

/** Outer + inner (hole) rings, so multipolygon water with land holes is correct. */
function classifyRings(els: OsmEl[]): { outers: LL[][]; inners: LL[][] } {
  const outers: LL[][] = [];
  const inners: LL[][] = [];
  for (const e of els) {
    if (e.type === 'way' && e.geometry && e.geometry.length >= 3) outers.push(e.geometry);
    else if (e.type === 'relation' && e.members) {
      const ow: LL[][] = [], iw: LL[][] = [];
      for (const m of e.members) {
        if (m.type !== 'way' || !m.geometry || m.geometry.length < 2) continue;
        (m.role === 'inner' ? iw : ow).push(m.geometry);
      }
      for (const r of assembleRings(ow)) outers.push(r);
      for (const r of assembleRings(iw)) inners.push(r);
    }
  }
  return { outers, inners };
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
  // pre-assembled sea polygons (coastline-derived) from OpenStreetMapData.com,
  // extracted per city by scripts/extract-water.ts — topologically clean, no
  // flood/seed reconstruction. Inland water (lakes/rivers) still from OSM below.
  let ocean: { outers: LL[][]; inners: LL[][] } = { outers: [], inners: [] };
  const ocPath = `.cache/osmdata/${cfg.key}-ocean.json`;
  if (existsSync(ocPath)) {
    const raw = JSON.parse(readFileSync(ocPath, 'utf8')) as { outers: [number, number][][]; inners: [number, number][][] };
    const conv = (rings: [number, number][][]): LL[][] => rings.map((r) => r.map(([lat, lon]) => ({ lat, lon })));
    ocean = { outers: conv(raw.outers), inners: conv(raw.inners) };
  }
  // water: ways AND relations (lakes, rivers like the Charles, Chicago River)
  const waterEls = fetchRaw(
    `[out:json][timeout:90];(way["natural"="water"](${bb});way["waterway"="riverbank"](${bb});relation["natural"="water"](${bb});relation["waterway"="riverbank"](${bb}););out geom;`,
    `${cfg.key}-water2`,
  );
  const waterR = classifyRings(waterEls);
  // named river/bay centerlines for labels (Hudson, East River, Charles, ...)
  const waterwayEls = fetchRaw(
    `[out:json][timeout:90];(way["waterway"="river"]["name"](${bb});relation["natural"="water"]["name"](${bb}););out geom;`,
    `${cfg.key}-waterways`,
  );
  // parks/greens: ways AND relations (Boston Common, Central Park, ...)
  const parkEls = fetchRaw(
    `[out:json][timeout:90];(way["leisure"~"^(park|garden)$"](${bb});way["natural"="wood"](${bb});relation["leisure"="park"](${bb}););out geom;`,
    `${cfg.key}-parks`,
  );
  const parkRings = ringsOf(parkEls);
  // real building footprints (rasterized to a coverage mask, not stored as vectors)
  const buildingEls = fetchRaw(
    `[out:json][timeout:180];(way["building"](${bb});relation["building"](${bb}););out geom;`,
    `${cfg.key}-buildings`,
  );

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

  // union: pre-assembled sea polygons + inland OSM water (both with holes)
  const waterOuter: number[][] = [...ocean.outers, ...waterR.outers].map((ring) => ring.map(P).flat());
  const waterInner: number[][] = [...ocean.inners, ...waterR.inners].map((ring) => ring.map(P).flat());
  const parkPolys: number[][] = parkRings.map((ring) => ring.map(P).flat());

  // ── labels: real OSM names for roads / water / parks ──
  type Label = { kind: 'road' | 'water' | 'park'; name: string; x: number; y: number; angle?: number; imp: number };
  const labels: Label[] = [];
  const geomOf = (e: OsmEl): LL[] | null => e.geometry ?? e.members?.find((m) => m.geometry)?.geometry ?? null;
  const addAreaLabels = (els: OsmEl[], kind: 'water' | 'park'): void => {
    const seen = new Set<string>();
    for (const e of els) {
      const name = e.tags?.name;
      const geom = geomOf(e);
      if (!name || !geom || geom.length < 3 || seen.has(name)) continue;
      seen.add(name);
      let sx = 0, sy = 0, minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
      for (const ll of geom) { const [x, y] = P(ll); sx += x; sy += y; minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y); }
      const area = (maxx - minx) * (maxy - miny);
      if (area < 40000) continue; // skip tiny features
      labels.push({ kind, name, x: Math.round(sx / geom.length), y: Math.round(sy / geom.length), imp: 1 + Math.min(4, area / 1_500_000) });
    }
  };
  addAreaLabels([...waterEls, ...waterwayEls], 'water');
  addAreaLabels(parkEls, 'park');
  // roads: one label per named major road, at its longest member's midpoint
  const bestByName = new Map<string, typeof roads[number]>();
  for (const way of roads) {
    const name = way.tags.name;
    const cls = CLASS[way.tags.highway ?? ''];
    if (!name || !cls || cls === 'local') continue;
    const prev = bestByName.get(name);
    if (!prev || way.geometry.length > prev.geometry.length) bestByName.set(name, way);
  }
  for (const [name, way] of bestByName) {
    const g0 = way.geometry;
    const m = Math.floor(g0.length / 2);
    const [x, y] = P(g0[m]!);
    const [ax, ay] = P(g0[Math.max(0, m - 1)]!);
    const [bx, by] = P(g0[Math.min(g0.length - 1, m + 1)]!);
    let angle = Math.atan2(by - ay, bx - ax);
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;
    labels.push({ kind: 'road', name, x: Math.round(x), y: Math.round(y), angle: Math.round(angle * 1000) / 1000, imp: CLASS[way.tags.highway ?? ''] === 'arterial' ? 2.5 : 1.6 });
  }

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
  const cellOf = (x: number, y: number): number => {
    const c = Math.floor((x + HALF) / cellW);
    const r = Math.floor((y + HALF) / cellW);
    if (c < 0 || r < 0 || c >= N || r >= N) return -1;
    return r * N + c;
  };

  // ── Land/water by EXACT polygon rasterization (scanline). Fill every water
  // outer ring (pre-assembled sea + inland OSM water), then punch out the
  // inner-ring holes (land inside water — islands, the land side of a bay).
  // Fully deterministic: no coastline side-test, no flood, no seeds. ──
  void cellOf;
  const water = new Uint8Array(N * N);
  const fillInto = (grid: Uint8Array, poly: number[], val: number): void => {
    let minY = 1e9, maxY = -1e9;
    for (let k = 1; k < poly.length; k += 2) { minY = Math.min(minY, poly[k]!); maxY = Math.max(maxY, poly[k]!); }
    const r0 = Math.max(0, Math.floor((minY + HALF) / cellW));
    const r1 = Math.min(N - 1, Math.ceil((maxY + HALF) / cellW));
    for (let r = r0; r <= r1; r++) {
      const y = -HALF + (r + 0.5) * cellW;
      const xs: number[] = [];
      for (let k = 0, j = poly.length - 2; k < poly.length; j = k, k += 2) {
        const yi = poly[k + 1]!, yj = poly[j + 1]!;
        if ((yi > y) !== (yj > y)) xs.push(poly[k]! + ((poly[j]! - poly[k]!) * (y - yi)) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let m = 0; m + 1 < xs.length; m += 2) {
        const c0 = Math.max(0, Math.ceil((xs[m]! + HALF) / cellW - 0.5));
        const c1 = Math.min(N - 1, Math.floor((xs[m + 1]! + HALF) / cellW - 0.5));
        for (let c = c0; c <= c1; c++) grid[r * N + c] = val;
      }
    }
  };
  for (const p of waterOuter) fillInto(water, p, 1); // water areas
  for (const p of waterInner) fillInto(water, p, 0); // land holes inside them

  // building coverage mask: rasterize real OSM footprints (40k+ per city) into
  // the grid — cheap regardless of count, renders as elegant flat city blocks
  const buildingBits = new Uint8Array(N * N);
  const buildingR = classifyRings(buildingEls);
  for (const ring of buildingR.outers) fillInto(buildingBits, ring.map(P).flat(), 1);
  for (const ring of buildingR.inners) fillInto(buildingBits, ring.map(P).flat(), 0);
  for (let i = 0; i < buildingBits.length; i++) if (water[i]) buildingBits[i] = 0; // never on water

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
    waterMask: packMask(bits),
    parkMask: packMask(parkBits),
    buildingMask: packMask(buildingBits),
    maskPacked: true,
    roads: outRoads,
    labels,
  };
  mkdirSync('src/data/cities', { recursive: true });
  const path = `src/data/cities/${cfg.key}.json`;
  writeFileSync(path, JSON.stringify(bundle));
  const kb = (JSON.stringify(bundle).length / 1024) | 0;
  console.log(`${cfg.key}: ${outRoads.length} roads, ${ocean.outers.length} sea, ${waterOuter.length} water, ${parkPolys.length} parks, ${buildingR.outers.length} buildings → ${path} (${kb} KB)`);
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
