/**
 * WebGL renderer (PixiJS v8). Static city layers are baked once and re-baked
 * only on change; per-frame work is vehicles, agents, ghost, and camera.
 * Reads snapshots only — never touches sim state.
 */
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { FieldsPayload, FrameSnapshot, StaticCity, UiState } from '@host/protocol';
import type { TransitMode } from '@core/types';

const MODE_STATION_COLOR: Record<TransitMode, number> = {
  bus: 0xe8b84a,
  tram: 0x5cc8f0,
  metro: 0xf0716f,
  rail: 0x8ce38f,
};

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
  private roadsG = new Graphics();
  private localRoadsG = new Graphics();
  private buildingsG = new Graphics();
  private tracksG = new Graphics();
  private routesG = new Graphics();
  private stationsG = new Graphics();
  private labels = new Container();
  private vehiclesG = new Graphics();
  private agentsG = new Graphics();
  private ghostG = new Graphics();

  private city: StaticCity | null = null;
  private ui: UiState | null = null;
  private lastFieldsVersion = -1;
  private frame: FrameSnapshot | null = null;
  ghost: GhostState = { kind: 'none', points: [], valid: true, cost: null, mode: 'bus' };

  // camera
  private scale = 0.09;
  private cx = 0;
  private cy = 0;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private pointerDownAt = { x: 0, y: 0 };

  callbacks: Partial<RendererCallbacks> = {};

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: 0x0c0c10,
      antialias: true,
      preference: 'webgl',
    });
    host.appendChild(this.app.canvas);
    this.world.addChild(this.localRoadsG, this.buildingsG, this.roadsG, this.tracksG, this.routesG, this.stationsG, this.labels, this.vehiclesG, this.agentsG, this.ghostG);
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
    this.scale = Math.min(this.app.screen.width, this.app.screen.height) / city.worldSize * 0.95;
    this.cx = 0;
    this.cy = 0;
  }

  setFields(payload: FieldsPayload): void {
    if (!this.city || payload.version === this.lastFieldsVersion) return;
    this.lastFieldsVersion = payload.version;
    this.bakeGround(payload);
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
      this.drawStations();
    }
  }

  setFrame(snapshot: FrameSnapshot): void {
    this.frame = snapshot;
  }

  setGhost(g: GhostState): void {
    this.ghost = g;
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
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const before = this.screenToWorld(sx, sy);
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        this.scale = Math.max(0.03, Math.min(2.5, this.scale * factor));
        const after = this.screenToWorld(sx, sy);
        this.cx += before.x - after.x;
        this.cy += before.y - after.y;
      },
      { passive: false },
    );
  }

  // ── baking static layers ───────────────────────────────────────────────────

  private bakeGround(f: FieldsPayload): void {
    const city = this.city;
    if (!city) return;
    const PX = 6; // pixels per field cell in the baked texture
    const canvas = document.createElement('canvas');
    canvas.width = city.fieldW * PX;
    canvas.height = city.fieldH * PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let maxPop = 1;
    for (let i = 0; i < f.population.length; i++) maxPop = Math.max(maxPop, f.population[i] as number);

    for (let cy = 0; cy < city.fieldH; cy++) {
      for (let cx = 0; cx < city.fieldW; cx++) {
        const i = cy * city.fieldW + cx;
        let r: number, g: number, b: number;
        if ((f.water[i] as number) === 1) {
          r = 16; g = 26; b = 42; // deep water
        } else {
          const elev = f.terrain[i] as number;
          const pop = (f.population[i] as number) / maxPop; // 0..1
          const lv = Math.min(1, (f.landValue[i] as number) / 2);
          // base ground: dark warm gray, slightly lighter with elevation
          r = 26 + elev * 16;
          g = 26 + elev * 15;
          b = 28 + elev * 12;
          // population: warm urban-fabric lift — reads as the city footprint zoomed out
          const p2 = Math.sqrt(pop);
          r += p2 * 88;
          g += p2 * 64;
          b += p2 * 30;
          // land value: faint cool sheen
          b += lv * 12;
        }
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
        ctx.fillRect(cx * PX, cy * PX, PX, PX);
      }
    }
    // soften cell edges lightly
    ctx.filter = 'blur(1px)';
    ctx.globalAlpha = 0.7;
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;

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
  }

  private drawRoads(): void {
    const city = this.city;
    if (!city) return;
    const g = this.roadsG;
    g.clear();
    const lg = this.localRoadsG;
    lg.clear();
    // local streets: single dark pass on their own layer (LOD-faded in tick)
    for (const road of city.roads) {
      if (road.cls !== 'local') continue;
      const pts = road.points;
      if (pts.length < 4) continue;
      lg.moveTo(pts[0] as number, pts[1] as number);
      for (let i = 2; i < pts.length; i += 2) lg.lineTo(pts[i] as number, pts[i + 1] as number);
    }
    lg.stroke({ width: 12, color: 0x17171b, cap: 'round' });

    const classes: { cls: string; casing: number; fill: number; casingColor: number; fillColor: number }[] = [
      { cls: 'collector', casing: 30, fill: 20, casingColor: 0x131317, fillColor: 0x4a4a54 },
      { cls: 'arterial', casing: 54, fill: 40, casingColor: 0x131317, fillColor: 0x5c5c68 },
    ];
    for (const spec of classes) {
      for (const pass of ['casing', 'fill'] as const) {
        const width = pass === 'casing' ? spec.casing : spec.fill;
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
    // cheap coordinate hash → stable pseudo-random per lot
    const hash = (x: number, y: number): number => {
      let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const palette = [0x4f4a41, 0x575147, 0x49443c, 0x5d564b, 0x524c43];
    for (const road of city.roads) {
      if (road.cls !== 'local') continue;
      const pts = road.points;
      if (pts.length < 4) continue;
      const ax = pts[0] as number;
      const ay = pts[1] as number;
      const bx = pts[pts.length - 2] as number;
      const by = pts[pts.length - 1] as number;
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 40) continue;
      const ux = (bx - ax) / len;
      const uy = (by - ay) / len;
      const nx = -uy;
      const ny = ux;
      for (let d = 22; d < len - 22; d += 34) {
        const px = ax + ux * d;
        const py = ay + uy * d;
        for (const side of [-1, 1]) {
          const r = hash(px * side, py + side);
          if (r < 0.25) continue; // vacant lots
          const setback = 16 + r * 8;
          const w = 14 + ((r * 7919) % 1) * 12; // along street
          const h = 12 + ((r * 104729) % 1) * 16; // depth
          const cxp = px + nx * side * (setback + h / 2);
          const cyp = py + ny * side * (setback + h / 2);
          // axis-aligned to the street: draw as rotated quad
          const hw = w / 2;
          const hh = h / 2;
          g.poly([
            cxp - ux * hw - nx * hh, cyp - uy * hw - ny * hh,
            cxp + ux * hw - nx * hh, cyp + uy * hw - ny * hh,
            cxp + ux * hw + nx * hh, cyp + uy * hw + ny * hh,
            cxp - ux * hw + nx * hh, cyp - uy * hw + ny * hh,
          ]);
          g.fill({ color: palette[(r * 5) | 0] ?? 0x3a3630 });
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
      const base = MODE_STATION_COLOR[t.mode];
      g.stroke({
        width: t.mode === 'bus' ? 16 : 24,
        color: base,
        alpha: t.grade === 'tunnel' ? 0.35 : 0.55,
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
    // parallel offset per route index so overlapping routes read as separate lines
    ui.routes.forEach((r, idx) => {
      const offset = (idx % 5) * 14 - 28;
      const pts: { x: number; y: number }[] = [];
      for (const sid of r.stationIds) {
        const s = stationById.get(sid);
        if (s) pts.push({ x: s.x, y: s.y + offset });
      }
      if (pts.length < 2) return;
      for (const pass of ['casing', 'line'] as const) {
        g.moveTo((pts[0] as { x: number }).x, (pts[0] as { y: number }).y);
        for (let i = 1; i < pts.length; i++) g.lineTo((pts[i] as { x: number }).x, (pts[i] as { y: number }).y);
        if (pass === 'casing') g.stroke({ width: 30, color: 0x0c0c10, alpha: 0.8, cap: 'round', join: 'round' });
        else g.stroke({ width: 18, color: r.color, alpha: 1, cap: 'round', join: 'round' });
      }
    });
  }

  private drawStations(): void {
    const ui = this.ui;
    const g = this.stationsG;
    g.clear();
    this.labels.removeChildren().forEach((c) => c.destroy());
    if (!ui) return;
    for (const s of ui.stations) {
      const color = MODE_STATION_COLOR[s.mode];
      const size = 44 + s.level * 8;
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
      g.fill({ color: 0xf4f4f5 });
      g.stroke({ width: 14, color });

      const label = new Text({
        text: s.name,
        style: { fontFamily: 'system-ui, sans-serif', fontSize: 64, fill: 0xd4d4d8, stroke: { color: 0x0c0c10, width: 8 } },
      });
      label.anchor.set(0.5, 0);
      label.x = s.x;
      label.y = s.y + size + 16;
      label.scale.set(0.5);
      this.labels.addChild(label);
    }
  }

  // ── per-frame ──────────────────────────────────────────────────────────────

  private tick(): void {
    // camera transform
    this.world.scale.set(this.scale);
    this.world.position.set(
      this.app.screen.width / 2 - this.cx * this.scale,
      this.app.screen.height / 2 - this.cy * this.scale,
    );
    this.labels.visible = this.scale > 0.12;
    // LOD: local streets & buildings fade in as you zoom toward street level
    const lodT = Math.max(0, Math.min(1, (this.scale - 0.13) / 0.12));
    this.localRoadsG.visible = lodT > 0;
    this.localRoadsG.alpha = lodT;
    this.buildingsG.visible = lodT > 0;
    this.buildingsG.alpha = lodT * 0.95;

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

      // agents: tiny dots
      const ag = this.agentsG;
      ag.clear();
      if (this.scale > 0.06) {
        const r = Math.max(8, 12 / Math.sqrt(this.scale));
        for (let i = 0; i < f.agentCount; i++) {
          const x = f.agents[i * 3] as number;
          const y = f.agents[i * 3 + 1] as number;
          const phase = f.agents[i * 3 + 2] as number;
          ag.circle(x, y, r);
          ag.fill({ color: phase === 1 ? 0xfff3bf : 0x9aa0aa, alpha: phase === 1 ? 0.9 : 0.55 });
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
