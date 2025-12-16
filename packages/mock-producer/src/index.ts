import { Kafka, Producer, logLevel } from 'kafkajs';
import { mockVessels, VesselRoute, getAreaName, destinations } from './vessels';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:29092').split(',');
const UPDATE_INTERVAL_MS = 3000; // Update every 3 seconds for demo

interface VesselState {
  currentWaypointIndex: number;
  progress: number; // 0 to 1 between waypoints
  currentDestination: string;
  lastDestinationChange: number;
}

const vesselStates: Map<number, VesselState> = new Map();

// Initialize vessel states
mockVessels.forEach((vessel) => {
  vesselStates.set(vessel.imo, {
    currentWaypointIndex: 0,
    progress: 0,
    currentDestination: destinations[Math.floor(Math.random() * destinations.length)],
    lastDestinationChange: Date.now(),
  });
});

function interpolate(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function calculateHeading(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const dLng = toLng - fromLng;
  const y = Math.sin(dLng) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(dLng);
  let heading = Math.atan2(y, x) * (180 / Math.PI);
  return (heading + 360) % 360;
}

function generateVesselState(vessel: VesselRoute): object {
  const state = vesselStates.get(vessel.imo)!;

  // Get current and next waypoint
  const currentWaypoint = vessel.waypoints[state.currentWaypointIndex];
  const nextWaypointIndex = (state.currentWaypointIndex + 1) % vessel.waypoints.length;
  const nextWaypoint = vessel.waypoints[nextWaypointIndex];

  // Calculate current position
  const lat = interpolate(currentWaypoint.lat, nextWaypoint.lat, state.progress);
  const lng = interpolate(currentWaypoint.lng, nextWaypoint.lng, state.progress);

  // Calculate heading
  const heading = calculateHeading(currentWaypoint.lat, currentWaypoint.lng, nextWaypoint.lat, nextWaypoint.lng);

  // Get area info
  const area = getAreaName(lat, lng);

  // Maybe change destination (30% chance every update, min 20 sec between changes)
  if (Math.random() < 0.3 && Date.now() - state.lastDestinationChange > 20000) {
    const newDestination = destinations[Math.floor(Math.random() * destinations.length)];
    if (newDestination !== state.currentDestination) {
      console.log(`  >>> ${vessel.name} changing destination: ${state.currentDestination} -> ${newDestination}`);
      state.currentDestination = newDestination;
      state.lastDestinationChange = Date.now();
    }
  }

  // Update progress (multiplier increased 50x for demo visibility)
  const progressIncrement = (vessel.speedKnots * 0.05) / (UPDATE_INTERVAL_MS / 1000);
  state.progress += progressIncrement;

  // Move to next waypoint if reached
  if (state.progress >= 1) {
    state.progress = 0;
    state.currentWaypointIndex = nextWaypointIndex;
    console.log(`  ${vessel.name} reached waypoint ${nextWaypointIndex}`);
  }

  // Add some random variation to speed
  const speed = vessel.speedKnots + (Math.random() - 0.5) * 2;

  return {
    LatestVesselStateId: `${vessel.imo}.1`,
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
    Latitude: lat,
    Longitude: lng,
    Speed: Math.round(speed * 10) / 10,
    Draught: 10 + Math.random() * 5,
    Heading: Math.round(heading),
    Course: Math.round(heading + (Math.random() - 0.5) * 10),
    VesselStatusID: 1,
    VesselStatus: 'Voyage',
    VesselVoyageStatusID: 7,
    VesselVoyageStatus: 'Sailing',
    AISDestination: state.currentDestination,
    AISDestinationETA: new Date(Date.now() + 86400000 * Math.random() * 7).toISOString(),
    AreaID: 24767,
    AreaName: area.name,
    AreaIDLevel1: 15,
    AreaNameLevel1: area.level1,
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
  console.log('Starting mock vessel data producer...');
  console.log(`Kafka brokers: ${KAFKA_BROKERS.join(', ')}`);
  console.log(`Update interval: ${UPDATE_INTERVAL_MS}ms`);
  console.log(`Tracking ${mockVessels.length} vessels`);

  const kafka = new Kafka({
    clientId: 'mock-producer',
    brokers: KAFKA_BROKERS,
    logLevel: logLevel.ERROR,
  });

  const producer = kafka.producer();

  try {
    await producer.connect();
    console.log('Connected to Kafka');

    // Create topic if not exists
    const admin = kafka.admin();
    await admin.connect();
    const topics = await admin.listTopics();
    if (!topics.includes('vessel.state.changed')) {
      await admin.createTopics({
        topics: [{ topic: 'vessel.state.changed', numPartitions: 1 }],
      });
      console.log('Created topic: vessel.state.changed');
    }
    await admin.disconnect();

    console.log('\nStarting vessel simulation...\n');

    // Send updates at regular intervals
    setInterval(async () => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Publishing vessel updates...`);

      for (const vessel of mockVessels) {
        const vesselState = generateVesselState(vessel);

        await producer.send({
          topic: 'vessel.state.changed',
          messages: [
            {
              key: String(vessel.imo),
              value: JSON.stringify(vesselState),
            },
          ],
        });
      }

      console.log(`  Published ${mockVessels.length} vessel updates`);
      // Log one vessel's position for debugging
      const sampleVessel = mockVessels[0];
      const sampleState = vesselStates.get(sampleVessel.imo)!;
      console.log(`  Sample: ${sampleVessel.name} at waypoint ${sampleState.currentWaypointIndex}, progress ${sampleState.progress.toFixed(3)}`);
    }, UPDATE_INTERVAL_MS);

    // Keep the process running
    process.on('SIGINT', async () => {
      console.log('\nShutting down...');
      await producer.disconnect();
      process.exit(0);
    });
  } catch (error) {
    console.error('Error:', error);
    await producer.disconnect();
    process.exit(1);
  }
}

main();
