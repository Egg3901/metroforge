// ─────────────────────────────────────────────────────────────────────────
// SCENARIO REGISTRY — one row per playable city, metadata only (difficulty,
// campaign tier, unlock cost in stars, routing to the engine, picker copy).
// The scenario *content* (the objective, its progress + readout) lives
// separately in content/scenarios.ts, keyed by the same scenarioId. Shared by
// the client (picker + locks) and the win flow (star awards). Mirrors the
// setup of the ahd-sim repo (scenarioRegistry + packs), but the entitlement
// currency is stars earned in play, not money.
// ─────────────────────────────────────────────────────────────────────────

export type CityCode = 'nyc' | 'boston' | 'chicago' | 'cleveland' | 'atlanta' | 'la';

export interface ScenarioMeta {
  scenarioId: string; // global id, stable for saves + leaderboards ("nyc-grid")
  cityKey: CityCode; // the OSM preset the engine loads
  difficulty: 'easy' | 'normal' | 'hard';
  size: 'small' | 'medium' | 'large';
  /** campaign tier — cities in a higher tier unlock once you bank enough stars */
  tier: number;
  /** total stars required to unlock (0 = a starter city, always playable) */
  unlockStars: number;
  label: string;
  city: string;
  description: string;
  flag: string;
}

const sc = (
  scenarioId: string,
  cityKey: CityCode,
  city: string,
  flag: string,
  difficulty: ScenarioMeta['difficulty'],
  tier: number,
  unlockStars: number,
  label: string,
  description: string,
): ScenarioMeta => ({ scenarioId, cityKey, city, flag, difficulty, size: 'medium', tier, unlockStars, label, description });

export const SCENARIO_REGISTRY: ScenarioMeta[] = [
  // ── Tier 1 · starter cities (always unlocked) ──
  sc('nyc-grid', 'nyc', 'New York', '🗽', 'normal', 1, 0,
    'The Grid', 'Eight million people, two rivers, one island. Move them.'),
  sc('boston-hub', 'boston', 'Boston', '⚓', 'normal', 1, 0,
    'The Hub', 'Tangled streets and a cut-in harbor. Get everyone within reach.'),
  sc('chicago-l', 'chicago', 'Chicago', '🌊', 'normal', 1, 0,
    'The L', 'The grid and the lake. Build the ridership to match.'),

  // ── Tier 2 · unlock at 4 stars ──
  sc('cleveland-comeback', 'cleveland', 'Cleveland', '🏭', 'normal', 2, 4,
    'Comeback', 'A lakefront city on the rebound. Make the network pay for itself.'),
  sc('atlanta-sprawl', 'atlanta', 'Atlanta', '🌳', 'hard', 2, 4,
    'The Sprawl', 'Landlocked and spread thin. Stitch it together.'),

  // ── Tier 3 · unlock at 8 stars ──
  sc('la-cars', 'la', 'Los Angeles', '🌴', 'hard', 3, 8,
    'Break the Car', 'The hardest sell in America. Win commuters off the freeway.'),
];

export const REGISTRY_BY_ID: Record<string, ScenarioMeta> = Object.fromEntries(
  SCENARIO_REGISTRY.map((m) => [m.scenarioId, m]),
);

/** Highest number of stars any single scenario can be worth (for UI). */
export const STARS_PER_SCENARIO = 3;
export const MAX_STARS = SCENARIO_REGISTRY.length * STARS_PER_SCENARIO;
