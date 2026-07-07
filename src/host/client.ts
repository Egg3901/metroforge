/**
 * Main-thread facade over the sim worker. Promise-based command API +
 * event subscriptions for the renderer and React store.
 */
import type { Command, CommandResult, Difficulty, TransitMode } from '@core/types';
import type { FieldsPayload, FrameSnapshot, FromSim, StaticCity, ToSim, UiState } from './protocol';

export interface SimEvents {
  onReady: (city: StaticCity) => void;
  onFields: (payload: FieldsPayload) => void;
  onFrame: (snapshot: FrameSnapshot) => void;
  onUi: (ui: UiState) => void;
  onToast: (message: string, tone: 'info' | 'warn' | 'good') => void;
  onSaved: (json: string) => void;
}

export class SimClient {
  private worker: Worker;
  private nextRequestId = 1;
  private pending = new Map<number, (v: unknown) => void>();
  events: Partial<SimEvents> = {};

  constructor() {
    this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<FromSim>) => {
      const msg = e.data;
      switch (msg.type) {
        case 'ready':
          this.events.onReady?.(msg.staticCity);
          break;
        case 'fields':
          this.events.onFields?.(msg.payload);
          break;
        case 'frame':
          this.events.onFrame?.(msg.snapshot);
          break;
        case 'ui':
          this.events.onUi?.(msg.ui);
          break;
        case 'toast':
          this.events.onToast?.(msg.message, msg.tone);
          break;
        case 'saved':
          this.events.onSaved?.(msg.json);
          break;
        case 'commandResult':
          this.pending.get(msg.requestId)?.(msg.result);
          this.pending.delete(msg.requestId);
          break;
        case 'trackCost':
          this.pending.get(msg.requestId)?.(msg.cost);
          this.pending.delete(msg.requestId);
          break;
      }
    };
  }

  private send(msg: ToSim): void {
    this.worker.postMessage(msg);
  }

  init(seed: number, difficulty: Difficulty): void {
    this.send({ type: 'init', seed, difficulty });
  }

  loadSave(json: string): void {
    this.send({ type: 'loadSave', json });
  }

  requestSave(): void {
    this.send({ type: 'requestSave' });
  }

  setSpeed(speed: number): void {
    this.send({ type: 'setSpeed', speed });
  }

  command(cmd: Command): Promise<CommandResult> {
    const requestId = this.nextRequestId++;
    return new Promise((resolve) => {
      this.pending.set(requestId, (v) => resolve(v as CommandResult));
      this.send({ type: 'command', requestId, cmd });
    });
  }

  trackCost(mode: TransitMode, grade: 'surface' | 'elevated' | 'tunnel', points: { x: number; y: number }[]): Promise<number> {
    const requestId = this.nextRequestId++;
    return new Promise((resolve) => {
      this.pending.set(requestId, (v) => resolve(v as number));
      this.send({ type: 'queryTrackCost', requestId, mode, grade, points });
    });
  }
}
