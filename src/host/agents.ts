/**
 * Visual passenger agents — presentation only. Sampled from flow results;
 * never feed back into economics and are not part of the save/determinism
 * contract, so plain Math-free jitter comes from a throwaway Rng.
 */
import { WALK_SPEED } from '@core/constants';
import { dist, lerpVec } from '@core/geometry';
import type { Vec2 } from '@core/geometry';
import { Rng } from '@core/rng';
import type { GameState } from '@core/types';

const MAX_AGENTS = 1800;
const RIDE_SPEED = 14; // m/s visual

interface Agent {
  waypoints: Vec2[];
  /** phase per leg: 0 walk, 1 ride */
  legPhase: number[];
  leg: number;
  t: number; // 0..1 along current leg
  legLength: number;
}

export class AgentPool {
  private agents: Agent[] = [];
  private rng = new Rng(0xa9e17);
  buffer = new Float32Array(MAX_AGENTS * 3);
  count = 0;

  /** Re-sample the pool from current flows (call after assignment refresh). */
  resample(state: GameState): void {
    this.agents.length = 0;
    const flows = state.flows;
    if (flows.length === 0) return;
    let totalTrips = 0;
    for (const f of flows) totalTrips += f.transitTrips;
    if (totalTrips <= 0) return;
    const stationById = new Map(state.stations.map((s) => [s.id, s]));
    const districtById = new Map(state.districts.map((d) => [d.id, d]));

    const target = Math.min(MAX_AGENTS, Math.round(totalTrips / 30));
    for (let i = 0; i < target; i++) {
      const f = flows[this.rng.weighted(flows.map((x) => x.transitTrips))];
      if (!f) continue;
      const origin = districtById.get(f.originDistrict);
      const destD = districtById.get(f.destDistrict);
      if (!origin || !destD) continue;
      const jitter = (): Vec2 => ({ x: this.rng.range(-300, 300), y: this.rng.range(-300, 300) });
      const o = { x: origin.centroid.x + jitter().x, y: origin.centroid.y + jitter().y };
      const dEnd = { x: destD.centroid.x + jitter().x, y: destD.centroid.y + jitter().y };
      const waypoints: Vec2[] = [o];
      const legPhase: number[] = [];
      for (const sid of f.stationIds) {
        const s = stationById.get(sid);
        if (s) {
          waypoints.push(s.pos);
          legPhase.push(waypoints.length === 2 ? 0 : 1);
        }
      }
      waypoints.push(dEnd);
      legPhase.push(0);
      if (waypoints.length < 2) continue;
      const startLeg = this.rng.int(0, waypoints.length - 2);
      const a: Agent = {
        waypoints,
        legPhase,
        leg: startLeg,
        t: this.rng.next(),
        legLength: dist(waypoints[startLeg] as Vec2, waypoints[startLeg + 1] as Vec2),
      };
      this.agents.push(a);
    }
  }

  update(dtGameSeconds: number): void {
    let idx = 0;
    for (const a of this.agents) {
      const phase = a.legPhase[a.leg] ?? 0;
      const speed = phase === 1 ? RIDE_SPEED : WALK_SPEED * 2.2; // visual walk slightly brisk
      if (a.legLength > 0) a.t += (speed * dtGameSeconds) / a.legLength;
      if (a.t >= 1) {
        a.leg += 1;
        a.t = 0;
        if (a.leg >= a.waypoints.length - 1) {
          // loop the agent: restart the journey (pool stays full without churn)
          a.leg = 0;
        }
        a.legLength = dist(a.waypoints[a.leg] as Vec2, a.waypoints[a.leg + 1] as Vec2);
      }
      const p = lerpVec(a.waypoints[a.leg] as Vec2, a.waypoints[a.leg + 1] as Vec2, Math.min(a.t, 1));
      this.buffer[idx * 3] = p.x;
      this.buffer[idx * 3 + 1] = p.y;
      this.buffer[idx * 3 + 2] = phase;
      idx++;
    }
    this.count = idx;
  }
}
