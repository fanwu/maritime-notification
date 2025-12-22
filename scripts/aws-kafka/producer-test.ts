/**
 * MSK Producer Test Script
 *
 * Connects to AWS MSK using IAM authentication and sends
 * test vessel state messages in LatestVesselState format.
 *
 * Usage:
 *   npm install
 *   npm run producer
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

if (!KAFKA_BROKERS[0]) {
  console.error('Error: KAFKA_BROKERS or BOOTSTRAP_SERVERS_PUBLIC not set');
  console.error('Make sure msk-config-maritime-kafka.env exists or set environment variables');
  process.exit(1);
}

console.log('MSK Producer Test');
console.log('=================');
console.log(`Brokers: ${KAFKA_BROKERS.join(', ')}`);
console.log(`Region: ${AWS_REGION}`);
console.log(`Topic: ${TOPIC}`);
console.log('');

// Sample vessels for testing
const sampleVessels = [
  {
    imo: 9876543,
    name: 'Pacific Voyager',
    vesselClass: 'Capesize',
    vesselType: 'Bulk Carrier',
    route: [
      { lat: 1.2644, lng: 103.8198 }, // Singapore
      { lat: 1.3000, lng: 103.9000 },
      { lat: 1.2500, lng: 104.0000 },
    ],
  },
  {
    imo: 9765432,
    name: 'Atlantic Pioneer',
    vesselClass: 'Panamax',
    vesselType: 'Container Ship',
    route: [
      { lat: 1.2000, lng: 103.7000 },
      { lat: 1.2500, lng: 103.8000 },
      { lat: 1.3000, lng: 103.8500 },
    ],
  },
  {
    imo: 9654321,
    name: 'Northern Spirit',
    vesselClass: 'VLCC',
    vesselType: 'Tanker',
    route: [
      { lat: 1.1500, lng: 103.6500 },
      { lat: 1.2000, lng: 103.7500 },
      { lat: 1.2500, lng: 103.8500 },
    ],
  },
];

const destinations = [
  'SINGAPORE',
  'ROTTERDAM',
  'HOUSTON',
  'SHANGHAI',
  'FUJAIRAH',
  'MUMBAI',
  'TOKYO',
  'BUSAN',
];

interface VesselState {
  currentWaypointIndex: number;
  progress: number;
  destination: string;
}

const vesselStates: Map<number, VesselState> = new Map();

// Initialize vessel states
sampleVessels.forEach((vessel) => {
  vesselStates.set(vessel.imo, {
    currentWaypointIndex: 0,
    progress: 0,
    destination: destinations[Math.floor(Math.random() * destinations.length)],
  });
});

function generateLatestVesselState(vessel: (typeof sampleVessels)[0]): object {
  const state = vesselStates.get(vessel.imo)!;

  // Get current and next waypoint
  const currentWaypoint = vessel.route[state.currentWaypointIndex];
  const nextWaypointIndex =
    (state.currentWaypointIndex + 1) % vessel.route.length;
  const nextWaypoint = vessel.route[nextWaypointIndex];

  // Interpolate position
  const lat =
    currentWaypoint.lat +
    (nextWaypoint.lat - currentWaypoint.lat) * state.progress;
  const lng =
    currentWaypoint.lng +
    (nextWaypoint.lng - currentWaypoint.lng) * state.progress;

  // Calculate heading
  const dLng = nextWaypoint.lng - currentWaypoint.lng;
  const y = Math.sin(dLng) * Math.cos(nextWaypoint.lat);
  const x =
    Math.cos(currentWaypoint.lat) * Math.sin(nextWaypoint.lat) -
    Math.sin(currentWaypoint.lat) * Math.cos(nextWaypoint.lat) * Math.cos(dLng);
  let heading = Math.atan2(y, x) * (180 / Math.PI);
  heading = (heading + 360) % 360;

  // Random chance to change destination
  if (Math.random() < 0.1) {
    const newDest = destinations[Math.floor(Math.random() * destinations.length)];
    if (newDest !== state.destination) {
      console.log(
        `  >>> ${vessel.name} changing destination: ${state.destination} -> ${newDest}`
      );
      state.destination = newDest;
    }
  }

  // Update progress
  state.progress += 0.1;
  if (state.progress >= 1) {
    state.progress = 0;
    state.currentWaypointIndex = nextWaypointIndex;
  }

  const speed = 10 + Math.random() * 5;

  // Return LatestVesselState format
  return {
    LatestVesselStateId: `${vessel.imo}.${Date.now()}`,
    GroupId: 1,
    IMO: vessel.imo,
    VesselName: vessel.name,
    VesselClassID: 74,
    VesselClass: vessel.vesselClass,
    VesselTypeID: 3,
    VesselType: vessel.vesselType,
    TradeID: 4,
    Trade: 'Bulk',
    ScrappedDate: '1900-01-01T00:00:00Z',
    CommercialOperatorID: 386,
    CommercialOperatorIDParent: 386,
    IsSeagoing: true,
    LastAISID: Date.now(),
    LastMovementDateTimeUTC: new Date().toISOString(),
    Latitude: Math.round(lat * 1000000) / 1000000,
    Longitude: Math.round(lng * 1000000) / 1000000,
    Speed: Math.round(speed * 10) / 10,
    Draught: 10 + Math.random() * 5,
    Heading: Math.round(heading),
    Course: Math.round(heading + (Math.random() - 0.5) * 10),
    VesselStatusID: 1,
    VesselStatus: 'Voyage',
    VesselVoyageStatusID: 7,
    VesselVoyageStatus: 'Sailing',
    AISDestination: state.destination,
    AISDestinationETA: new Date(
      Date.now() + 86400000 * Math.random() * 7
    ).toISOString(),
    AreaID: 24767,
    AreaName: 'Singapore Strait',
    AreaIDLevel1: 15,
    AreaNameLevel1: 'Southeast Asia',
    AreaIDLevel2: 25019,
    AreaNameLevel2: 'Regional',
    AreaIDLevel3: 25028,
    AreaNameLevel3: 'Local',
    ClosestGeoAssetID: 12772,
    ClosestPortID: 12771,
    ClosestAreaID: 24767,
    AisOperationLocationID: 27387,
    OperationLocationActivityID: 2,
    AISDestinationPortID: 12771,
    CurrentVoyageNumber: 32,
    IsArmedGuardOnBoard: false,
    BuiltForTradeID: 4,
    BuiltForTrade: 'Bulk',
    ModifiedOn: new Date().toISOString(),
  };
}

async function main() {
  console.log('Connecting to MSK with IAM authentication...');

  const kafka = new Kafka({
    clientId: 'msk-producer-test',
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

  const producer = kafka.producer();

  try {
    await producer.connect();
    console.log('Connected to MSK!');
    console.log('');

    // Create topic if it doesn't exist
    const admin = kafka.admin();
    await admin.connect();

    const topics = await admin.listTopics();
    if (!topics.includes(TOPIC)) {
      console.log(`Creating topic: ${TOPIC}`);
      await admin.createTopics({
        topics: [
          {
            topic: TOPIC,
            numPartitions: 6,
            replicationFactor: 3,
          },
        ],
      });
      console.log('Topic created!');
    } else {
      console.log(`Topic ${TOPIC} already exists`);
    }
    await admin.disconnect();

    console.log('');
    console.log('Sending vessel state messages...');
    console.log('Press Ctrl+C to stop');
    console.log('');

    let messageCount = 0;

    // Send messages every 3 seconds
    const interval = setInterval(async () => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Publishing vessel updates...`);

      for (const vessel of sampleVessels) {
        const vesselState = generateLatestVesselState(vessel);

        await producer.send({
          topic: TOPIC,
          messages: [
            {
              key: String(vessel.imo),
              value: JSON.stringify(vesselState),
              timestamp: String(Date.now()),
            },
          ],
        });

        messageCount++;
      }

      console.log(
        `  Sent ${sampleVessels.length} messages (total: ${messageCount})`
      );
    }, 3000);

    // Handle shutdown
    process.on('SIGINT', async () => {
      console.log('\nShutting down...');
      clearInterval(interval);
      await producer.disconnect();
      console.log(`Total messages sent: ${messageCount}`);
      process.exit(0);
    });
  } catch (error) {
    console.error('Error:', error);
    await producer.disconnect();
    process.exit(1);
  }
}

main();
