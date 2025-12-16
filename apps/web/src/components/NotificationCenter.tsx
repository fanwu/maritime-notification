'use client';

import { useState, useEffect, useRef } from 'react';
import type { Notification } from '@/types';

interface NotificationCenterProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onClearAll: () => void;
  onClose: () => void;
  onVesselClick?: (imo: number) => void;
}

export default function NotificationCenter({
  notifications,
  onMarkAsRead,
  onClearAll,
  onClose,
  onVesselClick,
}: NotificationCenterProps) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const markedAsReadRef = useRef<Set<string>>(new Set());
  const initialNotificationIdsRef = useRef<Set<string>>(new Set());
  const isInitializedRef = useRef(false);

  // Mark all unread notifications as read when panel opens
  useEffect(() => {
    if (!isInitializedRef.current) {
      // Store initial notification IDs
      notifications.forEach(n => initialNotificationIdsRef.current.add(n.id));
      isInitializedRef.current = true;

      // Mark all current unread as read
      notifications.forEach((n) => {
        if (n.status !== 'read' && !markedAsReadRef.current.has(n.id)) {
          markedAsReadRef.current.add(n.id);
          onMarkAsRead(n.id);
        }
      });
    }
  }, [notifications, onMarkAsRead]);

  // Mark NEW notifications (arriving after panel opened) as read after 2 seconds
  useEffect(() => {
    if (!isInitializedRef.current) return;

    const newUnreadNotifications = notifications.filter(
      (n) =>
        n.status !== 'read' &&
        !markedAsReadRef.current.has(n.id) &&
        !initialNotificationIdsRef.current.has(n.id)
    );

    if (newUnreadNotifications.length > 0) {
      const timeoutId = setTimeout(() => {
        newUnreadNotifications.forEach((n) => {
          if (!markedAsReadRef.current.has(n.id)) {
            markedAsReadRef.current.add(n.id);
            onMarkAsRead(n.id);
          }
        });
      }, 2000); // 2 second delay for new notifications

      return () => clearTimeout(timeoutId);
    }
  }, [notifications, onMarkAsRead]);

  const filteredNotifications = notifications.filter((n) =>
    filter === 'all' ? true : n.status !== 'read'
  );

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getTypeColor = (typeId: string) => {
    switch (typeId) {
      case 'geofence_alert':
        return 'bg-blue-100 text-blue-800';
      case 'speed_alert':
        return 'bg-yellow-100 text-yellow-800';
      case 'destination_change':
        return 'bg-purple-100 text-purple-800';
      case 'status_change':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (typeId: string) => {
    switch (typeId) {
      case 'geofence_alert':
        return '📍';
      case 'speed_alert':
        return '⚡';
      case 'destination_change':
        return '🧭';
      case 'status_change':
        return '🔄';
      default:
        return '🔔';
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="text-lg font-semibold">Notifications</h2>
        <div className="flex items-center gap-2">
          {notifications.length > 0 && (
            <button
              onClick={onClearAll}
              className="text-xs text-red-500 hover:text-red-700 px-2 py-1 hover:bg-red-50 rounded"
            >
              Clear All
            </button>
          )}
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="p-2 border-b flex gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1 rounded-full text-sm ${
            filter === 'all'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-3 py-1 rounded-full text-sm ${
            filter === 'unread'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Unread
        </button>
      </div>

      {/* Notification List */}
      <div className="flex-1 overflow-y-auto">
        {filteredNotifications.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No notifications
          </div>
        ) : (
          filteredNotifications.map((notification) => (
            <div
              key={notification.id}
              className={`p-4 border-b hover:bg-gray-50 ${
                notification.status !== 'read' ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{getTypeIcon(notification.typeId)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${getTypeColor(
                        notification.typeId
                      )}`}
                    >
                      {notification.typeId.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatTime(notification.createdAt)}
                    </span>
                  </div>
                  <h3 className="font-medium text-gray-900 truncate">
                    {onVesselClick && notification.payload?.imo ? (
                      <button
                        onClick={() => {
                          console.log('[NotificationCenter] Vessel clicked:', notification.payload!.imo);
                          onVesselClick(notification.payload!.imo as number);
                        }}
                        className="text-blue-600 hover:text-blue-800 hover:underline text-left"
                      >
                        {notification.title}
                      </button>
                    ) : (
                      notification.title
                    )}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {notification.message}
                  </p>
                  {notification.payload && (
                    <div className="mt-2 text-xs text-gray-500">
                      {notification.payload.latitude && notification.payload.longitude && (
                        <span>
                          📍 {(notification.payload.latitude as number).toFixed(4)},{' '}
                          {(notification.payload.longitude as number).toFixed(4)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {notification.status !== 'read' && (
                  <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
