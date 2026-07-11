import { describe, expect, it } from 'vitest';
import {
  isToyTool,
  TOY_CITY_KEY,
  TOY_CTA_AFTER_MS,
  TOY_HEADLINE,
  TOY_SEED,
  TOY_SUBLINE,
  TOY_TOOLS,
} from '../src/app/teaser';

describe('teaser config', () => {
  it('scopes the toy to Cleveland with a fixed seed', () => {
    expect(TOY_CITY_KEY).toBe('cleveland');
    expect(TOY_SEED).toBe(42_001);
    expect(TOY_TOOLS).toEqual(['station', 'track', 'route']);
    expect(isToyTool('station')).toBe(true);
    expect(isToyTool('bulldoze')).toBe(false);
  });

  it('frames the download CTA copy', () => {
    expect(TOY_HEADLINE).toMatch(/toy version/i);
    expect(TOY_SUBLINE).toMatch(/desktop game/i);
    expect(TOY_CTA_AFTER_MS).toBe(120_000);
  });
});
