/**
 * Tutorial step predicates + day/night wash — pure helpers for Phase 4 polish.
 */
import { describe, expect, it } from 'vitest';
import { TUTORIAL_STEPS, tutorialFocus } from '../src/app/tutorial';
import { dayNightWash } from '../src/render/palette';
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

  it('focuses the camera on stations for connect/route steps', () => {
    const ui = emptyUi({
      stations: [
        { id: 1, x: -100, y: 0 } as never,
        { id: 2, x: 100, y: 0 } as never,
      ],
    });
    expect(tutorialFocus(ui, 'track')).toEqual({ x: 0, y: 0, scale: 0.22 });
    expect(tutorialFocus(ui, 'density')).toBeNull();
  });
});

describe('dayNightWash', () => {
  it('is clear at midday', () => {
    expect(dayNightWash(12).alpha).toBeLessThan(0.02);
  });

  it('deepens at night', () => {
    expect(dayNightWash(2).alpha).toBeGreaterThan(0.2);
    expect(dayNightWash(23).alpha).toBeGreaterThan(0.2);
  });

  it('warms at dawn and dusk', () => {
    const dawn = dayNightWash(6.5);
    const dusk = dayNightWash(19);
    expect(dawn.alpha).toBeGreaterThan(0.05);
    expect(dusk.alpha).toBeGreaterThan(0.05);
    // amber-ish (high red channel in the packed color)
    expect((dawn.color >> 16) & 255).toBeGreaterThan(200);
  });
});
