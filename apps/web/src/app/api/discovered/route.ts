import { NextResponse } from 'next/server';
import Redis from 'ioredis';

// Force dynamic rendering - prevents Next.js from caching/inlining env vars at build time
export const dynamic = 'force-dynamic';

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

// Create Redis client - read env vars at runtime, not build time
let redis: Redis | null = null;
let cachedRedisHost: string | null = null;

function getRedis(): Redis {
  // Read env vars at runtime using indirect access to prevent Next.js static analysis
  const envVars = process.env;
  const redisHost = envVars['REDIS_HOST'] || 'localhost';
  const redisPort = parseInt(envVars['REDIS_PORT'] || '6379', 10);
  const redisPassword = envVars['REDIS_PASSWORD'] || undefined;

  // Recreate connection if host changed (shouldn't happen, but just in case)
  if (redis && cachedRedisHost !== redisHost) {
    redis.disconnect();
    redis = null;
  }

  if (!redis) {
    cachedRedisHost = redisHost;
    redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 50, 2000),
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
    console.log('[discovered] Pipeline results:', JSON.stringify(results));

    const stats: Record<string, number> = {};

    const types = Object.keys(DISCOVERY_KEYS);
    results?.forEach((result, index) => {
      if (result[0] === null) {
        stats[types[index]] = result[1] as number;
      }
    });

    const envVars = process.env;
    return NextResponse.json({
      stats,
      types: Object.keys(DISCOVERY_KEYS),
      debug: {
        redisHostRaw: envVars['REDIS_HOST'],
        redisHostType: typeof envVars['REDIS_HOST'],
        redisHost: envVars['REDIS_HOST'] || 'localhost',
        allEnvKeys: Object.keys(envVars).filter(k => k.includes('REDIS') || k.includes('redis')),
        resultsCount: results?.length ?? 0,
        rawResults: results,
      }
    });
  } catch (error) {
    console.error('Error fetching discovery stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch discovery stats' },
      { status: 500 }
    );
  }
}
