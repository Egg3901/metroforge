/**
 * City-generation grader. Renders a matrix of (preset × seed) cities to PNGs
 * and computes cheap structural metrics, so generation quality and preset
 * fidelity are visible in bulk without playing the game.
 *
 *   npx vite-node scripts/grade.ts            # default: all presets, 6 seeds, medium
 *   npx vite-node scripts/grade.ts nyc 12     # one preset, 12 seeds
 *
 * Output: grader/<preset>-<seed>.png + grader/report.html + a console table.
 * No browser, no new deps — PNGs are encoded with Node's zlib.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateCity } from '../src/core/city/generator';
import { CITY_PRESETS, MAP_SIZE_METERS, presetByKey, type MapSize } from '../src/core/city/presets';
import type { GeneratedCity } from '../src/core/city/generator';

const CELL_PX = 4; // upscale per field cell

// ── minimal PNG encoder ──────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const t = new Uint8Array(4);
  for (let i = 0; i < 4; i++) t[i] = type.charCodeAt(i);
  const body = new Uint8Array(t.length + data.length);
  body.set(t, 0);
  body.set(data, t.length);
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, data.length);
  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crc32(body));
  return new Uint8Array([...len, ...body, ...crc]);
}
function encodePng(w: number, h: number, rgb: Uint8Array): Uint8Array {
  const stride = w * 3;
  const raw = new Uint8Array((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    raw.set(rgb.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = deflateSync(raw);
  return new Uint8Array([...sig, ...chunk('IHDR', ihdr), ...chunk('IDAT', idat), ...chunk('IEND', new Uint8Array(0))]);
}

// ── raster helpers ───────────────────────────────────────────────────────────
function renderCity(city: GeneratedCity): { png: Uint8Array; W: number; H: number } {
  const g = city.fields;
  const W = g.w * CELL_PX;
  const H = g.h * CELL_PX;
  const rgb = new Uint8Array(W * H * 3);
  let maxPop = 1;
  for (let i = 0; i < g.population.length; i++) maxPop = Math.max(maxPop, g.population[i] as number);
  const put = (px: number, py: number, r: number, gg: number, b: number): void => {
    if (px < 0 || py < 0 || px >= W || py >= H) return;
    const o = (py * W + px) * 3;
    rgb[o] = r;
    rgb[o + 1] = gg;
    rgb[o + 2] = b;
  };
  // base: land/water/park tinted by density
  for (let cy = 0; cy < g.h; cy++) {
    for (let cx = 0; cx < g.w; cx++) {
      const i = cy * g.w + cx;
      let r: number, gr: number, b: number;
      if ((g.water[i] as number) === 1) { r = 26; gr = 52; b = 82; }
      else if ((g.parks[i] as number) === 1) { r = 44; gr = 78; b = 48; }
      else {
        const d = Math.sqrt((g.population[i] as number) / maxPop);
        r = 60 + d * 70; gr = 66 + d * 60; b = 54 + d * 40;
      }
      for (let sy = 0; sy < CELL_PX; sy++) for (let sx = 0; sx < CELL_PX; sx++) put(cx * CELL_PX + sx, cy * CELL_PX + sy, r, gr, b);
    }
  }
  const toPx = (x: number, y: number): [number, number] => [
    Math.round(((x - g.originX) / g.cellSize) * CELL_PX),
    Math.round(((y - g.originY) / g.cellSize) * CELL_PX),
  ];
  const line = (x0: number, y0: number, x1: number, y1: number, thick: number, r: number, gg: number, b: number): void => {
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(x0 + (dx * s) / steps);
      const y = Math.round(y0 + (dy * s) / steps);
      for (let oy = -thick; oy <= thick; oy++) for (let ox = -thick; ox <= thick; ox++) put(x + ox, y + oy, r, gg, b);
    }
  };
  // roads: locals thin/light, arterials thick/dark-edged
  for (const road of city.roads) {
    if (road.cls !== 'local') continue;
    const p = road.polyline.points;
    for (let i = 0; i + 1 < p.length; i++) {
      const [ax, ay] = toPx(p[i]!.x, p[i]!.y);
      const [bx, by] = toPx(p[i + 1]!.x, p[i + 1]!.y);
      line(ax, ay, bx, by, 0, 150, 148, 140);
    }
  }
  for (const road of city.roads) {
    if (road.cls === 'local') continue;
    const p = road.polyline.points;
    for (let i = 0; i + 1 < p.length; i++) {
      const [ax, ay] = toPx(p[i]!.x, p[i]!.y);
      const [bx, by] = toPx(p[i + 1]!.x, p[i + 1]!.y);
      line(ax, ay, bx, by, road.cls === 'arterial' ? 2 : 1, 210, 208, 198);
    }
  }
  return { png: encodePng(W, H, rgb), W, H };
}

// ── metrics ──────────────────────────────────────────────────────────────────
interface Metrics {
  arterials: number;
  locals: number;
  waterPct: number;
  danglingEndsPct: number; // local endpoints not meeting another road (lower = better)
  arterialTouchesPct: number; // local endpoints meeting an arterial
  gridCoherence: number; // 0..1, angular concentration of local segments mod 90deg
}
function computeMetrics(city: GeneratedCity): Metrics {
  const g = city.fields;
  let water = 0;
  for (let i = 0; i < g.water.length; i++) water += g.water[i] as number;
  const arterialPts: { x: number; y: number }[] = [];
  const allPts: { x: number; y: number; id: number }[] = [];
  for (const r of city.roads) {
    for (const p of r.polyline.points) {
      allPts.push({ x: p.x, y: p.y, id: r.id });
      if (r.cls !== 'local') arterialPts.push(p);
    }
  }
  const CONNECT = 45;
  const near = (p: { x: number; y: number }, pts: { x: number; y: number }[], within: number): boolean =>
    pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < within);
  let ends = 0, dangling = 0, arterialTouch = 0;
  const localAngles: number[] = [];
  for (const r of city.roads) {
    if (r.cls !== 'local') continue;
    const pts = r.polyline.points;
    if (pts.length < 2) continue;
    for (const end of [pts[0]!, pts[pts.length - 1]!]) {
      ends++;
      const others = allPts.filter((q) => q.id !== r.id);
      if (!near(end, others, CONNECT)) dangling++;
      else if (near(end, arterialPts, CONNECT)) arterialTouch++;
    }
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = Math.atan2(pts[i + 1]!.y - pts[i]!.y, pts[i + 1]!.x - pts[i]!.x);
      localAngles.push(((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2));
    }
  }
  // circular concentration on the [0, π/2) grid: |mean of e^{i4θ}|
  let sr = 0, si = 0;
  for (const a of localAngles) { sr += Math.cos(4 * a); si += Math.sin(4 * a); }
  const coherence = localAngles.length ? Math.hypot(sr, si) / localAngles.length : 0;
  return {
    arterials: city.roads.filter((r) => r.cls === 'arterial').length,
    locals: city.roads.filter((r) => r.cls === 'local').length,
    waterPct: (100 * water) / g.water.length,
    danglingEndsPct: ends ? (100 * dangling) / ends : 0,
    arterialTouchesPct: ends ? (100 * arterialTouch) / ends : 0,
    gridCoherence: coherence,
  };
}

// ── run ──────────────────────────────────────────────────────────────────────
const argPreset = process.argv[2];
const argSeeds = Number(process.argv[3]) || 6;
const size: MapSize = 'medium';
const presets = argPreset ? [presetByKey(argPreset)] : CITY_PRESETS;
mkdirSync('grader', { recursive: true });

const rows: { preset: string; seed: number; file: string; m: Metrics }[] = [];
for (const p of presets) {
  for (let s = 0; s < argSeeds; s++) {
    const seed = 1000 + s * 7;
    const city = generateCity(seed, 'normal', { worldSize: MAP_SIZE_METERS[size], preset: p });
    const { png } = renderCity(city);
    const file = `${p.key}-${seed}.png`;
    writeFileSync(`grader/${file}`, png);
    rows.push({ preset: p.key, seed, file, m: computeMetrics(city) });
  }
}

// console table (averages per preset)
const byPreset = new Map<string, Metrics[]>();
for (const r of rows) { const a = byPreset.get(r.preset) ?? []; a.push(r.m); byPreset.set(r.preset, a); }
const avg = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
console.log('\npreset      arterials locals water%  dangling%  arterialTouch%  gridCoherence');
for (const [k, ms] of byPreset) {
  console.log(
    k.padEnd(11),
    String(Math.round(avg(ms.map((m) => m.arterials)))).padStart(7),
    String(Math.round(avg(ms.map((m) => m.locals)))).padStart(7),
    avg(ms.map((m) => m.waterPct)).toFixed(1).padStart(6),
    avg(ms.map((m) => m.danglingEndsPct)).toFixed(1).padStart(9),
    avg(ms.map((m) => m.arterialTouchesPct)).toFixed(1).padStart(13),
    avg(ms.map((m) => m.gridCoherence)).toFixed(2).padStart(13),
  );
}

// HTML contact sheet
const badge = (label: string, val: string, good: boolean): string =>
  `<span style="background:${good ? '#14532d' : '#7f1d1d'};padding:1px 5px;border-radius:4px;margin-right:3px">${label} ${val}</span>`;
const cards = rows
  .map((r) => {
    const m = r.m;
    return `<figure style="margin:0">
      <img src="${r.file}" style="width:100%;image-rendering:pixelated;border:1px solid #333;border-radius:6px"/>
      <figcaption style="font:11px monospace;color:#ccc;margin-top:3px;line-height:1.5">
        <div style="color:#fff">${r.preset} · ${r.seed}</div>
        ${badge('dangle', m.danglingEndsPct.toFixed(0) + '%', m.danglingEndsPct < 25)}
        ${badge('grid', m.gridCoherence.toFixed(2), true)}
        ${badge('water', m.waterPct.toFixed(0) + '%', true)}
      </figcaption>
    </figure>`;
  })
  .join('\n');
const html = `<!doctype html><meta charset=utf8><title>MetroForge generation grader</title>
<body style="background:#0c0c10;color:#eee;font-family:system-ui;padding:16px">
<h1 style="font-size:18px">Generation grader — ${rows.length} cities</h1>
<p style="color:#888;font:12px monospace">dangle% = local street ends meeting nothing (lower better) · grid = 0..1 rectilinear coherence · water% = water coverage</p>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px">${cards}</div>
</body>`;
writeFileSync('grader/report.html', html);
console.log(`\nWrote grader/report.html (${rows.length} cities)\n`);
