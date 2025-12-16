import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { Kafka, logLevel } from 'kafkajs';

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

// Simplified vessel processing for demo
// In production, this would use the full rules-engine
const vesselGeofenceState: Map<string, boolean> = new Map();
const vesselDestinationState: Map<number, string> = new Map();

async function processVesselUpdate(vessel: any, io: SocketIOServer) {
  // Demo Singapore Strait geofence check
  const singaporeStrait = {
    minLng: 103.6,
    maxLng: 104.2,
    minLat: 1.15,
    maxLat: 1.35,
  };

  const isInside =
    vessel.Longitude >= singaporeStrait.minLng &&
    vessel.Longitude <= singaporeStrait.maxLng &&
    vessel.Latitude >= singaporeStrait.minLat &&
    vessel.Latitude <= singaporeStrait.maxLat;

  const stateKey = `${vessel.IMO}:singapore-strait`;
  const wasInside = vesselGeofenceState.get(stateKey) ?? false;

  if (isInside !== wasInside) {
    vesselGeofenceState.set(stateKey, isInside);

    const action = isInside ? 'entered' : 'exited';
    const notification = {
      id: `notif-${Date.now()}-${vessel.IMO}`,
      clientId: 'demo-client',
      typeId: 'geofence_alert',
      title: `Vessel ${action} Singapore Strait`,
      message: `${vessel.VesselName || `IMO ${vessel.IMO}`} has ${action} the Singapore Strait geofence`,
      payload: {
        vesselName: vessel.VesselName,
        imo: vessel.IMO,
        latitude: vessel.Latitude,
        longitude: vessel.Longitude,
        action,
        geofenceName: 'Singapore Strait',
      },
      priority: 'medium',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    console.log(`[Notification] ${notification.title}`);
    io.to('client:demo-client').emit('notification', notification);
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
