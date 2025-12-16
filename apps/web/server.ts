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

      const action = isInside ? 'entered' : 'exited';
      const notification = {
        id: `notif-${Date.now()}-${vessel.IMO}-${geofence.id}`,
        clientId: geofence.clientId,
        typeId: 'geofence_alert',
        title: `Vessel ${action} ${geofence.name}`,
        message: `${vessel.VesselName || `IMO ${vessel.IMO}`} has ${action} the ${geofence.name} geofence`,
        payload: {
          vesselName: vessel.VesselName,
          imo: vessel.IMO,
          latitude: vessel.Latitude,
          longitude: vessel.Longitude,
          action,
          geofenceName: geofence.name,
          geofenceId: geofence.id,
        },
        priority: 'medium',
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      console.log(`[Notification] ${notification.title}`);
      io.to(`client:${geofence.clientId}`).emit('notification', notification);
    }
  }

  // Destination change detection
  const previousDestination = vesselDestinationState.get(vessel.IMO);
  const currentDestination = vessel.AISDestination;

  if (previousDestination !== undefined && previousDestination !== currentDestination) {
    const notification = {
      id: `notif-${Date.now()}-${vessel.IMO}-dest`,
      clientId: 'demo-client',
      typeId: 'destination_change',
      title: `Destination Changed: ${vessel.VesselName || `IMO ${vessel.IMO}`}`,
      message: `${vessel.VesselName || `IMO ${vessel.IMO}`} changed destination from "${previousDestination}" to "${currentDestination}"`,
      payload: {
        vesselName: vessel.VesselName,
        imo: vessel.IMO,
        latitude: vessel.Latitude,
        longitude: vessel.Longitude,
        previousValue: previousDestination,
        currentValue: currentDestination,
      },
      priority: 'medium',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    console.log(`[Notification] ${notification.title}: ${previousDestination} -> ${currentDestination}`);
    io.to('client:demo-client').emit('notification', notification);
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
