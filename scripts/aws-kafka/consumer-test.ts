/**
 * MSK Consumer Test Script
 *
 * Connects to AWS MSK using IAM authentication and consumes
 * messages from the vessel.state.changed topic.
 *
 * Usage:
 *   npm install
 *   npm run consumer
 *
 * Environment variables (or uses msk-config-maritime-kafka.env):
 *   KAFKA_BROKERS - MSK bootstrap servers
 *   AWS_REGION - AWS region (default: us-east-1)
 */

import { Kafka, logLevel } from 'kafkajs';
import { generateAuthToken } from 'aws-msk-iam-sasl-signer-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load config from env file if it exists
function loadConfig() {
  const configFile = join(__dirname, 'msk-config-maritime-kafka.env');
  if (existsSync(configFile)) {
    const content = readFileSync(configFile, 'utf-8');
    content.split('\n').forEach((line) => {
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim();
      if (key && value && !key.startsWith('#')) {
        process.env[key.trim()] = value;
      }
    });
  }
}

loadConfig();

const KAFKA_BROKERS = (
  process.env.KAFKA_BROKERS ||
  process.env.BOOTSTRAP_SERVERS_PUBLIC ||
  ''
).split(',');
const AWS_REGION = process.env.AWS_REGION || process.env.REGION || 'us-east-1';
const TOPIC = 'vessel.state.changed';
const GROUP_ID = 'msk-consumer-test';

if (!KAFKA_BROKERS[0]) {
  console.error('Error: KAFKA_BROKERS or BOOTSTRAP_SERVERS_PUBLIC not set');
  console.error('Make sure msk-config-maritime-kafka.env exists or set environment variables');
  process.exit(1);
}

console.log('MSK Consumer Test');
console.log('=================');
console.log(`Brokers: ${KAFKA_BROKERS.join(', ')}`);
console.log(`Region: ${AWS_REGION}`);
console.log(`Topic: ${TOPIC}`);
console.log(`Group ID: ${GROUP_ID}`);
console.log('');

async function main() {
  console.log('Connecting to MSK with IAM authentication...');

  const kafka = new Kafka({
    clientId: 'msk-consumer-test',
    brokers: KAFKA_BROKERS,
    logLevel: logLevel.WARN,
    ssl: true,
    sasl: {
      mechanism: 'oauthbearer',
      oauthBearerProvider: async () => {
        const token = await generateAuthToken({
          region: AWS_REGION,
        });
        return {
          value: token.token,
        };
      },
    },
  });

  const consumer = kafka.consumer({ groupId: GROUP_ID });

  try {
    await consumer.connect();
    console.log('Connected to MSK!');
    console.log('');

    await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
    console.log(`Subscribed to topic: ${TOPIC}`);
    console.log('Waiting for messages... (Press Ctrl+C to stop)');
    console.log('');

    let messageCount = 0;

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        messageCount++;
        const timestamp = new Date().toISOString();
        const key = message.key?.toString() || 'unknown';
        const value = message.value?.toString() || '';

        try {
          const vesselState = JSON.parse(value);
          console.log(`[${timestamp}] Message #${messageCount}`);
          console.log(`  Partition: ${partition}, Offset: ${message.offset}`);
          console.log(`  IMO: ${vesselState.IMO}`);
          console.log(`  Vessel: ${vesselState.VesselName}`);
          console.log(`  Position: ${vesselState.Latitude}, ${vesselState.Longitude}`);
          console.log(`  Speed: ${vesselState.Speed} knots`);
          console.log(`  Destination: ${vesselState.AISDestination}`);
          console.log('');
        } catch (e) {
          console.log(`[${timestamp}] Message #${messageCount} (raw)`);
          console.log(`  Key: ${key}`);
          console.log(`  Value: ${value.substring(0, 100)}...`);
          console.log('');
        }
      },
    });

    // Handle shutdown
    process.on('SIGINT', async () => {
      console.log('\nShutting down...');
      await consumer.disconnect();
      console.log(`Total messages received: ${messageCount}`);
      process.exit(0);
    });
  } catch (error) {
    console.error('Error:', error);
    await consumer.disconnect();
    process.exit(1);
  }
}

main();
