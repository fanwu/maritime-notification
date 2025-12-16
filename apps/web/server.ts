import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { Kafka, logLevel } from 'kafkajs';
import { PrismaClient } from '@prisma/client';
import * as turf from '@turf/turf';

const prisma = new PrismaClient();

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:29092').split(',');

async function startKafkaConsumer(io: SocketIOServer) {
  const kafka = new Kafka({
    clientId: 'notification-server',
    brokers: KAFKA_BROKERS,
    logLevel: logLevel.ERROR,
  });

  const consumer = kafka.consumer({ groupId: 'notification-processor' });

  try {
    await consumer.connect();
    console.log('Kafka consumer connected');

    await consumer.subscribe({ topic: 'vessel.state.changed', fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;

        try {
          const vessel = JSON.parse(message.value.toString());

          // Broadcast vessel update to all connected clients
          io.emit('vessel:update', vessel);

          // Log occasionally for debugging (every 10th message roughly)
          if (Math.random() < 0.1) {
            console.log(`[Vessel] ${vessel.VesselName} at (${vessel.Latitude.toFixed(4)}, ${vessel.Longitude.toFixed(4)}) -> ${io.engine.clientsCount} clients`);
          }

          // Process rules (simplified for demo - in production use rules-engine)
          // This is a simplified inline version
          await processVesselUpdate(vessel, io);
        } catch (error) {
          console.error('Error processing Kafka message:', error);
        }
      },
    });
  } catch (error) {
    console.error('Failed to start Kafka consumer:', error);
    // Retry after delay
    setTimeout(() => startKafkaConsumer(io), 5000);
  }
}

// State tracking for geofence and destination changes
const vesselGeofenceState: Map<string, boolean> = new Map();
const vesselDestinationState: Map<number, string> = new Map();

// Cache geofences to avoid constant DB queries (refresh every 5 seconds)
let geofenceCache: Array<{ id: string; clientId: string; name: string; coordinates: [number, number][] }> = [];
let lastGeofenceFetch = 0;
const GEOFENCE_CACHE_TTL = 5000;

// Cache client preferences (refresh every 5 seconds)
interface ClientPreferences {
  geofenceAlert: { enabled: boolean };
  destinationChange: {
    enabled: boolean;
    from: string[];
    to: string[];
  };
}
let preferencesCache: Map<string, ClientPreferences> = new Map();
let lastPreferencesFetch = 0;
const PREFERENCES_CACHE_TTL = 5000;

async function getClientPreferences(clientId: string): Promise<ClientPreferences> {
  const now = Date.now();
  if (now - lastPreferencesFetch > PREFERENCES_CACHE_TTL) {
    // Refresh all client preferences
    const rules = await prisma.clientRule.findMany({
      where: { typeId: { in: ['geofence_alert', 'destination_change'] } },
    });

    preferencesCache.clear();

    // Group by clientId
    const clientRules = new Map<string, typeof rules>();
    rules.forEach((rule) => {
      const existing = clientRules.get(rule.clientId) || [];
      existing.push(rule);
      clientRules.set(rule.clientId, existing);
    });

    clientRules.forEach((rules, cId) => {
      const geofenceRule = rules.find((r) => r.typeId === 'geofence_alert');
      const destRule = rules.find((r) => r.typeId === 'destination_change');

      let destCondition = { from: [] as string[], to: [] as string[] };
      if (destRule) {
        try {
          const parsed = JSON.parse(destRule.condition);
          destCondition.from = parsed.from || [];
          destCondition.to = parsed.to || [];
        } catch (e) {}
      }

      preferencesCache.set(cId, {
        geofenceAlert: { enabled: geofenceRule?.isActive ?? true },
        destinationChange: {
          enabled: destRule?.isActive ?? true,
          from: destCondition.from,
          to: destCondition.to,
        },
      });
    });

    lastPreferencesFetch = now;
    console.log(`[Preferences] Refreshed cache for ${preferencesCache.size} clients`);
  }

  // Return preferences for this client, or defaults
  return preferencesCache.get(clientId) || {
    geofenceAlert: { enabled: true },
    destinationChange: { enabled: true, from: [], to: [] },
  };
}

// Check if destination change matches user's filter preferences
function matchesDestinationFilter(
  previousDest: string,
  currentDest: string,
  prefs: ClientPreferences['destinationChange']
): boolean {
  if (!prefs.enabled) return false;

  // Check "from" filter (if specified)
  if (prefs.from.length > 0) {
    const matchesFrom = prefs.from.some(
      (f) => previousDest.toUpperCase().includes(f.toUpperCase())
    );
    if (!matchesFrom) return false;
  }

  // Check "to" filter (if specified)
  if (prefs.to.length > 0) {
    const matchesTo = prefs.to.some(
      (t) => currentDest.toUpperCase().includes(t.toUpperCase())
    );
    if (!matchesTo) return false;
  }

  return true;
}

