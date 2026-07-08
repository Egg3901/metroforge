/**
 * MetroForge visual system — the Elegant Transit Canvas palette.
 *
 * Dark, restrained, cohesive: the base map recedes (deep neutral land, elegant
 * water, muted roads) so the transit network you build is the brightest, most
 * saturated thing on screen. One source of truth for every color the renderer
 * uses; tune the mood here, not scattered through draw code.
 */

export type RGB = [number, number, number];

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export const PALETTE = {
  /** app / canvas background */
  void: 0x0b0d10,

  // ── base map (recedes) ──
  /** low-density land — neutral dark (not green; green is reserved for parks) */
  land: [27, 29, 30] as RGB,
  /** dense urban fabric — downtown reads as a lighter warm-neutral mass */
  landUrban: [48, 50, 47] as RGB,
  /** deep water */
  waterDeep: [15, 24, 35] as RGB,
  /** shallow water near the shoreline */
  waterShallow: [26, 41, 54] as RGB,
  /** a thin luminous line right at the coast */
  shoreLine: [54, 74, 92] as RGB,
  /** warm sand just landward of the shoreline */
  sand: [74, 66, 49] as RGB,
  /** parks / green space */
  park: [30, 48, 37] as RGB,
  /** real building-footprint fabric — a clean neutral lift off the land tone */
  building: [48, 50, 51] as RGB,
  buildingDense: [58, 60, 55] as RGB,

  // ── roads — muted, clearly lighter than fabric but never competing with lines ──
  roadLocal: 0x4a4f4c,
  roadCollector: 0x5c625c,
  roadArterial: 0x6e756e,
  roadCasing: 0x0d0f12,

  // ── transit (the hero — bright, saturated) ──
  station: 0xf4f4f5,
  labelText: 0xd7dde3,
  labelHalo: 0x0b0d10,
} as const;

/** Mode line colors — vivid, distinct, sit brilliantly on the dark base. */
export const MODE_COLOR = {
  bus: 0xffb63d,
  tram: 0x54d0ff,
  metro: 0xff5d6c,
  rail: 0x7ef29a,
} as const;

/**
 * Day/night wash over the map (not the React HUD). Returns a multiply-ish
 * overlay color + alpha for the given hour-of-day (0..24). Night deepens,
 * dawn/dusk warm briefly; midday is nearly clear so transit stays vivid.
 */
export function dayNightWash(hour: number): { color: number; alpha: number } {
  // night 22–5, dawn ~6, day 8–17, dusk ~19
  let night = 0;
  if (hour < 5) night = 1;
  else if (hour < 7) night = 1 - (hour - 5) / 2;
  else if (hour < 18) night = 0;
  else if (hour < 21) night = (hour - 18) / 3;
  else night = 1;

  let warm = 0;
  if (hour >= 5.5 && hour < 8) warm = 1 - Math.abs(hour - 6.75) / 1.25;
  else if (hour >= 17.5 && hour < 20.5) warm = 1 - Math.abs(hour - 19) / 1.5;
  warm = Math.max(0, Math.min(1, warm));

  if (warm > 0.05) {
    // amber dusk/dawn veil
    return { color: 0xff9a4a, alpha: 0.06 + warm * 0.1 };
  }
  if (night > 0.02) {
    // deep blue night — keeps line colors readable
    return { color: 0x0a1528, alpha: 0.08 + night * 0.28 };
  }
  return { color: 0x000000, alpha: 0 };
}
