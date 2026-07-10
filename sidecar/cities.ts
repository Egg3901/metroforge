/**
 * Static registry of the 10 real-city OSM bundles. `bun build --compile`
 * cannot resolve a dynamic `import()` at binary boot (spec §2.1 / risk #2),
 * so every city JSON is imported statically here and embedded in the
 * executable (~6.4 MB total — acceptable). `resolveCity` replaces
 * `@core/city/osmRegistry`'s async `loadOsmCity`, which is the one thing in
 * the host layer that cannot be reused verbatim (its dynamic-import path).
 */
import { OSM_CITY_KEYS } from '@core/city/osmRegistry';
import { presetByKey } from '@core/city/presets';
import type { OsmCityData } from '@core/city/osmCity';

import atlanta from '../src/data/cities/atlanta.json';
import boston from '../src/data/cities/boston.json';
import chicago from '../src/data/cities/chicago.json';
import cleveland from '../src/data/cities/cleveland.json';
import dc from '../src/data/cities/dc.json';
import la from '../src/data/cities/la.json';
import nyc from '../src/data/cities/nyc.json';
import philly from '../src/data/cities/philly.json';
import seattle from '../src/data/cities/seattle.json';
import sf from '../src/data/cities/sf.json';

export interface CityListEntry {
  key: string;
  label: string;
}

const CITY_DATA: Record<string, OsmCityData> = {
  nyc: nyc as unknown as OsmCityData,
  boston: boston as unknown as OsmCityData,
  chicago: chicago as unknown as OsmCityData,
  cleveland: cleveland as unknown as OsmCityData,
  la: la as unknown as OsmCityData,
  atlanta: atlanta as unknown as OsmCityData,
  philly: philly as unknown as OsmCityData,
  sf: sf as unknown as OsmCityData,
  dc: dc as unknown as OsmCityData,
  seattle: seattle as unknown as OsmCityData,
};

/** `{key,label}` list for the `hello` handshake's `cityList`, in the same
 *  order `@core/city/osmRegistry` enumerates the OSM-backed presets. */
export const CITY_LIST: CityListEntry[] = OSM_CITY_KEYS.map((key) => ({ key, label: presetByKey(key).label }));

/** Synchronous replacement for `loadOsmCity(key)` — every dataset is already
 *  resident in the binary, so there is nothing to await. */
export function resolveCity(key: string | undefined): OsmCityData | undefined {
  if (key === undefined) return undefined;
  return CITY_DATA[key];
}
