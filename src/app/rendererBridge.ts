/**
 * Thin bridge so React HUD / tutorial can talk to the live Pixi renderer
 * without prop-drilling through the canvas mount.
 */
import type { GameRenderer } from '@render/renderer';

let renderer: GameRenderer | null = null;

export function setRenderer(r: GameRenderer | null): void {
  renderer = r;
}

export function getRenderer(): GameRenderer | null {
  return renderer;
}
