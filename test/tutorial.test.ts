/**
 * Tutorial step predicates — pure, so we can golden-test the onboarding arc
 * without spinning up the renderer.
 */
import { describe, expect, it } from 'vitest';
import { TUTORIAL_STEPS } from '../src/app/tutorial';
import type { UiState } from '../src/host/protocol';

const emptyUi = (over: Partial<UiState> = {}): UiState =>
  ({
    tick: 0,
    day: 1,
    cash: 1e6,
    population: 100_000,
    approval: 50,
    transitShare: 0,
    coverage: 0,
    dailyTransitTrips: 0,
    stations: [],
    tracks: [],
    routes: [],
    unlockedModes: ['bus'],
    lastDay: { fares: 0, subsidy: 0, operations: 0, maintenance: 0, interest: 0 },
    activeEvents: [],
    bankrupt: false,
    ...over,
  }) as UiState;

describe('tutorial steps', () => {
  it('has five steps ending at first ridership', () => {
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual([
      'density',
      'stations',
      'track',
      'route',
      'riders',
    ]);
  });

  it('stations step completes at two stops', () => {
    const step = TUTORIAL_STEPS.find((s) => s.id === 'stations')!;
    expect(step.done(emptyUi())).toBe(false);
    expect(step.done(emptyUi({ stations: [{ id: 1 } as never] }))).toBe(false);
    expect(step.done(emptyUi({ stations: [{ id: 1 } as never, { id: 2 } as never] }))).toBe(true);
  });

  it('track / route / riders gates', () => {
    const track = TUTORIAL_STEPS.find((s) => s.id === 'track')!;
    const route = TUTORIAL_STEPS.find((s) => s.id === 'route')!;
    const riders = TUTORIAL_STEPS.find((s) => s.id === 'riders')!;
    expect(track.done(emptyUi({ tracks: [{ id: 1 } as never] }))).toBe(true);
    expect(route.done(emptyUi({ routes: [{ id: 1 } as never] }))).toBe(true);
    expect(riders.done(emptyUi({ dailyTransitTrips: 50 }))).toBe(false);
    expect(riders.done(emptyUi({ dailyTransitTrips: 100 }))).toBe(true);
  });
});
