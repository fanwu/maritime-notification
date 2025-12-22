// Redis client for caching and pub/sub
import { createRequire } from 'module';
import { config } from './config.js';
import type { Notification, VesselState, NotificationMessage, VesselUpdateMessage } from './types.js';

const require = createRequire(import.meta.url);
const Redis = require('ioredis');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RedisClient = any;

let redis: RedisClient | null = null;
let publisher: RedisClient | null = null;

export function getRedis(): RedisClient {
  if (!redis) {
    redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redis.on('error', (err: Error) => {
      console.error('Redis error:', err);
    });

    redis.on('connect', () => {
      console.log('Redis connected');
    });
  }
  return redis;
}

export function getPublisher(): RedisClient {
  if (!publisher) {
    publisher = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
    });

    publisher.on('error', (err: Error) => {
      console.error('Redis publisher error:', err);
    });
  }
  return publisher;
}

export async function connectRedis(): Promise<void> {
  const client = getRedis();
  await client.ping();
  console.log(`Redis connected: ${config.redis.host}:${config.redis.port}`);
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
  if (publisher) {
    await publisher.quit();
    publisher = null;
  }
  console.log('Redis connections closed');
}

// Publish notification to channel for web server to pick up
export async function publishNotification(clientId: string, notification: Notification): Promise<void> {
  const pub = getPublisher();
  const message: NotificationMessage = { clientId, notification };
  await pub.publish(config.redis.notificationChannel, JSON.stringify(message));
}

// Publish vessel update for real-time map
export async function publishVesselUpdate(vessel: VesselState): Promise<void> {
  // Only publish vessels with valid coordinates
  if (
    typeof vessel.Latitude !== 'number' ||
    typeof vessel.Longitude !== 'number' ||
    isNaN(vessel.Latitude) ||
    isNaN(vessel.Longitude)
  ) {
    return;
  }

  const pub = getPublisher();
  const message: VesselUpdateMessage = { vessel, timestamp: new Date().toISOString() };
  await pub.publish(config.redis.vesselUpdateChannel, JSON.stringify(message));
}

// Publish discovery stats update for real-time dashboard
export async function publishDiscoveryStats(stats: Record<string, number>): Promise<void> {
  const pub = getPublisher();
  const message = { stats, timestamp: new Date().toISOString() };
  await pub.publish(config.redis.discoveryStatsChannel, JSON.stringify(message));
}

// Cache vessel state in Redis
export async function cacheVesselState(imo: number, state: Record<string, unknown>): Promise<void> {
  const client = getRedis();
  const key = `vessel:${imo}`;
  await client.hset(key, state as Record<string, string>);
  await client.expire(key, config.processing.vesselStateTtl);
}

// Get cached vessel state
export async function getCachedVesselState(imo: number): Promise<Record<string, string> | null> {
  const client = getRedis();
  const key = `vessel:${imo}`;
  const state = await client.hgetall(key);
  return Object.keys(state).length > 0 ? state : null;
}

// Cache geofence inside/outside state for a vessel
export async function cacheGeofenceState(imo: number, geofenceId: string, isInside: boolean): Promise<void> {
  const client = getRedis();
  const key = `vessel:${imo}:geofence:${geofenceId}`;
  await client.set(key, isInside ? '1' : '0', 'EX', config.processing.vesselStateTtl);
}

// Get cached geofence state
export async function getCachedGeofenceState(imo: number, geofenceId: string): Promise<boolean | null> {
  const client = getRedis();
  const key = `vessel:${imo}:geofence:${geofenceId}`;
  const value = await client.get(key);
  if (value === null) return null;
  return value === '1';
}

// Cache destination for change detection
export async function cacheDestination(imo: number, destination: string): Promise<void> {
  const client = getRedis();
  const key = `vessel:${imo}:destination`;
  await client.set(key, destination, 'EX', config.processing.vesselStateTtl);
}

// Check if vessel has valid coordinates
function hasValidCoordinates(vessel: VesselState): boolean {
  return (
    typeof vessel.Latitude === 'number' &&
    typeof vessel.Longitude === 'number' &&
    !isNaN(vessel.Latitude) &&
    !isNaN(vessel.Longitude)
  );
}

// Cache vessel position in a single hash for efficient bulk retrieval
export async function cacheVesselPosition(vessel: VesselState): Promise<void> {
  // Only cache vessels with valid coordinates
  if (!vessel.IMO || !hasValidCoordinates(vessel)) {
    return;
  }

  const client = getRedis();
  const data = JSON.stringify({
    IMO: vessel.IMO,
    VesselName: vessel.VesselName,
    Latitude: vessel.Latitude,
    Longitude: vessel.Longitude,
    Speed: vessel.Speed,
    Heading: vessel.Heading,
    VesselType: vessel.VesselType,
    VesselClass: vessel.VesselClass,
    AISDestination: vessel.AISDestination,
    VesselVoyageStatus: vessel.VesselVoyageStatus,
    AreaName: vessel.AreaName,
    updatedAt: new Date().toISOString(),
  });
  await client.hset('vessels:positions', String(vessel.IMO), data);
}

// Get cached destination
export async function getCachedDestination(imo: number): Promise<string | null> {
  const client = getRedis();
  const key = `vessel:${imo}:destination`;
  return client.get(key);
}

// ============================================
// Full Vessel State Caching for Dynamic Rules
// ============================================

// Fields to track for change detection in dynamic rules
const TRACKED_STATE_FIELDS = [
  'VesselName',
  'Speed',
  'VesselVoyageStatus',
  'VesselStatus',
  'AISDestination',
  'AreaName',
  'AreaNameLevel1',
  'Heading',
  'Draught',
  'Course',
  'IsSeagoing',
] as const;

/**
 * Get cached full vessel state for dynamic rule evaluation
 * Returns the previous state to compare against current state
 */
export async function getCachedVesselFullState(imo: number): Promise<Partial<VesselState> | null> {
  const client = getRedis();
  const key = `vessel:fullstate:${imo}`;
  const data = await client.hgetall(key);

  if (!data || Object.keys(data).length === 0) {
    return null;
  }

  // Parse stored values back to appropriate types
  const state: Partial<VesselState> = {};
  for (const [field, value] of Object.entries(data)) {
    if (value === 'true') {
      (state as Record<string, unknown>)[field] = true;
    } else if (value === 'false') {
      (state as Record<string, unknown>)[field] = false;
    } else if (value !== '' && !isNaN(Number(value))) {
      (state as Record<string, unknown>)[field] = Number(value);
    } else {
      (state as Record<string, unknown>)[field] = value;
    }
  }

  return state;
}

/**
 * Cache full vessel state for dynamic rule change detection
 * This should be called after processing all rules for a vessel
 */
export async function cacheVesselFullState(vessel: VesselState): Promise<void> {
  const client = getRedis();
  const key = `vessel:fullstate:${vessel.IMO}`;
  const data: Record<string, string> = {};

  for (const field of TRACKED_STATE_FIELDS) {
    const value = vessel[field as keyof VesselState];
    if (value !== undefined && value !== null) {
      data[field] = String(value);
    }
  }

  if (Object.keys(data).length > 0) {
    await client.hset(key, data);
    // 24 hour TTL - vessels should update more frequently than this
    await client.expire(key, 86400);
  }
}

/**
 * Get all tracked fields (for API use)
 */
export function getTrackedStateFields(): readonly string[] {
  return TRACKED_STATE_FIELDS;
}
