/**
 * Ambient car traffic — presentation only, like passenger agents. Cars run
 * along arterial/collector polylines; the pool size scales with how many
 * trips the transit network HASN'T captured, so winning mode share visibly
 * thins traffic.
 */
import { pointAlong } from '@core/geometry';
import type { Polyline } from '@core/geometry';
import { Rng } from '@core/rng';
import type { GameState } from '@core/types';

const MAX_CARS = 700;

interface Car {
  road: Polyline;
  along: number;
  dir: 1 | -1;
  speed: number; // m/s
}

export class CarPool {
  private cars: Car[] = [];
  private rng = new Rng(0xc4a5);
  /** stride 3: x, y, heading */
  buffer = new Float32Array(MAX_CARS * 3);
  count = 0;

  /** (Re)build the pool from the road network + current mode share. */
  resample(state: GameState): void {
    this.cars.length = 0;
    const roads = state.roads.filter((r) => (r.cls === 'arterial' || r.cls === 'collector') && r.polyline.length > 500);
    if (roads.length === 0) return;
    // traffic volume: base on population, thinned by transit share
    const base = Math.min(MAX_CARS, Math.round(state.stats.population / 220));
    const target = Math.round(base * (1 - state.stats.transitShare * 0.7));
    const weights = roads.map((r) => r.polyline.length);
    for (let i = 0; i < target; i++) {
      const road = roads[this.rng.weighted(weights)];
      if (!road) continue;
      this.cars.push({
        road: road.polyline,
        along: this.rng.range(0, road.polyline.length),
        dir: this.rng.chance(0.5) ? 1 : -1,
        speed: this.rng.range(9, 15),
      });
    }
  }

  update(dtSeconds: number): void {
    let idx = 0;
    for (const c of this.cars) {
      c.along += c.dir * c.speed * dtSeconds;
      if (c.along <= 0 || c.along >= c.road.length) {
        // U-turn at the end of the road
        c.dir = (c.dir * -1) as 1 | -1;
        c.along = Math.max(0, Math.min(c.road.length, c.along));
      }
      const { pos, heading } = pointAlong(c.road, c.along);
      this.buffer[idx * 3] = pos.x;
      this.buffer[idx * 3 + 1] = pos.y;
      this.buffer[idx * 3 + 2] = c.dir === 1 ? heading : heading + Math.PI;
      idx++;
    }
    this.count = idx;
  }
}
