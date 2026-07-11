/**
 * Web storefront toy — a deliberate 2-minute Cleveland teaser.
 * Full campaign / daily / multi-city free play live in the desktop game.
 */

/** Fixed seed so the Cleveland map is reproducible for demos and screenshots. */
export const TOY_SEED = 42_001;

export const TOY_CITY_KEY = 'cleveland';
export const TOY_CITY_LABEL = 'Cleveland';

/** Wall-clock play time before the non-blocking download banner appears. */
export const TOY_CTA_AFTER_MS = 2 * 60 * 1000;

export const TOY_HEADLINE = 'Try the toy version in your browser';
export const TOY_SUBLINE = 'The full city runs in the desktop game.';

export const TOY_BLURB =
  'One city, one loop: place stations, draw a route, watch the vehicles roll.';

export const DOWNLOAD_HREF = '/download.html';

/** Tools exposed in the toy toolbar (bus-only; no bulldoze / select clutter). */
export const TOY_TOOLS = ['station', 'track', 'route'] as const;
export type ToyTool = (typeof TOY_TOOLS)[number];

export function isToyTool(t: string): t is ToyTool {
  return (TOY_TOOLS as readonly string[]).includes(t);
}
