'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { io, Socket } from 'socket.io-client';
import {
  BellIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import type { Notification, VesselState, Geofence } from '@/types';
import type { MapViewHandle } from '@/components/MapView';
import NotificationCenter from '@/components/NotificationCenter';
import GeofenceList from '@/components/GeofenceList';
import NotificationSettings from '@/components/NotificationSettings';
import DataSummary from '@/components/DataSummary';

const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-100 flex items-center justify-center">
      <div className="flex items-center gap-3 text-gray-500">
        <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        <span>Loading map...</span>
      </div>
    </div>
  ),
});

const CLIENT_ID = 'demo-client';

export default function Home() {
  const mapHandleRef = useRef<MapViewHandle | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [vessels, setVessels] = useState<Map<number, VesselState>>(new Map());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Fetch initial data
  useEffect(() => {
    fetch(`/api/geofences?clientId=${CLIENT_ID}`)
      .then((res) => res.json())
      .then((data) => setGeofences(data))
      .catch(console.error);

    fetch(`/api/notifications?clientId=${CLIENT_ID}&limit=500`)
      .then((res) => res.json())
      .then((data) => {
        setNotifications(data);
        setUnreadCount(data.filter((n: Notification) => n.status !== 'read').length);
      })
      .catch(console.error);

    // Fetch all cached vessel positions
    fetch('/api/vessels')
      .then((res) => res.json())
      .then((data) => {
        if (data.vessels) {
          const vesselMap = new Map<number, VesselState>();
          data.vessels.forEach((v: VesselState) => {
            vesselMap.set(v.IMO, v);
          });
          setVessels(vesselMap);
          console.log(`Loaded ${data.vessels.length} vessels from cache`);
        }
      })
      .catch(console.error);
  }, []);

  // Socket connection
  useEffect(() => {
    const newSocket = io({
      path: '/api/socketio',
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      newSocket.emit('subscribe', { clientId: CLIENT_ID });
    });

    newSocket.on('disconnect', () => {
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

  const handleMarkAsRead = useCallback(async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}/read`, { method: 'PATCH' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, status: 'read' as const } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }, []);

  const handleGeofenceCreate = useCallback(async (geofence: Omit<Geofence, 'id'>) => {
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
  }, []);

  const handleGeofenceDelete = useCallback(async (id: string) => {
    try {
      await fetch(`/api/geofences/${id}`, { method: 'DELETE' });
      setGeofences((prev) => prev.filter((g) => g.id !== id));
    } catch (error) {
      console.error('Failed to delete geofence:', error);
    }
  }, []);

  const handleClearAllNotifications = useCallback(async () => {
    try {
      await fetch(`/api/notifications?clientId=${CLIENT_ID}`, { method: 'DELETE' });
      setNotifications([]);
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to clear notifications:', error);
    }
  }, []);

  const handleMapReady = useCallback((handle: MapViewHandle) => {
    mapHandleRef.current = handle;
  }, []);

  const handleVesselClick = useCallback((imo: number) => {
    if (mapHandleRef.current) {
      mapHandleRef.current.focusVessel(imo);
    }
  }, []);

  const handleGeofenceClick = useCallback((geofenceId: string) => {
    if (mapHandleRef.current) {
      mapHandleRef.current.focusGeofence(geofenceId);
    }
  }, []);

  return (
    <div className="flex h-screen bg-slate-950">
      {/* Sidebar */}
      <div className="w-80 bg-slate-900 border-r border-slate-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-700">
          <img src="/signal-logo.png" alt="Signal" className="h-8 mb-3" />
          <h1 className="text-lg font-semibold text-white">Maritime Notifications</h1>
          <div className="flex items-center gap-1.5 mt-2 text-sm">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <span className="text-slate-400">{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>

        {/* Data Summary */}
        <div className="p-4 border-b border-slate-700">
          <DataSummary socket={socket} />
        </div>

        {/* Geofences */}
        <div className="flex-1 overflow-y-auto p-4">
          <GeofenceList
            geofences={geofences}
            vessels={Array.from(vessels.values())}
            onDelete={handleGeofenceDelete}
            onGeofenceClick={handleGeofenceClick}
          />
        </div>

        {/* Action Buttons */}
        <div className="p-4 border-t border-slate-700 space-y-2">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg font-medium transition-colors ${
              showNotifications
                ? 'bg-cyan-500 text-slate-900'
                : 'bg-cyan-500 text-slate-900 hover:bg-cyan-400'
            }`}
          >
            <div className="flex items-center gap-2">
              <BellIcon className="w-5 h-5" />
              <span>Notifications</span>
            </div>
            {unreadCount > 0 && (
              <span className="bg-purple-500 text-white text-xs font-medium px-2 py-0.5 rounded-full min-w-[20px] text-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-white bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg font-medium transition-colors"
          >
            <Cog6ToothIcon className="w-5 h-5" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapView
          vessels={Array.from(vessels.values())}
          geofences={geofences}
          onGeofenceCreate={handleGeofenceCreate}
          onMapReady={handleMapReady}
        />
      </div>

      {/* Notification Panel */}
      {showNotifications && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-30"
            onClick={() => setShowNotifications(false)}
          />
          <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl z-40 animate-slide-in">
            <NotificationCenter
              notifications={notifications}
              onMarkAsRead={handleMarkAsRead}
              onClearAll={handleClearAllNotifications}
              onClose={() => setShowNotifications(false)}
              onVesselClick={handleVesselClick}
            />
          </div>
        </>
      )}

      {/* Notification Settings Modal */}
      {showSettings && (
        <NotificationSettings
          clientId={CLIENT_ID}
          onClose={() => setShowSettings(false)}
          onSave={() => {}}
        />
      )}
    </div>
  );
}
