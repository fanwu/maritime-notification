import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import type { Notification, ServerToClientEvents, ClientToServerEvents, VesselState } from '@/types';

let io: SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null = null;

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  if (io) return io;

  io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: process.env.ALLOWED_ORIGIN || '*',
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

    socket.on('notification:read', async ({ notificationId }) => {
      // Will be handled by API route
      console.log(`Notification ${notificationId} marked as read`);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
}

export function getSocketServer(): SocketIOServer | null {
  return io;
}

export function emitNotification(clientId: string, notification: Notification): void {
  if (io) {
    io.to(`client:${clientId}`).emit('notification', notification);
  }
}

export function emitNotificationBatch(clientId: string, notifications: Notification[]): void {
  if (io) {
    io.to(`client:${clientId}`).emit('notification:batch', notifications);
  }
}

export function emitVesselUpdate(vessel: VesselState): void {
  if (io) {
    io.emit('vessel:update', vessel);
  }
}
