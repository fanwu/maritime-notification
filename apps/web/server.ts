import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// Redis configuration
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

/**
 * Create Redis client
 */
function createRedisClient(): Redis {
  return new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    retryStrategy: (times) => Math.min(times * 50, 2000),
  });
}

/**
 * Subscribe to Redis channels for notifications and vessel updates
 * These are published by the vessel-processor service
 */
async function startRedisSubscriber(io: SocketIOServer) {
  const subscriber = createRedisClient();

  subscriber.on('error', (err) => {
    console.error('Redis subscriber error:', err);
  });

  subscriber.on('connect', () => {
    console.log('Redis subscriber connected');
  });

  // Subscribe to channels
  await subscriber.subscribe('notifications', 'vessel-updates', 'discovery-stats');

  subscriber.on('message', (channel, message) => {
    try {
      const data = JSON.parse(message);

      if (channel === 'notifications') {
        // Notification from vessel-processor
        // Format: { clientId: string, notification: Notification }
        const { clientId, notification } = data;
        console.log(`[Notification] ${notification.title} -> client:${clientId}`);
        io.to(`client:${clientId}`).emit('notification', notification);
      } else if (channel === 'vessel-updates') {
        // Vessel update from vessel-processor
        // Format: { vessel: VesselState, timestamp: string }
        const { vessel } = data;
        io.emit('vessel:update', vessel);

        // Log occasionally for debugging
        if (Math.random() < 0.01) {
          console.log(`[Vessel] ${vessel.VesselName || vessel.IMO} -> ${io.engine.clientsCount} clients`);
        }
      } else if (channel === 'discovery-stats') {
        // Discovery stats from vessel-processor
        // Format: { stats: Record<string, number>, timestamp: string }
        const { stats } = data;
        io.emit('discovery:stats', stats);
      }
    } catch (error) {
      console.error(`Error processing ${channel} message:`, error);
    }
  });

  console.log('Subscribed to Redis channels: notifications, vessel-updates, discovery-stats');
}

app.prepare().then(async () => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // Create Socket.io server
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    path: '/api/socketio',
  });

  // Set up Redis adapter for Socket.io (enables multi-instance support)
  try {
    const pubClient = createRedisClient();
    const subClient = pubClient.duplicate();

    await Promise.all([
      new Promise<void>((resolve) => pubClient.on('connect', resolve)),
      new Promise<void>((resolve) => subClient.on('connect', resolve)),
    ]);

    io.adapter(createAdapter(pubClient, subClient));
    console.log('Socket.io Redis adapter configured');
  } catch (error) {
    console.warn('Could not set up Redis adapter, running in single-instance mode:', error);
  }

  // Handle client connections
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

  // Start Redis subscriber for notifications from vessel-processor
  try {
    await startRedisSubscriber(io);
  } catch (error) {
    console.error('Failed to start Redis subscriber:', error);
    console.log('Web server will run without real-time updates from vessel-processor');
  }

  httpServer.listen(port, () => {
    console.log('');
    console.log('='.repeat(50));
    console.log('  Web Server');
    console.log('='.repeat(50));
    console.log('');
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Redis: ${REDIS_HOST}:${REDIS_PORT}`);
    console.log('');
  });
});
