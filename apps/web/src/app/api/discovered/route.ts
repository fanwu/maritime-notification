import { NextResponse } from 'next/server';
import Redis from 'ioredis';

// Redis configuration
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

// Discovery types and their Redis keys
const DISCOVERY_KEYS: Record<string, string> = {
  vessels: 'discovered:vessels',
  destinations: 'discovered:destinations',
  areas: 'discovered:areas',
  areasLevel1: 'discovered:areas:level1',
  vesselTypes: 'discovered:vesselTypes',
  vesselClasses: 'discovered:vesselClasses',
  voyageStatuses: 'discovered:voyageStatuses',
};

// Create Redis client
let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
    });
  }
  return redis;
}

/**
 * GET /api/discovered
 *
 * Returns counts for all discovery types.
 */
export async function GET() {
  try {
    const client = getRedis();
    const pipeline = client.pipeline();

    // Get count for each type
    for (const key of Object.values(DISCOVERY_KEYS)) {
      pipeline.scard(key);
    }

    const results = await pipeline.exec();
    const stats: Record<string, number> = {};

    const types = Object.keys(DISCOVERY_KEYS);
    results?.forEach((result, index) => {
      if (result[0] === null) {
        stats[types[index]] = result[1] as number;
      }
    });

    return NextResponse.json({
      stats,
      types: Object.keys(DISCOVERY_KEYS),
    });
  } catch (error) {
    console.error('Error fetching discovery stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch discovery stats' },
      { status: 500 }
    );
  }
}
