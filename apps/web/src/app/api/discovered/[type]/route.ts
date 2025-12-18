import { NextRequest, NextResponse } from 'next/server';
import Redis from 'ioredis';

// Redis configuration
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

// Valid discovery types and their Redis keys
const DISCOVERY_KEYS: Record<string, string> = {
  vessels: 'discovered:vessels',
  destinations: 'discovered:destinations',
  areas: 'discovered:areas',
  areasLevel1: 'discovered:areas:level1',
  vesselTypes: 'discovered:vesselTypes',
  vesselClasses: 'discovered:vesselClasses',
  voyageStatuses: 'discovered:voyageStatuses',
};

// Create Redis client (reuse connection)
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
 * GET /api/discovered/:type
 *
 * Returns discovered values of a specific type from Redis.
 *
 * Types:
 * - destinations: AIS destinations
 * - areas: Area names
 * - areasLevel1: Level 1 area names
 * - vesselTypes: Vessel types
 * - vesselClasses: Vessel classes
 * - voyageStatuses: Voyage statuses
 *
 * Query params:
 * - search: Filter results containing this string (case-insensitive)
 * - limit: Max number of results (default: 100)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { type: string } }
) {
  const { type } = params;

  // Validate type
  const redisKey = DISCOVERY_KEYS[type];
  if (!redisKey) {
    return NextResponse.json(
      { error: `Invalid type: ${type}. Valid types: ${Object.keys(DISCOVERY_KEYS).join(', ')}` },
      { status: 400 }
    );
  }

  // Get query params
  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get('search')?.toLowerCase();
  const limit = parseInt(searchParams.get('limit') || '100', 10);

  try {
    const client = getRedis();

    // Get all values from the Redis set
    let values = await client.smembers(redisKey);

    // Filter by search term if provided
    if (search) {
      values = values.filter((v) => v.toLowerCase().includes(search));
    }

    // Sort alphabetically
    values.sort((a, b) => a.localeCompare(b));

    // Apply limit
    if (limit > 0 && values.length > limit) {
      values = values.slice(0, limit);
    }

    return NextResponse.json({
      type,
      count: values.length,
      values,
    });
  } catch (error) {
    console.error('Error fetching discovered values:', error);
    return NextResponse.json(
      { error: 'Failed to fetch discovered values' },
      { status: 500 }
    );
  }
}
