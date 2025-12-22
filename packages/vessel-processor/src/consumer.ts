// Kafka consumer with MSK IAM authentication and Snappy compression
import { Kafka, Consumer, logLevel, EachMessagePayload, Admin } from 'kafkajs';
import { createRequire } from 'module';
import { generateAuthToken } from 'aws-msk-iam-sasl-signer-js';
import { config } from './config.js';
import { processVesselState } from './processor.js';
import { trackDiscoveredValues } from './discovery.js';
import type { VesselState } from './types.js';

// Register Snappy codec for compressed messages
const require = createRequire(import.meta.url);
const { CompressionTypes, CompressionCodecs } = require('kafkajs');
const SnappyCodec = require('kafkajs-snappy');
CompressionCodecs[CompressionTypes.Snappy] = SnappyCodec;

let kafka: Kafka | null = null;
let consumer: Consumer | null = null;
let messageCount = 0;
let errorCount = 0;
let lastLogTime = Date.now();

/**
 * Create Kafka client with optional MSK IAM authentication
 */
function createKafkaClient(): Kafka {
  const clientConfig: ConstructorParameters<typeof Kafka>[0] = {
    clientId: config.kafka.clientId,
    brokers: config.kafka.brokers,
    logLevel: logLevel.WARN,
  };

  // Add MSK IAM authentication if enabled
  if (config.kafka.useMskIam) {
    clientConfig.ssl = true;
    clientConfig.sasl = {
      mechanism: 'oauthbearer',
      oauthBearerProvider: async () => {
        const token = await generateAuthToken({
          region: config.kafka.awsRegion,
        });
        return {
          value: token.token,
        };
      },
    };
  }

  return new Kafka(clientConfig);
}

/**
 * Reset consumer group offsets to beginning
 * This allows reprocessing all messages from the start
 */
export async function resetConsumerOffsets(): Promise<void> {
  const client = createKafkaClient();
  const admin = client.admin();

  try {
    await admin.connect();
    console.log('Resetting consumer group offsets...');

    // Get topic partitions
    const topicMetadata = await admin.fetchTopicMetadata({ topics: [config.kafka.topic] });
    const partitions = topicMetadata.topics[0]?.partitions || [];

    if (partitions.length === 0) {
      console.log('No partitions found for topic');
      return;
    }

    // Try to delete consumer group to reset offsets
    try {
      await admin.deleteGroups([config.kafka.groupId]);
      console.log(`Deleted consumer group: ${config.kafka.groupId}`);
    } catch (error: any) {
      // Handle various error cases
      const errorCode = error.groups?.[0]?.errorCode;

      if (error.type === 'GROUP_ID_NOT_FOUND' || errorCode === 36) {
        console.log('Consumer group does not exist, nothing to reset');
      } else {
        // For any other error (GROUP_NOT_EMPTY, etc.), use a new group ID
        console.log('Could not delete consumer group, using new group ID');
        const baseGroupId = config.kafka.groupId.replace(/-\d+$/, ''); // Remove any existing timestamp
        config.kafka.groupId = `${baseGroupId}-${Date.now()}`;
        console.log(`New group ID: ${config.kafka.groupId}`);
      }
    }

    console.log('Consumer offsets reset - will start from beginning');
  } finally {
    await admin.disconnect();
  }
}

/**
 * Get topic info (partitions, offsets)
 */
export async function getTopicInfo(): Promise<{
  topic: string;
  partitions: number;
  totalMessages: number;
}> {
  const client = createKafkaClient();
  const admin = client.admin();

  try {
    await admin.connect();

    const topicMetadata = await admin.fetchTopicMetadata({ topics: [config.kafka.topic] });
    const partitions = topicMetadata.topics[0]?.partitions || [];

    // Get offsets for each partition
    const offsets = await admin.fetchTopicOffsets(config.kafka.topic);
    let totalMessages = 0;
    for (const partition of offsets) {
      const high = parseInt(partition.high, 10);
      const low = parseInt(partition.low, 10);
      totalMessages += high - low;
    }

    return {
      topic: config.kafka.topic,
      partitions: partitions.length,
      totalMessages,
    };
  } finally {
    await admin.disconnect();
  }
}

/**
 * Start the Kafka consumer
 * @param fromBeginning - If true, start consuming from the beginning of the topic
 */
export async function startConsumer(fromBeginning: boolean = false): Promise<void> {
  kafka = createKafkaClient();
  consumer = kafka.consumer({ groupId: config.kafka.groupId });

  await consumer.connect();
  console.log('Kafka consumer connected');

  await consumer.subscribe({
    topic: config.kafka.topic,
    fromBeginning: fromBeginning,
  });
  console.log(`Subscribed to topic: ${config.kafka.topic} (fromBeginning: ${fromBeginning})`);

  await consumer.run({
    eachMessage: async ({ topic, partition, message }: EachMessagePayload) => {
      try {
        const value = message.value?.toString();
        if (!value) {
          return;
        }

        const vesselState: VesselState = JSON.parse(value);

        // Track discovered values for UI dropdowns
        await trackDiscoveredValues(vesselState);

        // Process vessel state for notifications
        await processVesselState(vesselState);

        // Log progress periodically
        messageCount++;
        const now = Date.now();
        if (now - lastLogTime > 10000) { // Every 10 seconds
          console.log(`Processed ${messageCount} messages`);
          lastLogTime = now;
        }
      } catch (error) {
        errorCount++;
        // Only log first few errors to avoid spam
        if (errorCount <= 3) {
          console.error('Error processing message:', error instanceof Error ? error.message : error);
        } else if (errorCount === 4) {
          console.error('(Suppressing further parse errors...)');
        }
      }
    },
  });

  console.log('Kafka consumer running...');
}

/**
 * Stop the Kafka consumer gracefully
 */
export async function stopConsumer(): Promise<void> {
  if (consumer) {
    await consumer.disconnect();
    consumer = null;
    console.log('Kafka consumer disconnected');
  }
}

/**
 * Get consumer status
 */
export function getConsumerStatus(): {
  connected: boolean;
  groupId: string;
  topic: string;
  messageCount: number;
  errorCount: number;
} {
  return {
    connected: consumer !== null,
    groupId: config.kafka.groupId,
    topic: config.kafka.topic,
    messageCount,
    errorCount,
  };
}

/**
 * Reset message counter
 */
export function resetMessageCount(): void {
  messageCount = 0;
  errorCount = 0;
  lastLogTime = Date.now();
}
