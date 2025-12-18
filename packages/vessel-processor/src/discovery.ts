// Dynamic data discovery - tracks unique values from vessel messages
import { getRedis } from './redis.js';
import type { VesselState } from './types.js';

// Redis key prefixes for discovered values
const KEYS = {
  vessels: 'discovered:vessels',
  destinations: 'discovered:destinations',
  areas: 'discovered:areas',
  areasLevel1: 'discovered:areas:level1',
  vesselTypes: 'discovered:vesselTypes',
  vesselClasses: 'discovered:vesselClasses',
  voyageStatuses: 'discovered:voyageStatuses',
  ports: 'discovered:ports',
};

/**
 * Track unique values from a vessel state message
 * Uses Redis Sets to efficiently store unique values
 */
export async function trackDiscoveredValues(vessel: VesselState): Promise<void> {
  const redis = getRedis();
  const pipeline = redis.pipeline();

  // Track unique vessels by IMO
  if (vessel.IMO) {
    pipeline.sadd(KEYS.vessels, String(vessel.IMO));
  }

  // Track destinations (AIS destination strings)
  if (vessel.AISDestination && vessel.AISDestination.trim()) {
    pipeline.sadd(KEYS.destinations, vessel.AISDestination.trim());
  }

  // Track areas at different levels
  if (vessel.AreaName && vessel.AreaName.trim()) {
    pipeline.sadd(KEYS.areas, vessel.AreaName.trim());
  }
  if (vessel.AreaNameLevel1 && vessel.AreaNameLevel1.trim()) {
    pipeline.sadd(KEYS.areasLevel1, vessel.AreaNameLevel1.trim());
  }

  // Track vessel types
  if (vessel.VesselType && vessel.VesselType.trim()) {
    pipeline.sadd(KEYS.vesselTypes, vessel.VesselType.trim());
  }

  // Track vessel classes
  if (vessel.VesselClass && vessel.VesselClass.trim()) {
    pipeline.sadd(KEYS.vesselClasses, vessel.VesselClass.trim());
  }

  // Track voyage statuses
  if (vessel.VesselVoyageStatus && vessel.VesselVoyageStatus.trim()) {
    pipeline.sadd(KEYS.voyageStatuses, vessel.VesselVoyageStatus.trim());
  }

  await pipeline.exec();
}

/**
 * Get all discovered values of a specific type
 */
export async function getDiscoveredValues(type: keyof typeof KEYS): Promise<string[]> {
  const redis = getRedis();
  const key = KEYS[type];
  if (!key) {
    throw new Error(`Unknown discovery type: ${type}`);
  }
  const values = await redis.smembers(key);
  return values.sort();
}

/**
 * Get count of discovered values for a type
 */
export async function getDiscoveredCount(type: keyof typeof KEYS): Promise<number> {
  const redis = getRedis();
  const key = KEYS[type];
  if (!key) {
    throw new Error(`Unknown discovery type: ${type}`);
  }
  return redis.scard(key);
}

/**
 * Get all discovery statistics
 */
export async function getDiscoveryStats(): Promise<Record<string, number>> {
  const redis = getRedis();
  const pipeline = redis.pipeline();

  for (const key of Object.values(KEYS)) {
    pipeline.scard(key);
  }

  const results = await pipeline.exec();
  const stats: Record<string, number> = {};

  const keyNames = Object.keys(KEYS);
  results?.forEach((result: [Error | null, unknown], index: number) => {
    if (result[0] === null) {
      stats[keyNames[index]] = result[1] as number;
    }
  });

  return stats;
}

/**
 * Clear all discovered values (useful for testing)
 */
export async function clearDiscoveredValues(): Promise<void> {
  const redis = getRedis();
  const pipeline = redis.pipeline();

  for (const key of Object.values(KEYS)) {
    pipeline.del(key);
  }

  await pipeline.exec();
}
