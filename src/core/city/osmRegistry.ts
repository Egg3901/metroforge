/**
 * Lazy loader for real-city OSM bundles. Each dataset is code-split so it's
 * only fetched when that city is chosen (bundles are ~0.5 MB each).
 */
import type { OsmCityData } from './osmCity';

/** preset keys backed by a real OSM import */
export const OSM_CITY_KEYS = ['nyc', 'boston'] as const;

export async function loadOsmCity(key: string | undefined): Promise<OsmCityData | undefined> {
  switch (key) {
    case 'nyc':
      return (await import('../../data/cities/nyc.json')).default as unknown as OsmCityData;
    case 'boston':
      return (await import('../../data/cities/boston.json')).default as unknown as OsmCityData;
    default:
      return undefined;
  }
}