async function getGeofences() {
  const now = Date.now();
  if (now - lastGeofenceFetch > GEOFENCE_CACHE_TTL) {
    const dbGeofences = await prisma.geofence.findMany({
      where: { isActive: true },
    });
    geofenceCache = dbGeofences.map((g) => ({
      id: g.id,
      clientId: g.clientId,
      name: g.name,
      coordinates: JSON.parse(g.coordinates) as [number, number][],
    }));
    lastGeofenceFetch = now;
    console.log(`[Geofence] Refreshed cache: ${geofenceCache.length} active geofences`);
  }
  return geofenceCache;
}

function isPointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  // Ensure polygon is closed
  const closedPolygon = [...polygon];
  if (
    closedPolygon[0][0] !== closedPolygon[closedPolygon.length - 1][0] ||
    closedPolygon[0][1] !== closedPolygon[closedPolygon.length - 1][1]
  ) {
    closedPolygon.push(closedPolygon[0]);
  }
  const turfPoint = turf.point(point);
  const turfPolygon = turf.polygon([closedPolygon]);
  return turf.booleanPointInPolygon(turfPoint, turfPolygon);
}

async function processVesselUpdate(vessel: any, io: SocketIOServer) {
  const geofences = await getGeofences();

  // Check all active geofences
  for (const geofence of geofences) {
    const point: [number, number] = [vessel.Longitude, vessel.Latitude];
    const isInside = isPointInPolygon(point, geofence.coordinates);

    const stateKey = `${vessel.IMO}:${geofence.id}`;
    const wasInside = vesselGeofenceState.get(stateKey) ?? false;

    if (isInside !== wasInside) {
      vesselGeofenceState.set(stateKey, isInside);

      // Check if user has geofence alerts enabled
      const prefs = await getClientPreferences(geofence.clientId);
      if (!prefs.geofenceAlert.enabled) {
        continue; // Skip notification if disabled
      }

      const action = isInside ? 'entered' : 'exited';
      // Save notification to database (expires in 7 days)
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const dbNotification = await prisma.notification.create({
        data: {
          clientId: geofence.clientId,
          typeId: 'geofence_alert',
          title: `Vessel ${action} ${geofence.name}`,
          message: `${vessel.VesselName || `IMO ${vessel.IMO}`} has ${action} the ${geofence.name} geofence`,
          payload: JSON.stringify({
            vesselName: vessel.VesselName,
            imo: vessel.IMO,
            latitude: vessel.Latitude,
            longitude: vessel.Longitude,
            action,
            geofenceName: geofence.name,
            geofenceId: geofence.id,
          }),
          priority: 'medium',
          status: 'pending',
          expiresAt,
        },
      });

      const notification = {
        id: dbNotification.id,
        clientId: dbNotification.clientId,
        typeId: dbNotification.typeId,
        title: dbNotification.title,
        message: dbNotification.message,
        payload: JSON.parse(dbNotification.payload),
        priority: dbNotification.priority,
        status: dbNotification.status,
        createdAt: dbNotification.createdAt.toISOString(),
      };

      console.log(`[Notification] ${notification.title}`);
      io.to(`client:${geofence.clientId}`).emit('notification', notification);
    }
  }

  // Destination change detection
  const previousDestination = vesselDestinationState.get(vessel.IMO);
  const currentDestination = vessel.AISDestination;

  if (previousDestination !== undefined && previousDestination !== currentDestination) {
    // Check if user has destination change alerts enabled and if it matches filters
    const clientId = 'demo-client';
    const prefs = await getClientPreferences(clientId);

    if (matchesDestinationFilter(previousDestination, currentDestination, prefs.destinationChange)) {
      // Save notification to database (expires in 7 days)
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const dbNotification = await prisma.notification.create({
        data: {
          clientId,
          typeId: 'destination_change',
          title: `Destination Changed: ${vessel.VesselName || `IMO ${vessel.IMO}`}`,
          message: `${vessel.VesselName || `IMO ${vessel.IMO}`} changed destination from "${previousDestination}" to "${currentDestination}"`,
          payload: JSON.stringify({
            vesselName: vessel.VesselName,
            imo: vessel.IMO,
            latitude: vessel.Latitude,
            longitude: vessel.Longitude,
            previousValue: previousDestination,
            currentValue: currentDestination,
          }),
          priority: 'medium',
          status: 'pending',
          expiresAt,
        },
      });

      const notification = {
        id: dbNotification.id,
        clientId: dbNotification.clientId,
        typeId: dbNotification.typeId,
        title: dbNotification.title,
        message: dbNotification.message,
        payload: JSON.parse(dbNotification.payload),
        priority: dbNotification.priority,
        status: dbNotification.status,
        createdAt: dbNotification.createdAt.toISOString(),
      };

      console.log(`[Notification] ${notification.title}: ${previousDestination} -> ${currentDestination}`);
      io.to(`client:${clientId}`).emit('notification', notification);
    } else {
      console.log(`[Filtered] Destination change ${previousDestination} -> ${currentDestination} does not match user preferences`);
    }
  }

  vesselDestinationState.set(vessel.IMO, currentDestination);
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    path: '/api/socketio',
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('subscribe', ({ clientId }) => {
      socket.join(`client:${clientId}`);
      console.log(`Socket ${socket.id} subscribed to client:${clientId}`);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  // Start Kafka consumer
  startKafkaConsumer(io);

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Kafka brokers: ${KAFKA_BROKERS.join(', ')}`);
  });
});
