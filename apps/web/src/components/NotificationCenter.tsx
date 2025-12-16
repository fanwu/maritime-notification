'use client';

import { useState, useEffect, useRef } from 'react';
import {
  XMarkIcon,
  TrashIcon,
  MapPinIcon,
  BoltIcon,
  ArrowPathIcon,
  BellIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline';
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
      notifications.forEach(n => initialNotificationIdsRef.current.add(n.id));
      isInitializedRef.current = true;

      notifications.forEach((n) => {
        if (n.status !== 'read' && !markedAsReadRef.current.has(n.id)) {
          markedAsReadRef.current.add(n.id);
          onMarkAsRead(n.id);
        }
      });
    }
  }, [notifications, onMarkAsRead]);

  // Mark NEW notifications as read after 2 seconds
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
      }, 2000);

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

  const getTypeConfig = (typeId: string) => {
    switch (typeId) {
      case 'geofence_alert':
        return {
          label: 'Geofence Alert',
          bgColor: 'bg-blue-50',
          textColor: 'text-blue-700',
          borderColor: 'border-blue-200',
          icon: MapPinIcon,
          iconBg: 'bg-blue-100',
          iconColor: 'text-blue-600',
        };
      case 'speed_alert':
        return {
          label: 'Speed Alert',
          bgColor: 'bg-amber-50',
          textColor: 'text-amber-700',
          borderColor: 'border-amber-200',
          icon: BoltIcon,
          iconBg: 'bg-amber-100',
          iconColor: 'text-amber-600',
        };
      case 'destination_change':
        return {
          label: 'Destination Change',
          bgColor: 'bg-purple-50',
          textColor: 'text-purple-700',
          borderColor: 'border-purple-200',
          icon: ArrowsRightLeftIcon,
          iconBg: 'bg-purple-100',
          iconColor: 'text-purple-600',
        };
      case 'status_change':
        return {
          label: 'Status Change',
          bgColor: 'bg-emerald-50',
          textColor: 'text-emerald-700',
          borderColor: 'border-emerald-200',
          icon: ArrowPathIcon,
          iconBg: 'bg-emerald-100',
          iconColor: 'text-emerald-600',
        };
      default:
        return {
          label: 'Notification',
          bgColor: 'bg-gray-50',
          textColor: 'text-gray-700',
          borderColor: 'border-gray-200',
          icon: BellIcon,
          iconBg: 'bg-gray-100',
          iconColor: 'text-gray-600',
        };
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
        <h2 className="text-base font-semibold text-gray-900">Notifications</h2>
        <div className="flex items-center gap-1">
          {notifications.length > 0 && (
            <button
              onClick={onClearAll}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 px-2 py-1.5 hover:bg-red-50 rounded-md transition-colors"
            >
              <TrashIcon className="w-3.5 h-3.5" />
              <span>Clear All</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-md transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-4 py-2 border-b border-gray-100 flex gap-1 bg-white">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            filter === 'all'
              ? 'bg-gray-900 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            filter === 'unread'
              ? 'bg-gray-900 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Unread
        </button>
      </div>

      {/* Notification List */}
      <div className="flex-1 overflow-y-auto">
        {filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <BellIcon className="w-12 h-12 mb-3 stroke-1" />
            <p className="text-sm">No notifications</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredNotifications.map((notification) => {
              const config = getTypeConfig(notification.typeId);
              const IconComponent = config.icon;

              return (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-gray-50 transition-colors ${
                    notification.status !== 'read' ? 'bg-blue-50/50' : ''
                  }`}
                >
                  <div className="flex gap-3">
                    {/* Icon */}
                    <div className={`flex-shrink-0 w-9 h-9 rounded-lg ${config.iconBg} flex items-center justify-center`}>
                      <IconComponent className={`w-5 h-5 ${config.iconColor}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${config.bgColor} ${config.textColor}`}>
                          {config.label}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatTime(notification.createdAt)}
                        </span>
                        {notification.status !== 'read' && (
                          <span className="w-2 h-2 bg-blue-500 rounded-full" />
                        )}
                      </div>

                      <h3 className="text-sm font-medium text-gray-900 leading-snug">
                        {onVesselClick && notification.payload?.imo ? (
                          <button
                            onClick={() => onVesselClick(notification.payload!.imo as number)}
                            className="text-blue-600 hover:text-blue-800 hover:underline text-left"
                          >
                            {notification.title}
                          </button>
                        ) : (
                          notification.title
                        )}
                      </h3>

                      <p className="text-sm text-gray-500 mt-0.5 leading-snug">
                        {notification.message}
                      </p>

                      {notification.payload?.latitude && notification.payload?.longitude && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
                          <MapPinIcon className="w-3.5 h-3.5" />
                          <span>
                            {(notification.payload.latitude as number).toFixed(4)},{' '}
                            {(notification.payload.longitude as number).toFixed(4)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
