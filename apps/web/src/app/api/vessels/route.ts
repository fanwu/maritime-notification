import { NextResponse } from 'next/server';
import Redis from 'ioredis';

// Redis configuration
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

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
 * GET /api/vessels
 *
 * Returns all cached vessel positions from Redis.
 */
export async function GET() {
  try {
    const client = getRedis();

    // Get all vessel positions from the hash
    const positions = await client.hgetall('vessels:positions');

    // Parse JSON values and filter out vessels with invalid coordinates
    const vessels = Object.values(positions).map((json) => {
      try {
        return JSON.parse(json);
      } catch {
        return null;
      }
    }).filter((v) => {
      return v &&
        typeof v.Latitude === 'number' &&
        typeof v.Longitude === 'number' &&
        !isNaN(v.Latitude) &&
        !isNaN(v.Longitude);
    });

    return NextResponse.json({
      count: vessels.length,
      vessels,
    });
  } catch (error) {
    console.error('Error fetching vessels:', error);
    return NextResponse.json(
      { error: 'Failed to fetch vessels' },
      { status: 500 }
    );
  }
}
