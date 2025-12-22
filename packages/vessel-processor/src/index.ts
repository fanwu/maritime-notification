// Vessel Processor Service - Entry Point
// Consumes vessel state updates from Kafka and generates notifications
//
// Usage:
//   npm run dev                    # Normal mode - continue from last offset
//   npm run dev -- --reset         # Reset mode - clear all state and start from beginning
//   npm run dev -- --from-beginning # Start from beginning without clearing state
//   npm run dev -- --info          # Show topic info and exit

import { config, printConfig } from './config.js';
import { connectDb, closeDb } from './db.js';
import { connectRedis, closeRedis, getRedis } from './redis.js';
import { startConsumer, stopConsumer, getConsumerStatus, resetConsumerOffsets, getTopicInfo, resetMessageCount } from './consumer.js';
import { getDiscoveryStats, clearDiscoveredValues } from './discovery.js';

// Parse command line arguments and environment variables
const args = process.argv.slice(2);
const resetMode = args.includes('--reset') || args.includes('-r') || process.env.KAFKA_RESET === 'true';
const fromBeginning = args.includes('--from-beginning') || args.includes('-b') || resetMode || process.env.KAFKA_FROM_BEGINNING === 'true';
const infoOnly = args.includes('--info') || args.includes('-i');

/**
 * Clear all cached state in Redis
 */
async function clearRedisState(): Promise<void> {
  const redis = getRedis();
  console.log('Clearing Redis state...');

  // Clear vessel state cache
  const vesselKeys = await redis.keys('vessel:*');
  if (vesselKeys.length > 0) {
    await redis.del(...vesselKeys);
    console.log(`  Deleted ${vesselKeys.length} vessel state keys`);
  }

  // Clear discovered values
  await clearDiscoveredValues();
  console.log('  Cleared discovered values');

  console.log('Redis state cleared');
}

/**
 * Show topic info and exit
 */
async function showTopicInfo(): Promise<void> {
  console.log('');
  console.log('Topic Information');
  console.log('=================');

  try {
    const info = await getTopicInfo();
    console.log(`Topic: ${info.topic}`);
    console.log(`Partitions: ${info.partitions}`);
    console.log(`Total Messages: ${info.totalMessages}`);
  } catch (error) {
    console.error('Error getting topic info:', error);
  }
}

async function main(): Promise<void> {
  console.log('');
  console.log('='.repeat(50));
  console.log('  Vessel Processor Service');
  console.log('='.repeat(50));
  console.log('');

  if (resetMode) {
    console.log('*** RESET MODE - Will clear all state and start from beginning ***');
    console.log('');
  } else if (fromBeginning) {
    console.log('*** FROM BEGINNING MODE - Will process from start of topic ***');
    console.log('');
  }

  printConfig();

  // Info only mode
  if (infoOnly) {
    await showTopicInfo();
    process.exit(0);
  }

  try {
    // Connect to PostgreSQL
    console.log('Connecting to PostgreSQL...');
    await connectDb();

    // Connect to Redis
    console.log('Connecting to Redis...');
    await connectRedis();

    // Reset mode - clear everything
    if (resetMode) {
      await resetConsumerOffsets();
      await clearRedisState();
      resetMessageCount();
      console.log('');
    }

    // Show topic info
    try {
      const info = await getTopicInfo();
      console.log(`Topic: ${info.topic} (${info.partitions} partitions, ${info.totalMessages} messages)`);
    } catch (error) {
      console.log('Could not fetch topic info');
    }

    // Start Kafka consumer
    console.log('Starting Kafka consumer...');
    await startConsumer(fromBeginning);

    console.log('');
    console.log('Vessel Processor Service is running');
    console.log('Press Ctrl+C to stop');
    console.log('');

    // Log discovery stats periodically
    setInterval(async () => {
      try {
        const stats = await getDiscoveryStats();
        const status = getConsumerStatus();
        console.log(`[Stats] Messages: ${status.messageCount} | Discovered: destinations=${stats.destinations || 0}, areas=${stats.areas || 0}, vesselTypes=${stats.vesselTypes || 0}`);
      } catch (error) {
        // Ignore stats errors
      }
    }, 60000); // Every minute

  } catch (error) {
    console.error('Failed to start service:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log('');
  console.log('Shutting down...');

  try {
    await stopConsumer();
    await closeRedis();
    await closeDb();
    console.log('Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

// Start the service
main();
