/**
 * WebGL renderer (PixiJS v8). Static city layers are baked once and re-baked
 * only on change; per-frame work is vehicles, agents, ghost, and camera.
 * Reads snapshots only — never touches sim state.
 */
import { Application, Container, Graphics, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import type { DemandPayload, FieldsPayload, FrameSnapshot, StaticCity, TrafficPayload, UiState } from '@host/protocol';
import type { TransitMode } from '@core/types';
import { PALETTE as PAL, MODE_COLOR, mix } from './palette';

const MODE_STATION_COLOR: Record<TransitMode, number> = MODE_COLOR;

export type OverlayMode = 'none' | 'density' | 'value' | 'coverage' | 'nimby' | 'traffic' | 'unserved';

export interface GhostState {
  kind: 'none' | 'station' | 'track' | 'route';
  points: { x: number; y: number }[];
  valid: boolean;
  cost: number | null;
  mode: TransitMode;
}

export interface RendererCallbacks {
  onClickWorld: (x: number, y: number, shift: boolean) => void;
  onRightClick: () => void;
  onHoverWorld: (x: number, y: number) => void;
}

export class GameRenderer {
  private app = new Application();
  private world = new Container();
  private groundSprite: Sprite | null = null;
  private detailSprite: TilingSprite | null = null;
  private detailTex: Texture | null = null;
  private roadsG = new Graphics();
  private localRoadsG = new Graphics();
  private buildingsG = new Graphics();
  private tracksG = new Graphics();
  private routesG = new Graphics();
  private stationsG = new Graphics();
  private labels = new Container();
  private mapLabels = new Container();
  private mapLabelItems: { t: Text; imp: number; kind: string }[] = [];
  private overlaySprite: Sprite | null = null;
  private coverageG = new Graphics();
  private trafficRoadsG = new Graphics();
  private demandG = new Graphics();
  private hotspotsG = new Graphics();
  private overlayMode: OverlayMode = 'none';
  private traffic: TrafficPayload | null = null;
  private demand: DemandPayload | null = null;
  private flowG = new Graphics();
  private vehiclesG = new Graphics();
  private agentsG = new Graphics();
  /** per-route polyline + arc-length table, for animating passenger-flow motes */
  private routePaths: { color: number | string; pts: number[]; cum: number[]; total: number; ridership: number }[] = [];
  private ghostG = new Graphics();

  private city: StaticCity | null = null;
  private ui: UiState | null = null;
  private lastFieldsVersion = -1;
  private fieldsPayload: FieldsPayload | null = null;
  private frame: FrameSnapshot | null = null;
  ghost: GhostState = { kind: 'none', points: [], valid: true, cost: null, mode: 'bus' };

  // camera
  private scale = 0.09;
  private targetScale = 0.09; // eased toward for buttery zoom
  private zoomFocus = { x: 0, y: 0 }; // screen point to zoom about
  private cx = 0;
  private cy = 0;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private pointerDownAt = { x: 0, y: 0 };
  private clock = 0; // ms, drives overlay pulse animation

  callbacks: Partial<RendererCallbacks> = {};

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: PAL.void,
      antialias: true,
      preference: 'webgl',
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    host.appendChild(this.app.canvas);
    this.world.addChild(this.localRoadsG, this.buildingsG, this.roadsG, this.trafficRoadsG, this.tracksG, this.routesG, this.coverageG, this.demandG, this.hotspotsG, this.flowG, this.mapLabels, this.stationsG, this.labels, this.vehiclesG, this.agentsG, this.ghostG);
    this.app.stage.addChild(this.world);
    this.attachInput(this.app.canvas);
    this.app.ticker.add(() => this.tick());
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
  }

  // ── data ingestion ─────────────────────────────────────────────────────────

  setStaticCity(city: StaticCity): void {
    this.city = city;
    this.drawRoads();
    this.buildMapLabels();
    this.scale = Math.min(this.app.screen.width, this.app.screen.height) / city.worldSize * 0.95;
    this.targetScale = this.scale;
    this.cx = 0;
    this.cy = 0;
  }

  setFields(payload: FieldsPayload): void {
    if (!this.city || payload.version === this.lastFieldsVersion) return;
    this.lastFieldsVersion = payload.version;
    this.fieldsPayload = payload;
    this.bakeGround(payload);
    this.drawBuildings();
    if (this.overlayMode !== 'none') this.bakeOverlay();
  }

  setTraffic(payload: TrafficPayload): void {
    this.traffic = payload;
    if (this.overlayMode === 'traffic') this.bakeOverlay();
  }

  setDemand(payload: DemandPayload): void {
    this.demand = payload;
    if (this.overlayMode === 'unserved') this.bakeOverlay();
  }

  setUi(ui: UiState): void {
    const prev = this.ui;
    this.ui = ui;
    const structureChanged =
      !prev ||
      prev.tracks.length !== ui.tracks.length ||
      prev.routes.length !== ui.routes.length ||
      prev.stations.length !== ui.stations.length ||
      JSON.stringify(prev.routes.map((r) => [r.id, r.color, r.stationIds])) !==
        JSON.stringify(ui.routes.map((r) => [r.id, r.color, r.stationIds]));
    if (structureChanged) {
      this.drawTracks();
      this.drawRoutes();
      if (this.overlayMode === 'coverage') {
        this.overlayMode = 'none'; // force rebake with fresh stations
        this.setOverlay('coverage');
      }
    }
    // stations redraw every update so crowding color tracks live ridership
    if (ui.stations.length > 0 || structureChanged) this.drawStations();
  }

  setFrame(snapshot: FrameSnapshot): void {
    this.frame = snapshot;
  }

  setGhost(g: GhostState): void {
    this.ghost = g;
  }

  setOverlay(mode: OverlayMode): void {
    if (mode === this.overlayMode) return;
    this.overlayMode = mode;
    this.bakeOverlay();
  }

  /** Data overlays: heatmap sprite for field layers, circles for coverage. */
  private bakeOverlay(): void {
    const city = this.city;
    const f = this.fieldsPayload;
    this.coverageG.clear();
    this.trafficRoadsG.clear();
    this.demandG.clear();
    if (this.overlaySprite) {
      this.overlaySprite.visible = false;
    }
    if (!city || !f || this.overlayMode === 'none') return;

    if (this.overlayMode === 'unserved') {
      this.bakeDemand();
      return;
    }

    if (this.overlayMode === 'coverage') {
      const ui = this.ui;
      if (!ui) return;
      const walkR: Record<string, number> = { bus: 450, tram: 600, metro: 800, rail: 1000 };
      for (const st of ui.stations) {
        this.coverageG.circle(st.x, st.y, walkR[st.mode] ?? 500);
        this.coverageG.fill({ color: 0x30c48d, alpha: 0.18 });
        this.coverageG.circle(st.x, st.y, walkR[st.mode] ?? 500);
        this.coverageG.stroke({ width: 8, color: 0x30c48d, alpha: 0.5 });
      }
      return;
    }

    if (this.overlayMode === 'traffic') {
      this.bakeTrafficRoads();
      return;
    }

    const W = city.fieldW;
    const H = city.fieldH;
    const PX = 4;
    const canvas = document.createElement('canvas');
    canvas.width = W * PX;
    canvas.height = H * PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(W * PX, H * PX);
    const data = img.data;
    let src: Float32Array;
    let color: [number, number, number];
    if (this.overlayMode === 'density') {
      src = f.population;
      color = [255, 170, 40];
    } else if (this.overlayMode === 'value') {
      src = f.landValue;
      color = [80, 170, 255];
    } else {
      src = new Float32Array(W * H);
      // nimby stored 0..100; reuse landValue scale trick below via max
      for (let i = 0; i < src.length; i++) src[i] = 0;
      color = [255, 90, 90];
    }
    // note: nimby field isn't shipped in the payload yet; approximate with
    // high-value low-density cells (same rule the sim uses)
    let max = 1e-6;
    const val = (i: number): number => {
      if (this.overlayMode === 'nimby') {
        const lv = f.landValue[i] as number;
        const pop = f.population[i] as number;
        return lv > 1.1 && pop < 40 ? lv - 1 : 0;
      }
      return src[i] as number;
    };
    for (let i = 0; i < W * H; i++) max = Math.max(max, val(i));
    for (let py = 0; py < H * PX; py++) {
      for (let px = 0; px < W * PX; px++) {
        const i = Math.floor(py / PX) * W + Math.floor(px / PX);
        const t = Math.pow(val(i) / max, 0.6);
        const o = (py * W * PX + px) * 4;
        data[o] = color[0];
        data[o + 1] = color[1];
        data[o + 2] = color[2];
        data[o + 3] = Math.round(t * 175);
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = Texture.from(canvas);
    if (this.overlaySprite) {
      this.overlaySprite.texture.destroy(true);
      this.overlaySprite.texture = tex;
      this.overlaySprite.visible = true;
    } else {
      this.overlaySprite = new Sprite(tex);
      // insert just under the coverage layer so it sits above roads/buildings
      const idx = this.world.getChildIndex(this.coverageG);
      this.world.addChildAt(this.overlaySprite, idx);
    }
    this.overlaySprite.x = city.originX;
    this.overlaySprite.y = city.originY;
    this.overlaySprite.width = W * city.cellSize;
    this.overlaySprite.height = H * city.cellSize;
  }

  /** Traffic overlay: color the actual congested streets (crisp, never over
   *  water), green (free flow) → amber → red (gridlock). Sampled from the
   *  congestion field along each road. */
  private bakeTrafficRoads(): void {
    const city = this.city;
    const t = this.traffic;
    const g = this.trafficRoadsG;
    g.clear();
    if (!city || !t) return;
    const congAt = (x: number, y: number): number => {
      const cx = Math.floor((x - t.originX) / t.cellSize);
      const cy = Math.floor((y - t.originY) / t.cellSize);
      if (cx < 0 || cy < 0 || cx >= t.w || cy >= t.h) return 0;
      return t.values[cy * t.w + cx] as number;
    };
    const ramp = (v: number): number => {
      // green → amber → red
      let r: number, gr: number, b: number;
      if (v < 0.5) { const k = v / 0.5; r = 90 + k * 165; gr = 200 - k * 40; b = 90 - k * 50; }
      else { const k = (v - 0.5) / 0.5; r = 255; gr = 160 - k * 130; b = 40; }
      return (Math.round(r) << 16) | (Math.round(gr) << 8) | Math.round(b);
    };
    const rs = city.roadScale ?? 1;
    // draw each road segment tinted by the congestion at its midpoint; only
    // segments with real load light up, so free-flowing streets stay dark.
    for (const road of city.roads) {
      if (road.cls === 'local') continue; // arterials/collectors carry the traffic
      const p = road.points;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i] as number, ay = p[i + 1] as number;
        const bx = p[i + 2] as number, by = p[i + 3] as number;
        const v = congAt((ax + bx) / 2, (ay + by) / 2);
        if (v < 0.12) continue;
        const w = (road.cls === 'arterial' ? 34 : 22) * rs * (0.7 + v * 0.6);
        g.moveTo(ax, ay);
        g.lineTo(bx, by);
        g.stroke({ width: w * 1.7, color: ramp(v), alpha: 0.12 * v, cap: 'round' }); // glow
        g.moveTo(ax, ay);
        g.lineTo(bx, by);
        g.stroke({ width: w, color: ramp(v), alpha: 0.55 + v * 0.4, cap: 'round' });
      }
    }
  }

  /** Unserved-demand overlay: glowing desire lines between origin/destination
   *  centroids of trips that mostly drive because transit serves them poorly.
   *  Thicker + brighter = more people you could be carrying. */
  private bakeDemand(): void {
    const g = this.demandG;
    g.clear();
    const d = this.demand;
    if (!d || d.lines.length === 0 || d.maxWeight <= 0) return;
    for (const l of d.lines) {
      const t = Math.min(1, l.weight / d.maxWeight);
      if (t < 0.05) continue;
      const width = 2 + t * 10;
      // amber (small gap) → hot pink/red (big gap you're missing)
      const color = t > 0.6 ? 0xff2d78 : t > 0.3 ? 0xff6b3d : 0xffb020;
      // soft halo then a brighter core
      g.moveTo(l.x1, l.y1); g.lineTo(l.x2, l.y2);
      g.stroke({ width: width * 2, color, alpha: 0.12 + t * 0.12, cap: 'round' });
      g.moveTo(l.x1, l.y1); g.lineTo(l.x2, l.y2);
      g.stroke({ width, color, alpha: 0.4 + t * 0.4, cap: 'round' });
      // endpoint dots
      g.circle(l.x1, l.y1, width * 0.6); g.fill({ color, alpha: 0.6 });
      g.circle(l.x2, l.y2, width * 0.6); g.fill({ color, alpha: 0.6 });
    }
  }

  // ── coordinate transforms ──────────────────────────────────────────────────

  worldToScreen(x: number, y: number): { x: number; y: number } {
    return {
      x: (x - this.cx) * this.scale + this.app.screen.width / 2,
      y: (y - this.cy) * this.scale + this.app.screen.height / 2,
    };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.app.screen.width / 2) / this.scale + this.cx,
      y: (sy - this.app.screen.height / 2) / this.scale + this.cy,
    };
  }

  // ── input ──────────────────────────────────────────────────────────────────

  private attachInput(canvas: HTMLCanvasElement): void {
    canvas.style.touchAction = 'none'; // we own all gestures
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // multi-pointer tracking: 1 pointer = pan/click, 2 pointers = pinch zoom
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;

    const clampCam = (): void => {
      const half = (this.city?.worldSize ?? 12000) / 2;
      this.cx = Math.max(-half, Math.min(half, this.cx));
      this.cy = Math.max(-half, Math.min(half, this.cy));
    };

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        this.dragging = true;
        this.pointerDownAt = { x: e.clientX, y: e.clientY };
        this.lastPointer = { x: e.clientX, y: e.clientY };
      } else if (pointers.size === 2) {
        this.dragging = false; // switch to pinch
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(b!.x - a!.x, b!.y - a!.y);
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const distNow = Math.hypot(b!.x - a!.x, b!.y - a!.y);
        const midX = (a!.x + b!.x) / 2 - rect.left;
        const midY = (a!.y + b!.y) / 2 - rect.top;
        if (pinchDist > 0 && distNow > 0) {
          const before = this.screenToWorld(midX, midY);
          this.scale = Math.max(0.03, Math.min(2.5, this.scale * (distNow / pinchDist)));
          this.targetScale = this.scale; // pinch is direct; keep the easer in sync
          const after = this.screenToWorld(midX, midY);
          this.cx += before.x - after.x;
          this.cy += before.y - after.y;
          clampCam();
        }
        pinchDist = distNow;
        return;
      }
      const w = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      this.callbacks.onHoverWorld?.(w.x, w.y);
      if (this.dragging) {
        this.cx -= (e.clientX - this.lastPointer.x) / this.scale;
        this.cy -= (e.clientY - this.lastPointer.y) / this.scale;
        clampCam();
      }
      this.lastPointer = { x: e.clientX, y: e.clientY };
    });
    const endPointer = (e: PointerEvent): void => {
      const wasPinching = pointers.size >= 2;
      pointers.delete(e.pointerId);
      this.dragging = false;
      pinchDist = 0;
      if (wasPinching) return; // no click at the end of a pinch
      const moved = Math.hypot(e.clientX - this.pointerDownAt.x, e.clientY - this.pointerDownAt.y);
      if (e.type === 'pointerup' && moved < 8) {
        const rect = canvas.getBoundingClientRect();
        const w = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        if (e.button === 2) this.callbacks.onRightClick?.();
        else this.callbacks.onClickWorld?.(w.x, w.y, e.shiftKey);
      }
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        // set a zoom target about the cursor; tick() eases toward it
        this.zoomFocus = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
        this.targetScale = Math.max(0.03, Math.min(2.5, this.targetScale * factor));
      },
      { passive: false },
    );
  }

  // ── baking static layers ───────────────────────────────────────────────────

  private bakeGround(f: FieldsPayload): void {
    const city = this.city;
    if (!city) return;
    // pixels per field cell in the baked texture — as high as the 4096 texture
    // limit allows, so the ground stays sharp when zoomed in
    const PX = Math.min(34, Math.max(14, Math.floor(3900 / Math.max(city.fieldW, city.fieldH))));
    // real-city high-res masks give crisp coastlines/parks instead of the coarse,
    // box-blurred field grid. Bilinear over the 0/1 mask → smooth but sharp edges.
    const hiRes = city.maskRes ?? 0;
    const hiHalf = city.worldSize / 2;
    const sampleMask = (m: Uint8Array, wx: number, wy: number): number => {
      const gx = ((wx + hiHalf) / city.worldSize) * hiRes - 0.5;
      const gy = ((wy + hiHalf) / city.worldSize) * hiRes - 0.5;
      const x0 = Math.max(0, Math.min(hiRes - 1, Math.floor(gx)));
      const y0 = Math.max(0, Math.min(hiRes - 1, Math.floor(gy)));
      const x1 = Math.min(hiRes - 1, x0 + 1);
      const y1 = Math.min(hiRes - 1, y0 + 1);
      const tx = Math.max(0, Math.min(1, gx - x0));
      const ty = Math.max(0, Math.min(1, gy - y0));
      const v00 = m[y0 * hiRes + x0] as number;
      const v10 = m[y0 * hiRes + x1] as number;
      const v01 = m[y1 * hiRes + x0] as number;
      const v11 = m[y1 * hiRes + x1] as number;
      return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
    };
    const hiWater = city.waterMask ?? null;
    const hiPark = city.parkMask ?? null;
    const hiBuilding = city.buildingMask ?? null;
    const canvas = document.createElement('canvas');
    canvas.width = city.fieldW * PX;
    canvas.height = city.fieldH * PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let maxPop = 1;
    for (let i = 0; i < f.population.length; i++) maxPop = Math.max(maxPop, f.population[i] as number);
    const W = city.fieldW;
    const H = city.fieldH;
    const isWater = (cx: number, cy: number): boolean =>
      cx >= 0 && cy >= 0 && cx < W && cy < H && (f.water[cy * W + cx] as number) === 1;
    // stable per-cell hash for forest/texture variation
    const hash = (x: number, y: number): number => {
      let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };

    // per-pixel bilinear sampling → smooth shorelines and gradients
    const bil = (arr: Float32Array | Uint8Array, fx: number, fy: number): number => {
      const x0 = Math.max(0, Math.min(W - 1, Math.floor(fx)));
      const y0 = Math.max(0, Math.min(H - 1, Math.floor(fy)));
      const x1 = Math.min(W - 1, x0 + 1);
      const y1 = Math.min(H - 1, y0 + 1);
      const tx = Math.max(0, Math.min(1, fx - x0));
      const ty = Math.max(0, Math.min(1, fy - y0));
      const v00 = arr[y0 * W + x0] as number;
      const v10 = arr[y0 * W + x1] as number;
      const v01 = arr[y1 * W + x0] as number;
      const v11 = arr[y1 * W + x1] as number;
      return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
    };
    void isWater;
    // pre-smooth the binary water mask so shorelines curve instead of stair-step
    let wsm = Float32Array.from(f.water);
    for (let pass = 0; pass < 2; pass++) {
      const next = new Float32Array(wsm.length);
      for (let cy = 0; cy < H; cy++) {
        for (let cx = 0; cx < W; cx++) {
          let sum = 0;
          let cnt = 0;
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              const nx = cx + ox;
              const ny = cy + oy;
              if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
              sum += wsm[ny * W + nx] as number;
              cnt++;
            }
          }
          next[cy * W + cx] = sum / cnt;
        }
      }
      wsm = next;
    }

    const img = ctx.createImageData(W * PX, H * PX);
    const data = img.data;
    for (let py = 0; py < H * PX; py++) {
      for (let px = 0; px < W * PX; px++) {
        const fx = px / PX - 0.5;
        const fy = py / PX - 0.5;
        const wxw = city.originX + (px / PX) * city.cellSize;
        const wyw = city.originY + (py / PX) * city.cellSize;
        const wf = hiWater ? sampleMask(hiWater, wxw, wyw) : bil(wsm, fx, fy); // 0..1 water
        let r: number, g: number, b: number;
        if (wf > 0.5) {
          // clean flat water — a touch lighter at the shore, no noise
          const shallow = Math.max(0, Math.min(1, 1 - (wf - 0.5) / 0.22));
          const col = mix(PAL.waterDeep, PAL.waterShallow, shallow);
          r = col[0]; g = col[1]; b = col[2];
        } else {
          const park = hiPark ? sampleMask(hiPark, wxw, wyw) : bil(f.parks, fx, fy);
          // FLAT land base — no procedural-density tint (that noisy field caused the
          // soft blobs). Structure comes from the real, crisp building + park masks.
          let col: [number, number, number] = [PAL.land[0], PAL.land[1], PAL.land[2]];
          // real building fabric — sharpened mask edge so blocks read as crisp blocks
          if (hiBuilding && park < 0.4) {
            const bfs = Math.max(0, Math.min(1, (sampleMask(hiBuilding, wxw, wyw) - 0.3) / 0.25));
            if (bfs > 0) col = mix(col, PAL.building, bfs);
          }
          // parks — only solid green space (not scattered tree patches), crisp edge
          if (park > 0.35) col = mix(col, PAL.park, Math.max(0, Math.min(1, (park - 0.35) / 0.2)));
          // a thin luminous shore line just landward of the water
          if (wf > 0.42) col = mix(col, PAL.shoreLine, Math.min(1, (wf - 0.42) / 0.08) * 0.4);
          const grain = (hash(px, py) - 0.5) * 2;
          r = col[0] + grain; g = col[1] + grain; b = col[2] + grain;
        }
        const o = (py * W * PX + px) * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    const tex = Texture.from(canvas);
    if (this.groundSprite) {
      this.groundSprite.texture.destroy(true);
      this.groundSprite.texture = tex;
    } else {
      this.groundSprite = new Sprite(tex);
      this.world.addChildAt(this.groundSprite, 0);
    }
    this.groundSprite.x = city.originX;
    this.groundSprite.y = city.originY;
    this.groundSprite.width = city.fieldW * city.cellSize;
    this.groundSprite.height = city.fieldH * city.cellSize;
    this.ensureDetail(city);
  }

  /** A fine, world-fixed tiling grain over the ground — real texture that stays
   *  crisp at any zoom (unlike the baked sprite, which blurs when you zoom in). */
  private ensureDetail(city: StaticCity): void {
    if (!this.detailTex) {
      const S = 256;
      const cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      const img = ctx.createImageData(S, S);
      const d = img.data;
      const h = (x: number, y: number): number => {
        let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
        n = Math.imul(n ^ (n >>> 13), 1274126177);
        return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
      };
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const o = (y * S + x) * 4;
          const v = h(x, y);
          // sparse light + dark specks, mostly transparent → a stipple grain
          if (v > 0.72) { d[o] = 210; d[o + 1] = 208; d[o + 2] = 196; d[o + 3] = Math.round((v - 0.72) * 130); }
          else if (v < 0.24) { d[o] = 0; d[o + 1] = 0; d[o + 2] = 0; d[o + 3] = Math.round((0.24 - v) * 150); }
          else { d[o + 3] = 0; }
        }
      }
      ctx.putImageData(img, 0, 0);
      this.detailTex = Texture.from(cv);
    }
    const w = city.fieldW * city.cellSize;
    const hgt = city.fieldH * city.cellSize;
    if (!this.detailSprite) {
      this.detailSprite = new TilingSprite({ texture: this.detailTex, width: w, height: hgt });
      this.detailSprite.tileScale.set(0.42); // finer grain
      this.detailSprite.alpha = 0.3;
      const idx = this.groundSprite ? this.world.getChildIndex(this.groundSprite) + 1 : 1;
      this.world.addChildAt(this.detailSprite, idx);
    }
    this.detailSprite.x = city.originX;
    this.detailSprite.y = city.originY;
    this.detailSprite.width = w;
    this.detailSprite.height = hgt;
  }

  private drawRoads(): void {
    const city = this.city;
    if (!city) return;
    const g = this.roadsG;
    g.clear();
    const lg = this.localRoadsG;
    lg.clear();
    const rs = city.roadScale ?? 1;
    // local streets: single dark pass on their own layer (LOD-faded in tick)
    for (const road of city.roads) {
      if (road.cls !== 'local') continue;
      const pts = road.points;
      if (pts.length < 4) continue;
      lg.moveTo(pts[0] as number, pts[1] as number);
      for (let i = 2; i < pts.length; i += 2) lg.lineTo(pts[i] as number, pts[i + 1] as number);
    }
    lg.stroke({ width: 13 * rs, color: PAL.roadLocal, cap: 'round' });

    const classes: { cls: string; casing: number; fill: number; casingColor: number; fillColor: number }[] = [
      { cls: 'collector', casing: 30, fill: 20, casingColor: PAL.roadCasing, fillColor: PAL.roadCollector },
      { cls: 'arterial', casing: 54, fill: 40, casingColor: PAL.roadCasing, fillColor: PAL.roadArterial },
    ];
    for (const spec of classes) {
      for (const pass of ['casing', 'fill'] as const) {
        const width = (pass === 'casing' ? spec.casing : spec.fill) * rs;
        for (const road of city.roads) {
          if (road.cls !== spec.cls) continue;
          const pts = road.points;
          if (pts.length < 4) continue;
          g.moveTo(pts[0] as number, pts[1] as number);
          for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i] as number, pts[i + 1] as number);
        }
        g.stroke({
          width,
          color: pass === 'casing' ? spec.casingColor : spec.fillColor,
          cap: 'round',
          join: 'round',
        });
      }
    }
    this.drawBuildings();
  }

  /** Building fabric: deterministic rectangles along local streets. Presentation only. */
  private drawBuildings(): void {
    const city = this.city;
    if (!city) return;
    const g = this.buildingsG;
    g.clear();
    // real cities render their building fabric from the baked mask (in bakeGround);
    // skip the procedural squares entirely.
    if (city.buildingMask) return;
    // cheap coordinate hash → stable pseudo-random per lot
    const hash = (x: number, y: number): number => {
      let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    // muted, desaturated building fabric that sits quietly on the dark canvas
    const housePalette = [0x3b3f3a, 0x41453d, 0x373b37, 0x45493f, 0x3d413a];
    const towerPalette = [0x474d55, 0x50565f, 0x434952, 0x565c66];
    const aptPalette = [0x4a463e, 0x433f38, 0x4f4a41, 0x454037];
    const f = this.fieldsPayload;
    // ── Road clearance: keep building footprints off the carriageway. Each road
    // class carries a keep-out radius (half its drawn width + a footpath margin).
    // Lots whose centre falls inside any road's keep-out are rejected, so nothing
    // is ever drawn sitting on a street. ──
    const rs = city.roadScale ?? 1;
    const CLEAR_CELL = 64;
    const clearMap = new Map<number, { x: number; y: number; rad: number }[]>();
    const roadRadius: Record<string, number> = { arterial: 40 * rs, collector: 28 * rs, local: 12 * rs };
    const ckey = (x: number, y: number): number => Math.floor(x / CLEAR_CELL) * 73856093 + Math.floor(y / CLEAR_CELL) * 19349663;
    const addClear = (x: number, y: number, rad: number): void => {
      const k = ckey(x, y);
      const arr = clearMap.get(k);
      if (arr) arr.push({ x, y, rad });
      else clearMap.set(k, [{ x, y, rad }]);
    };
    for (const road of city.roads) {
      const rad = roadRadius[road.cls] ?? 14;
      const rp = road.points;
      for (let i = 0; i + 3 < rp.length; i += 2) {
        const x1 = rp[i] as number;
        const y1 = rp[i + 1] as number;
        const x2 = rp[i + 2] as number;
        const y2 = rp[i + 3] as number;
        const segLen = Math.hypot(x2 - x1, y2 - y1);
        for (let d = 0; d <= segLen; d += 24) {
          const t = segLen > 0 ? d / segLen : 0;
          addClear(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, rad);
        }
      }
    }
    // reject if the lot centre (with its own half-extent) intrudes on any road
    const onRoad = (x: number, y: number, half: number): boolean => {
      const cx0 = Math.floor(x / CLEAR_CELL);
      const cy0 = Math.floor(y / CLEAR_CELL);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const arr = clearMap.get((cx0 + ox) * 73856093 + (cy0 + oy) * 19349663);
          if (!arr) continue;
          for (const s of arr) {
            const rr = s.rad + half;
            if ((s.x - x) * (s.x - x) + (s.y - y) * (s.y - y) < rr * rr) return true;
          }
        }
      }
      return false;
    };
    // ── Footprint occupancy: no two buildings overlap (kills the "heap" look). ──
    const OCC_CELL = 16;
    const occupied = new Set<number>();
    const claim = (x: number, y: number, half: number): boolean => {
      const r = Math.max(0, Math.ceil(half / OCC_CELL));
      const cx0 = Math.floor(x / OCC_CELL);
      const cy0 = Math.floor(y / OCC_CELL);
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          if (occupied.has((cx0 + ox) * 73856093 + (cy0 + oy) * 19349663)) return false;
        }
      }
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) occupied.add((cx0 + ox) * 73856093 + (cy0 + oy) * 19349663);
      }
      return true;
    };
    // sample land use to size buildings: towers where jobs dominate, houses elsewhere
    const landUseAt = (x: number, y: number): { jobs: number; pop: number } => {
      if (!f) return { jobs: 0, pop: 0 };
      const cx2 = Math.max(0, Math.min(city.fieldW - 1, Math.floor((x - city.originX) / city.cellSize)));
      const cy2 = Math.max(0, Math.min(city.fieldH - 1, Math.floor((y - city.originY) / city.cellSize)));
      const i = cy2 * city.fieldW + cx2;
      return { jobs: f.jobs[i] as number, pop: f.population[i] as number };
    };
    for (const road of city.roads) {
      if (road.cls !== 'local') continue;
      const pts = road.points;
      if (pts.length < 4) continue;
      // curved polylines: place lots per segment
      for (let si = 0; si + 3 < pts.length; si += 2) {
      const ax = pts[si] as number;
      const ay = pts[si + 1] as number;
      const bx = pts[si + 2] as number;
      const by = pts[si + 3] as number;
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 40) continue;
      const ux = (bx - ax) / len;
      const uy = (by - ay) / len;
      const nx = -uy;
      const ny = ux;
      for (let d = 22; d < len - 22; d += 34) {
        const px = ax + ux * d;
        const py = ay + uy * d;
        const use = landUseAt(px, py);
        const towerness = Math.min(1, use.jobs / 60); // CBD cells run 100+ jobs
        const resDensity = Math.min(1, use.pop / 55); // dense residential cells run 60+
        for (const side of [-1, 1]) {
          const r = hash(px * side, py + side);
          // building typology by land use — this is how you read where people live
          let w: number;
          let h: number;
          let pal: number[];
          let shadow = false;
          if (towerness > 0.45) {
            // office/commercial tower
            if (r < 0.12) continue;
            w = 24 + ((r * 7919) % 1) * 16;
            h = 22 + ((r * 104729) % 1) * 16;
            pal = towerPalette;
            shadow = true;
          } else if (resDensity > 0.55) {
            // apartment block: big, brick-toned, tightly packed
            if (r < 0.15) continue;
            w = 22 + ((r * 7919) % 1) * 10;
            h = 16 + ((r * 104729) % 1) * 10;
            pal = aptPalette;
            shadow = true;
          } else if (resDensity > 0.25) {
            // rowhouse strip: medium, warm
            if (r < 0.28) continue;
            w = 15 + ((r * 7919) % 1) * 7;
            h = 11 + ((r * 104729) % 1) * 6;
            pal = housePalette;
          } else {
            // detached house: small and sparse
            if (r < 0.5) continue;
            w = 8 + ((r * 7919) % 1) * 5;
            h = 8 + ((r * 104729) % 1) * 4;
            pal = housePalette;
          }
          const setback = 20 + r * 8;
          const cxp = px + nx * side * (setback + h / 2);
          const cyp = py + ny * side * (setback + h / 2);
          const hw = w / 2;
          const hh = h / 2;
          const half = Math.max(hw, hh);
          if (onRoad(cxp, cyp, half)) continue; // never spill onto a street
          if (!claim(cxp, cyp, half)) continue; // no overlapping footprints
          const quad = (offX: number, offY: number): number[] => [
            cxp + offX - ux * hw - nx * hh, cyp + offY - uy * hw - ny * hh,
            cxp + offX + ux * hw - nx * hh, cyp + offY + uy * hw - ny * hh,
            cxp + offX + ux * hw + nx * hh, cyp + offY + uy * hw + ny * hh,
            cxp + offX - ux * hw + nx * hh, cyp + offY - uy * hw + ny * hh,
          ];
          if (shadow) {
            g.poly(quad(5, 7));
            g.fill({ color: 0x000000, alpha: 0.22 });
          }
          g.poly(quad(0, 0));
          g.fill({ color: pal[(r * pal.length) | 0] ?? 0x5c554a });
        }
      }
      }
    }
  }

  private drawTracks(): void {
    const ui = this.ui;
    const g = this.tracksG;
    g.clear();
    if (!ui) return;
    for (const t of ui.tracks) {
      const pts = t.points;
      if (pts.length < 4) continue;
      g.moveTo(pts[0] as number, pts[1] as number);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i] as number, pts[i + 1] as number);
      // subtle infrastructure line under the bold route; the route is the hero
      g.stroke({
        width: t.mode === 'bus' ? 5 : 8,
        color: MODE_STATION_COLOR[t.mode],
        alpha: t.grade === 'tunnel' ? 0.18 : 0.28,
        cap: 'round',
        join: 'round',
      });
    }
  }

  private drawRoutes(): void {
    const ui = this.ui;
    const g = this.routesG;
    g.clear();
    if (!ui) return;
    const stationById = new Map(ui.stations.map((s) => [s.id, s]));
    // track geometry keyed by station pair (both directions) so routes follow the
    // real road/rail path instead of cutting straight across the map
    const trackByPair = new Map<string, number[]>();
    for (const t of ui.tracks) {
      trackByPair.set(`${t.fromStationId}:${t.toStationId}`, t.points);
      const rev: number[] = [];
      for (let i = t.points.length - 2; i >= 0; i -= 2) rev.push(t.points[i] as number, t.points[i + 1] as number);
      trackByPair.set(`${t.toStationId}:${t.fromStationId}`, rev);
    }
    const strokePath = (path: number[], w: number, color: number | string, alpha: number): void => {
      g.moveTo(path[0] as number, path[1] as number);
      for (let i = 2; i < path.length; i += 2) g.lineTo(path[i] as number, path[i + 1] as number);
      g.stroke({ width: w, color, alpha, cap: 'round', join: 'round' });
    };
    this.routePaths = [];
    for (const r of ui.routes) {
      const path: number[] = [];
      for (let i = 0; i + 1 < r.stationIds.length; i++) {
        const a = r.stationIds[i] as number;
        const b = r.stationIds[i + 1] as number;
        const seg = trackByPair.get(`${a}:${b}`);
        if (seg && seg.length >= 4) {
          if (path.length === 0) path.push(seg[0] as number, seg[1] as number);
          for (let j = 2; j < seg.length; j += 2) path.push(seg[j] as number, seg[j + 1] as number);
        } else {
          const sa = stationById.get(a);
          const sb = stationById.get(b);
          if (sa && sb) {
            if (path.length === 0) path.push(sa.x, sa.y);
            path.push(sb.x, sb.y);
          }
        }
      }
      if (path.length < 4) continue;
      // hero treatment: soft glow → dark casing → bright line
      strokePath(path, 44, r.color, 0.08);
      strokePath(path, 28, r.color, 0.16);
      strokePath(path, 22, PAL.void, 0.9);
      strokePath(path, 12, r.color, 1);
      // arc-length table for animated passenger-flow motes (drawn per-frame)
      const cum: number[] = [0];
      let total = 0;
      for (let i = 2; i < path.length; i += 2) {
        total += Math.hypot((path[i] as number) - (path[i - 2] as number), (path[i + 1] as number) - (path[i - 1] as number));
        cum.push(total);
      }
      this.routePaths.push({ color: r.color, pts: path, cum, total, ridership: r.dailyRidership });
    }
  }

  /** Point at arc-length d along a stored route polyline. */
  private pointAlongRoute(rp: { pts: number[]; cum: number[]; total: number }, d: number): { x: number; y: number } {
    const { pts, cum } = rp;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((cum[mid] as number) < d) lo = mid + 1;
      else hi = mid;
    }
    const seg = Math.max(1, lo);
    const d0 = cum[seg - 1] as number;
    const segLen = (cum[seg] as number) - d0 || 1;
    const t = Math.max(0, Math.min(1, (d - d0) / segLen));
    const ax = pts[(seg - 1) * 2] as number;
    const ay = pts[(seg - 1) * 2 + 1] as number;
    const bx = pts[seg * 2] as number;
    const by = pts[seg * 2 + 1] as number;
    return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
  }

  /** Build zoom-gated map labels (real OSM names) for water / parks / roads. */
  private buildMapLabels(): void {
    this.mapLabels.removeChildren().forEach((c) => c.destroy());
    this.mapLabelItems = [];
    const labels = this.city?.labels;
    if (!labels) return;
    for (const L of labels) {
      const color = L.kind === 'water' ? 0x8ab6d6 : L.kind === 'park' ? 0x8fc2a0 : 0xb4bac1;
      const base = L.kind === 'road' ? 26 : 30 + Math.min(3, L.imp) * 5;
      const t = new Text({
        text: L.name,
        style: {
          fontFamily: 'system-ui, sans-serif',
          fontStyle: L.kind === 'water' ? 'italic' : 'normal',
          fontWeight: L.kind === 'road' ? '500' : '600',
          fontSize: base,
          fill: color,
          stroke: { color: PAL.labelHalo, width: 6 },
          letterSpacing: L.kind === 'water' ? 1.5 : 0.4,
        },
      });
      t.anchor.set(0.5, 0.5);
      t.position.set(L.x, L.y);
      if (L.kind === 'road' && L.angle != null) t.rotation = L.angle;
      t.visible = false;
      this.mapLabels.addChild(t);
      this.mapLabelItems.push({ t, imp: L.imp, kind: L.kind });
    }
  }

  private drawStations(): void {
    const ui = this.ui;
    const g = this.stationsG;
    g.clear();
    this.labels.removeChildren().forEach((c) => c.destroy());
    if (!ui) return;
    const lerpHex = (a: number, b: number, t: number): number => {
      const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
      const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
      return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
    };
    for (const s of ui.stations) {
      // busy stations glow and shift red — a lot of passengers boarding here
      const crowd = Math.max(0, Math.min(1, s.ridership / 2600));
      const color = lerpHex(MODE_STATION_COLOR[s.mode], 0xff453a, crowd * 0.85);
      const size = 30 + s.level * 6;
      // soft glow halo, brighter the busier the station
      g.circle(s.x, s.y, size * (1.7 + crowd * 0.8));
      g.fill({ color, alpha: 0.14 + crowd * 0.24 });
      // distinct shapes per mode
      if (s.mode === 'bus') g.circle(s.x, s.y, size);
      else if (s.mode === 'tram') g.poly([s.x, s.y - size, s.x + size, s.y, s.x, s.y + size, s.x - size, s.y]);
      else if (s.mode === 'metro') g.rect(s.x - size, s.y - size, size * 2, size * 2);
      else {
        const r = size * 1.1;
        const hex: number[] = [];
        for (let k = 0; k < 6; k++) {
          hex.push(s.x + r * Math.cos((k / 6) * Math.PI * 2), s.y + r * Math.sin((k / 6) * Math.PI * 2));
        }
        g.poly(hex);
      }
      g.fill({ color: PAL.station });
      g.stroke({ width: 9, color });

      const label = new Text({
        text: s.name,
        style: { fontFamily: 'system-ui, sans-serif', fontWeight: '600', fontSize: 64, fill: PAL.labelText, stroke: { color: PAL.labelHalo, width: 10 } },
      });
      label.anchor.set(0.5, 0);
      label.x = s.x;
      label.y = s.y + size + 14;
      label.scale.set(0.5);
      this.labels.addChild(label);
    }
  }

  // ── per-frame ──────────────────────────────────────────────────────────────

  private tick(): void {
    this.clock += this.app.ticker.deltaMS;
    // buttery zoom: ease scale toward the target, keeping the focal point fixed
    if (Math.abs(this.scale - this.targetScale) > 1e-5) {
      const f = this.zoomFocus;
      const before = this.screenToWorld(f.x, f.y);
      const k = 1 - Math.pow(0.0006, this.app.ticker.deltaMS / 1000); // frame-rate independent
      this.scale += (this.targetScale - this.scale) * k;
      if (Math.abs(this.scale - this.targetScale) < this.targetScale * 0.001) this.scale = this.targetScale;
      const after = this.screenToWorld(f.x, f.y);
      this.cx += before.x - after.x;
      this.cy += before.y - after.y;
      const half = (this.city?.worldSize ?? 12000) / 2;
      this.cx = Math.max(-half, Math.min(half, this.cx));
      this.cy = Math.max(-half, Math.min(half, this.cy));
    }
    // camera transform
    this.world.scale.set(this.scale);
    this.world.position.set(
      this.app.screen.width / 2 - this.cx * this.scale,
      this.app.screen.height / 2 - this.cy * this.scale,
    );
    this.labels.visible = this.scale > 0.12;
    // map labels: constant on-screen size, revealed by importance as you zoom in,
    // then decluttered so nothing overlaps
    const targetPx = 13;
    const cand: { it: { t: Text; imp: number; kind: string }; sx: number; sy: number; hw: number; hh: number; pri: number }[] = [];
    for (const it of this.mapLabelItems) {
      it.t.visible = false;
      let gate: boolean;
      if (it.kind === 'water') gate = this.scale > (it.imp > 2.4 ? 0.045 : it.imp > 1.4 ? 0.09 : 0.18);
      else if (it.kind === 'park') gate = this.scale > (it.imp > 1.8 ? 0.07 : it.imp > 1.2 ? 0.14 : 0.26);
      else gate = this.scale > (it.imp > 2 ? 0.28 : 0.42);
      if (!gate) continue;
      const base = it.kind === 'road' ? 26 : 30 + Math.min(3, it.imp) * 5;
      const v = targetPx / (base * this.scale);
      it.t.scale.set(v);
      const s = this.worldToScreen(it.t.x, it.t.y);
      const w = it.t.width * v * this.scale;
      const h = it.t.height * v * this.scale;
      cand.push({ it, sx: s.x, sy: s.y, hw: w / 2 + 3, hh: h / 2 + 2, pri: it.imp + (it.kind !== 'road' ? 1.5 : 0) });
    }
    cand.sort((a, b) => b.pri - a.pri);
    const placed: typeof cand = [];
    for (const c of cand) {
      let ok = c.sx > -50 && c.sx < this.app.screen.width + 50 && c.sy > 0 && c.sy < this.app.screen.height;
      for (let i = 0; ok && i < placed.length; i++) {
        const p = placed[i]!;
        if (Math.abs(c.sx - p.sx) < c.hw + p.hw && Math.abs(c.sy - p.sy) < c.hh + p.hh) ok = false;
      }
      if (ok) { c.it.t.visible = true; placed.push(c); }
    }
    // LOD: local streets & buildings fade in as you zoom toward street level
    const lodT = Math.max(0, Math.min(1, (this.scale - 0.075) / 0.09));
    this.localRoadsG.visible = lodT > 0;
    this.localRoadsG.alpha = lodT;
    this.buildingsG.visible = lodT > 0;
    this.buildingsG.alpha = lodT * 0.95;

    // congestion bottleneck markers (Cities-Skyline style pulse) on the traffic layer
    const hg = this.hotspotsG;
    hg.clear();
    if (this.overlayMode === 'traffic' && this.traffic) {
      const phase = (this.clock / 1400) % 1; // 0..1 expanding ring
      for (const h of this.traffic.hotspots) {
        const sev = h.severity;
        const base = 90 + sev * 90;
        const col = sev > 0.8 ? 0xff3b30 : sev > 0.65 ? 0xff7a1a : 0xffb020;
        // expanding pulse ring
        const ringR = base * (0.6 + phase * 1.5);
        hg.circle(h.x, h.y, ringR);
        hg.stroke({ width: 10, color: col, alpha: (1 - phase) * 0.7 });
        // steady core diamond
        hg.poly([h.x, h.y - base * 0.55, h.x + base * 0.55, h.y, h.x, h.y + base * 0.55, h.x - base * 0.55, h.y]);
        hg.fill({ color: col, alpha: 0.85 });
        hg.poly([h.x, h.y - base * 0.55, h.x + base * 0.55, h.y, h.x, h.y + base * 0.55, h.x - base * 0.55, h.y]);
        hg.stroke({ width: 6, color: 0x1a0d0a, alpha: 0.6 });
      }
    }

    // animated passenger-flow motes streaming along the lines (density ∝ ridership)
    const fg = this.flowG;
    fg.clear();
    if (this.scale > 0.05 && this.routePaths.length) {
      const speed = 240; // world units / real second — constant regardless of sim speed
      const tsec = this.clock / 1000;
      const moteR = Math.max(2.5, 5 / Math.sqrt(this.scale)) * 0.55;
      for (const rp of this.routePaths) {
        if (rp.total < 120) continue;
        const count = Math.max(2, Math.min(64, Math.round((rp.total / 340) * (0.4 + Math.min(1.4, rp.ridership / 3500)))));
        for (let i = 0; i < count; i++) {
          const d = ((i / count) * rp.total + tsec * speed) % rp.total;
          const p = this.pointAlongRoute(rp, d);
          fg.circle(p.x, p.y, moteR);
        }
        fg.fill({ color: rp.color, alpha: 0.92 });
      }
    }

    // vehicles
    const vg = this.vehiclesG;
    vg.clear();
    const f = this.frame;
    if (f && this.ui) {
      for (let i = 0; i < f.vehicleCount; i++) {
        const x = f.vehicles[i * 6 + 1] as number;
        const y = f.vehicles[i * 6 + 2] as number;
        const heading = f.vehicles[i * 6 + 3] as number;
        const occ = f.vehicles[i * 6 + 4] as number;
        const colorIdx = f.vehicles[i * 6 + 5] as number;
        const color = f.routeColorOf[colorIdx] ?? '#ffffff';
        const len = 60;
        const wid = 26;
        const cos = Math.cos(heading);
        const sin = Math.sin(heading);
        vg.poly([
          x + cos * len - sin * wid, y + sin * len + cos * wid,
          x + cos * len + sin * wid, y + sin * len - cos * wid,
          x - cos * len + sin * wid, y - sin * len - cos * wid,
          x - cos * len - sin * wid, y - sin * len + cos * wid,
        ]);
        vg.fill({ color });
        if (occ > 0.9) {
          vg.circle(x, y, 40);
          vg.stroke({ width: 8, color: 0xf87171, alpha: 0.9 });
        }
      }

      // passengers: small elegant motes — riders warm, walkers dim
      const ag = this.agentsG;
      ag.clear();
      if (this.scale > 0.07) {
        const r = Math.max(4, 7 / Math.sqrt(this.scale));
        for (let i = 0; i < f.agentCount; i++) {
          const x = f.agents[i * 3] as number;
          const y = f.agents[i * 3 + 1] as number;
          const phase = f.agents[i * 3 + 2] as number;
          ag.circle(x, y, phase === 1 ? r : r * 0.8);
          ag.fill({ color: phase === 1 ? 0xffe8a3 : 0x8b93a0, alpha: phase === 1 ? 0.85 : 0.4 });
        }
      }
    }

    // ghost
    const gg = this.ghostG;
    gg.clear();
    const ghost = this.ghost;
    if (ghost.kind === 'station' && ghost.points.length === 1) {
      const p = ghost.points[0] as { x: number; y: number };
      gg.circle(p.x, p.y, 60);
      gg.stroke({ width: 10, color: ghost.valid ? 0x69db7c : 0xf87171, alpha: 0.9 });
      const walkR: Record<TransitMode, number> = { bus: 450, tram: 600, metro: 800, rail: 1000 };
      gg.circle(p.x, p.y, walkR[ghost.mode]);
      gg.stroke({ width: 4, color: ghost.valid ? 0x69db7c : 0xf87171, alpha: 0.3 });
    } else if ((ghost.kind === 'track' || ghost.kind === 'route') && ghost.points.length >= 2) {
      gg.moveTo((ghost.points[0] as { x: number }).x, (ghost.points[0] as { y: number }).y);
      for (let i = 1; i < ghost.points.length; i++) {
        gg.lineTo((ghost.points[i] as { x: number }).x, (ghost.points[i] as { y: number }).y);
      }
      gg.stroke({ width: 16, color: ghost.valid ? 0xfff3bf : 0xf87171, alpha: 0.7 });
    }
  }
}
