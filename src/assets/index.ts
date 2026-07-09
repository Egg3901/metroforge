/**
 * Baked sprite + texture atlas for the Elegant Transit Canvas.
 * White vehicle bodies are tinted per route color at draw time.
 */
import vehicleBus from './sprites/vehicle-bus.png';
import vehicleTram from './sprites/vehicle-tram.png';
import vehicleMetro from './sprites/vehicle-metro.png';
import vehicleRail from './sprites/vehicle-rail.png';
import stationBus from './sprites/station-bus.png';
import stationTram from './sprites/station-tram.png';
import stationMetro from './sprites/station-metro.png';
import stationRail from './sprites/station-rail.png';
import texGrain from './textures/tex-grain.png';
import texWater from './textures/tex-water.png';
import texPark from './textures/tex-park.png';
import type { TransitMode } from '@core/types';

export const VEHICLE_SPRITE_URL: Record<TransitMode, string> = {
  bus: vehicleBus,
  tram: vehicleTram,
  metro: vehicleMetro,
  rail: vehicleRail,
};

export const STATION_SPRITE_URL: Record<TransitMode, string> = {
  bus: stationBus,
  tram: stationTram,
  metro: stationMetro,
  rail: stationRail,
};

export const TEXTURE_URL = {
  grain: texGrain,
  water: texWater,
  park: texPark,
} as const;

/** World-meters width of each vehicle sprite at scale 1. */
export const VEHICLE_WORLD_SIZE: Record<TransitMode, { w: number; h: number }> = {
  bus: { w: 110, h: 48 },
  tram: { w: 120, h: 46 },
  metro: { w: 140, h: 50 },
  rail: { w: 190, h: 48 },
};
