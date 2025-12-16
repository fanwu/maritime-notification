'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { io, Socket } from 'socket.io-client';
import type { Notification, VesselState, Geofence } from '@/types';
import NotificationCenter from '@/components/NotificationCenter';
import GeofenceList from '@/components/GeofenceList';

// Dynamic import for map to avoid SSR issues
const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-200 flex items-center justify-center">
      Loading map...
    </div>
  ),
});

const CLIENT_ID = 'demo-client';

export default function Home() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [vessels, setVessels] = useState<Map<number, VesselState>>(new Map());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Fetch initial data
  useEffect(() => {
    // Fetch geofences
    fetch(`/api/geofences?clientId=${CLIENT_ID}`)
      .then((res) => res.json())
      .then((data) => setGeofences(data))
      .catch(console.error);

    // Fetch recent notifications
    fetch(`/api/notifications?clientId=${CLIENT_ID}`)
      .then((res) => res.json())
      .then((data) => {
        setNotifications(data);
        setUnreadCount(data.filter((n: Notification) => n.status !== 'read').length);
      })
      .catch(console.error);
  }, []);

  // Socket connection
  useEffect(() => {
    const newSocket = io({
      path: '/api/socketio',
    });

    newSocket.on('connect', () => {
      console.log('Socket connected');
      setIsConnected(true);
      newSocket.emit('subscribe', { clientId: CLIENT_ID });
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    newSocket.on('vessel:update', (vessel: VesselState) => {
      setVessels((prev) => {
        const newMap = new Map(prev);
        newMap.set(vessel.IMO, vessel);
        return newMap;
      });
    });

    newSocket.on('notification', (notification: Notification) => {
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);
    });

    newSocket.on('notification:batch', (batch: Notification[]) => {
      setNotifications((prev) => [...batch, ...prev]);
      setUnreadCount((prev) => prev + batch.filter((n) => n.status !== 'read').length);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const handleMarkAsRead = useCallback(
    async (notificationId: string) => {
      try {
        await fetch(`/api/notifications/${notificationId}/read`, { method: 'PATCH' });
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, status: 'read' as const } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (error) {
        console.error('Failed to mark as read:', error);
      }
    },
    []
  );

  const handleGeofenceCreate = useCallback(
    async (geofence: Omit<Geofence, 'id'>) => {
      try {
        const res = await fetch('/api/geofences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...geofence, clientId: CLIENT_ID }),
        });
        const newGeofence = await res.json();
        setGeofences((prev) => [...prev, newGeofence]);
      } catch (error) {
        console.error('Failed to create geofence:', error);
      }
    },
    []
  );

  const handleGeofenceDelete = useCallback(async (id: string) => {
    try {
      await fetch(`/api/geofences/${id}`, { method: 'DELETE' });
      setGeofences((prev) => prev.filter((g) => g.id !== id));
    } catch (error) {
      console.error('Failed to delete geofence:', error);
    }
  }, []);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-80 bg-white shadow-lg flex flex-col">
        {/* Header */}
        <div className="p-4 border-b">
          <h1 className="text-xl font-bold text-gray-800">Maritime Notifications</h1>
          <div className="flex items-center mt-2 text-sm">
            <span
              className={`w-2 h-2 rounded-full mr-2 ${
                isConnected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="text-gray-600">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
            <span className="mx-2 text-gray-300">|</span>
            <span className="text-gray-600">{vessels.size} vessels</span>
          </div>
        </div>

        {/* Geofences */}
        <div className="flex-1 overflow-y-auto p-4">
          <GeofenceList
            geofences={geofences}
            vessels={Array.from(vessels.values())}
            onDelete={handleGeofenceDelete}
          />
        </div>

        {/* Notification toggle */}
        <div className="p-4 border-t">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="w-full flex items-center justify-between px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
          >
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapView
          vessels={Array.from(vessels.values())}
          geofences={geofences}
          onGeofenceCreate={handleGeofenceCreate}
        />
      </div>

      {/* Notification Panel */}
      {showNotifications && (
        <div className="w-96 bg-white shadow-lg">
          <NotificationCenter
            notifications={notifications}
            onMarkAsRead={handleMarkAsRead}
            onClose={() => setShowNotifications(false)}
          />
        </div>
      )}
    </div>
  );
}
