/**
 * Five playable scenarios of escalating difficulty — Cleveland + NYC bundles only.
 * Pure data; the scenario engine evaluates win/lose trees and mid-run events.
 * Stable ids for saves / replays / tests.
 */
import type { ScenarioDef } from './types';

const riders = (n: number, label?: string) =>
  ({ metric: 'dailyTransitTrips' as const, op: '>=' as const, value: n, ...(label ? { label } : {}) });

const farebox = (ratio: number, label?: string, op: '>=' | '>' = '>=') =>
  ({ metric: 'fareboxRecovery' as const, op, value: ratio, ...(label ? { label } : {}) });

const coverage = (pct: number, label?: string) =>
  ({ metric: 'coverage' as const, op: '>=' as const, value: pct, ...(label ? { label } : {}) });

export const PLAYABLE_SCENARIOS: ScenarioDef[] = [
  // ── 1 · Cleveland starter ──────────────────────────────────────────────
  {
    id: 'cleveland-first-riders',
    label: 'First Riders',
    description: 'Cleveland, bus only. Carry 300 daily riders before day 45.',
    cityKey: 'cleveland',
    tier: 1,
    difficulty: 'easy',
    startingBudget: 12_000_000,
    startingModes: ['bus'],
    lockModes: true,
    dailySubsidy: 35_000,
    deadlineDays: 45,
    eraLabel: 'Starter',
    win: riders(300, 'Carry 300 daily riders'),
  },

  // ── 2 · Cleveland farebox (the brief's example shape) ───────────────────
  {
    id: 'cleveland-farebox-30',
    label: 'Pay the Bills',
    description: '500 daily riders AND farebox recovery > 60% within 30 sim-days. On day 10 the densest district doubles its demand.',
    cityKey: 'cleveland',
    tier: 2,
    difficulty: 'easy',
    startingBudget: 10_000_000,
    startingModes: ['bus'],
    lockModes: true,
    dailySubsidy: 30_000,
    deadlineDays: 30,
    eraLabel: '1955',
    win: {
      and: [
        riders(500, 'Carry 500 daily riders'),
        farebox(0.6, 'Farebox recovery > 60%', '>'),
      ],
    },
    events: [
      {
        id: 'cle-demand-surge',
        day: 10,
        kind: 'districtDemandMult',
        densityRank: 0,
        mult: 2,
        message: 'West-side boom — the densest district doubles its travel demand.',
      },
    ],
  },

  // ── 3 · Cleveland coverage push ────────────────────────────────────────
  {
    id: 'cleveland-reach',
    label: 'Within Reach',
    description: 'Stretch the network: 800 daily riders and 7% coverage before day 40. Bus + tram unlocked from the start.',
    cityKey: 'cleveland',
    tier: 3,
    difficulty: 'normal',
    startingBudget: 11_000_000,
    startingModes: ['bus', 'tram'],
    lockModes: true,
    dailySubsidy: 28_000,
    deadlineDays: 40,
    eraLabel: 'Reach',
    win: {
      and: [
        riders(800, 'Carry 800 daily riders'),
        coverage(0.07, 'Cover 7% of residents'),
      ],
    },
    events: [
      {
        id: 'cle-fuel-spike',
        day: 15,
        kind: 'globalDemandMult',
        mult: 1.25,
        durationDays: 5,
        message: 'Fuel prices spike citywide — transit demand jumps for five days.',
      },
    ],
  },

  // ── 4 · NYC network ────────────────────────────────────────────────────
  {
    id: 'nyc-bus-spine',
    label: 'Bus Spine',
    description: 'New York, bus only. Build a spine that carries 1,500 daily riders with farebox ≥ 80% before day 45.',
    cityKey: 'nyc',
    tier: 4,
    difficulty: 'hard',
    startingBudget: 9_000_000,
    startingModes: ['bus'],
    lockModes: true,
    dailySubsidy: 22_000,
    deadlineDays: 45,
    eraLabel: 'NYC',
    win: {
      and: [
        riders(1500, 'Carry 1,500 daily riders'),
        farebox(0.8, 'Farebox recovery ≥ 80%'),
      ],
    },
    events: [
      {
        id: 'nyc-midtown-surge',
        day: 12,
        kind: 'districtDemandMult',
        densityRank: 0,
        mult: 2,
        message: 'Midtown surge — the densest district doubles its demand.',
      },
      {
        id: 'nyc-grant-cut',
        day: 20,
        kind: 'cashDelta',
        amount: -400_000,
        message: 'State grant clawback — $400k leaves the farebox overnight.',
      },
    ],
  },

  // ── 5 · NYC pressure cooker ────────────────────────────────────────────
  {
    id: 'nyc-pressure',
    label: 'Pressure Cooker',
    description: 'Tight cash, locked buses, 2,000 riders + farebox ≥ 100% + 10% coverage before day 50. Miss the clock or go broke and you lose.',
    cityKey: 'nyc',
    tier: 5,
    difficulty: 'hard',
    startingBudget: 7_500_000,
    startingModes: ['bus'],
    lockModes: true,
    dailySubsidy: 18_000,
    deadlineDays: 50,
    eraLabel: 'Pressure',
    win: {
      and: [
        riders(2000, 'Carry 2,000 daily riders'),
        farebox(1.0, 'Farebox recovery ≥ 100%'),
        coverage(0.1, 'Cover 10% of residents'),
      ],
    },
    // explicit lose: cash cratering hard (in addition to bankruptcy grace)
    lose: { metric: 'cash', op: '<', value: -200_000, label: 'Cash below −$200k' },
    events: [
      {
        id: 'nyc-pressure-boom',
        day: 8,
        kind: 'districtDemandMult',
        densityRank: 0,
        mult: 2,
        message: 'A district doubles its demand — serve it or drown in cars.',
      },
      {
        id: 'nyc-pressure-austerity',
        day: 25,
        kind: 'cashDelta',
        amount: -750_000,
        message: 'Austerity order — $750k yanked from the operating budget.',
      },
    ],
  },
];

export const PLAYABLE_BY_ID: Record<string, ScenarioDef> = Object.fromEntries(
  PLAYABLE_SCENARIOS.map((s) => [s.id, s]),
);

export function playableScenario(id: string): ScenarioDef | undefined {
  return PLAYABLE_BY_ID[id];
}
