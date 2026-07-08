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
  /** low-density land */
  land: [26, 31, 30] as RGB,
  /** dense urban fabric — downtown reads as a lighter warm-neutral mass */
  landUrban: [61, 62, 58] as RGB,
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
  /** real building-footprint fabric — a quiet lift off the land tone */
  building: [51, 52, 48] as RGB,
  buildingDense: [66, 66, 61] as RGB,

  // ── roads (muted, backgrounded) ──
  roadLocal: 0x333934,
  roadCollector: 0x454b45,
  roadArterial: 0x5a615a,
  roadCasing: 0x0e1013,

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
