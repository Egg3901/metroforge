/**
 * Settings prefs — persistence shape + defaults for view modes.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, getSettings, patchSettings } from '../src/app/settings';

describe('settings', () => {
  it('defaults to ink flat with presentation on', () => {
    expect(DEFAULT_SETTINGS.basemap).toBe('ink');
    expect(DEFAULT_SETTINGS.view).toBe('flat');
    expect(DEFAULT_SETTINGS.dayNight).toBe(true);
    expect(DEFAULT_SETTINGS.mapLabels).toBe(true);
  });

  it('patchSettings merges and returns the next snapshot', () => {
    const before = getSettings();
    const next = patchSettings({ basemap: 'satellite', view: 'iso' });
    expect(next.basemap).toBe('satellite');
    expect(next.view).toBe('iso');
    expect(next.dayNight).toBe(before.dayNight);
    // restore so other tests / sessions stay clean
    patchSettings({ basemap: before.basemap, view: before.view });
  });
});
