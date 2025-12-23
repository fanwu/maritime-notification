'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import {
  XMarkIcon,
  TrashIcon,
  MapPinIcon,
  BoltIcon,
  ArrowPathIcon,
  BellIcon,
  ArrowsRightLeftIcon,
  MagnifyingGlassIcon,
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
  const markedAsReadRef = useRef<Set<string>>(new Set());
  const initialNotificationIdsRef = useRef<Set<string>>(new Set());
  const isInitializedRef = useRef(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter notifications by search term (matches source, destination, vessel name, title, message)
  const filteredNotifications = useMemo(() => {
    if (!searchTerm.trim()) {
      return notifications;
    }
    const search = searchTerm.toLowerCase();
    return notifications.filter((n) => {
      // Check title and message
      if (n.title.toLowerCase().includes(search)) return true;
      if (n.message.toLowerCase().includes(search)) return true;

      // Check payload fields for destination changes
      if (n.payload) {
        const prev = String(n.payload.previousValue || '').toLowerCase();
        const curr = String(n.payload.currentValue || '').toLowerCase();
        const vessel = String(n.payload.vesselName || '').toLowerCase();
        const dest = String(n.payload.destination || '').toLowerCase();

        if (prev.includes(search)) return true;
        if (curr.includes(search)) return true;
        if (vessel.includes(search)) return true;
        if (dest.includes(search)) return true;
      }

      return false;
    });
  }, [notifications, searchTerm]);

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

  // Color palette for dynamic rules - each rule gets a consistent color based on its name
  const dynamicRuleColors = [
    { name: 'rose', cardBg: 'bg-rose-950/40', cardBorder: 'border-l-rose-500', bgColor: 'bg-rose-900/50', textColor: 'text-rose-300', iconBg: 'bg-rose-900/50', iconColor: 'text-rose-400' },
    { name: 'orange', cardBg: 'bg-orange-950/40', cardBorder: 'border-l-orange-500', bgColor: 'bg-orange-900/50', textColor: 'text-orange-300', iconBg: 'bg-orange-900/50', iconColor: 'text-orange-400' },
    { name: 'lime', cardBg: 'bg-lime-950/40', cardBorder: 'border-l-lime-500', bgColor: 'bg-lime-900/50', textColor: 'text-lime-300', iconBg: 'bg-lime-900/50', iconColor: 'text-lime-400' },
    { name: 'teal', cardBg: 'bg-teal-950/40', cardBorder: 'border-l-teal-500', bgColor: 'bg-teal-900/50', textColor: 'text-teal-300', iconBg: 'bg-teal-900/50', iconColor: 'text-teal-400' },
    { name: 'sky', cardBg: 'bg-sky-950/40', cardBorder: 'border-l-sky-500', bgColor: 'bg-sky-900/50', textColor: 'text-sky-300', iconBg: 'bg-sky-900/50', iconColor: 'text-sky-400' },
    { name: 'indigo', cardBg: 'bg-indigo-950/40', cardBorder: 'border-l-indigo-500', bgColor: 'bg-indigo-900/50', textColor: 'text-indigo-300', iconBg: 'bg-indigo-900/50', iconColor: 'text-indigo-400' },
    { name: 'fuchsia', cardBg: 'bg-fuchsia-950/40', cardBorder: 'border-l-fuchsia-500', bgColor: 'bg-fuchsia-900/50', textColor: 'text-fuchsia-300', iconBg: 'bg-fuchsia-900/50', iconColor: 'text-fuchsia-400' },
    { name: 'pink', cardBg: 'bg-pink-950/40', cardBorder: 'border-l-pink-500', bgColor: 'bg-pink-900/50', textColor: 'text-pink-300', iconBg: 'bg-pink-900/50', iconColor: 'text-pink-400' },
  ];

  // Simple hash function to get consistent color index from rule name
  const hashString = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  };

  const getTypeConfig = (notification: Notification) => {
    const typeId = notification.typeId;
    switch (typeId) {
      case 'geofence_alert':
        return {
          label: 'Geofence Alert',
          bgColor: 'bg-cyan-900/50',
          textColor: 'text-cyan-300',
          borderColor: 'border-cyan-700',
          cardBg: 'bg-cyan-950/40',
          cardBorder: 'border-l-4 border-l-cyan-500',
          icon: MapPinIcon,
          iconBg: 'bg-cyan-900/50',
          iconColor: 'text-cyan-400',
        };
      case 'speed_alert':
        return {
          label: 'Speed Alert',
          bgColor: 'bg-amber-900/50',
          textColor: 'text-amber-300',
          borderColor: 'border-amber-700',
          cardBg: 'bg-amber-950/40',
          cardBorder: 'border-l-4 border-l-amber-500',
          icon: BoltIcon,
          iconBg: 'bg-amber-900/50',
          iconColor: 'text-amber-400',
        };
      case 'destination_change':
        return {
          label: 'Destination Change',
          bgColor: 'bg-purple-900/50',
          textColor: 'text-purple-300',
          borderColor: 'border-purple-700',
          cardBg: 'bg-purple-950/40',
          cardBorder: 'border-l-4 border-l-purple-500',
          icon: ArrowsRightLeftIcon,
          iconBg: 'bg-purple-900/50',
          iconColor: 'text-purple-400',
        };
      case 'status_change':
        return {
          label: 'Status Change',
          bgColor: 'bg-emerald-900/50',
          textColor: 'text-emerald-300',
          borderColor: 'border-emerald-700',
          cardBg: 'bg-emerald-950/40',
          cardBorder: 'border-l-4 border-l-emerald-500',
          icon: ArrowPathIcon,
          iconBg: 'bg-emerald-900/50',
          iconColor: 'text-emerald-400',
        };
      case 'dynamic_rule': {
        // Use rule name to pick a consistent color for this rule
        const ruleName = (notification.payload?.ruleName as string) || 'default';
        const colorIndex = hashString(ruleName) % dynamicRuleColors.length;
        const colors = dynamicRuleColors[colorIndex];
        return {
          label: ruleName,
          bgColor: colors.bgColor,
          textColor: colors.textColor,
          borderColor: `border-${colors.name}-700`,
          cardBg: colors.cardBg,
          cardBorder: `border-l-4 ${colors.cardBorder}`,
          icon: BoltIcon,
          iconBg: colors.iconBg,
          iconColor: colors.iconColor,
        };
      }
      default:
        return {
          label: 'Notification',
          bgColor: 'bg-slate-700',
          textColor: 'text-slate-300',
          borderColor: 'border-slate-600',
          cardBg: 'bg-slate-800/50',
          cardBorder: 'border-l-4 border-l-slate-500',
          icon: BellIcon,
          iconBg: 'bg-slate-700',
          iconColor: 'text-slate-400',
        };
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700 bg-slate-800">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-white">Notifications</h2>
          <div className="flex items-center gap-1">
            {notifications.length > 0 && (
              <button
                onClick={onClearAll}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-400 px-2 py-1.5 hover:bg-red-900/30 rounded-md transition-colors"
              >
                <TrashIcon className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search box */}
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Filter by port name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-600 rounded-md focus:outline-none focus:ring-1 focus:ring-cyan-500 bg-slate-700 text-white placeholder-slate-400"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
        {searchTerm && (
          <p className="text-xs text-slate-400 mt-1">
            Showing {filteredNotifications.length} of {notifications.length}
          </p>
        )}
      </div>

      {/* Notification List */}
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <BellIcon className="w-12 h-12 mb-3 stroke-1" />
            <p className="text-sm">No notifications</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <MagnifyingGlassIcon className="w-12 h-12 mb-3 stroke-1" />
            <p className="text-sm">No matches for "{searchTerm}"</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700">
            {filteredNotifications.map((notification) => {
              const config = getTypeConfig(notification);
              const IconComponent = config.icon;

              return (
                <div
                  key={notification.id}
                  className={`p-4 transition-colors ${config.cardBg} ${config.cardBorder} ${
                    notification.status !== 'read' ? 'ring-1 ring-inset ring-white/10' : ''
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
                        <span className="text-xs text-slate-500">
                          {formatTime(notification.createdAt)}
                        </span>
                        {notification.status !== 'read' && (
                          <span className="w-2 h-2 bg-cyan-400 rounded-full" />
                        )}
                      </div>

                      <h3 className="text-sm font-medium text-white leading-snug">
                        {onVesselClick && notification.payload?.imo ? (
                          <button
                            onClick={() => onVesselClick(notification.payload!.imo as number)}
                            className="text-cyan-400 hover:text-cyan-300 hover:underline text-left"
                          >
                            {notification.title}
                          </button>
                        ) : (
                          notification.title
                        )}
                      </h3>

                      <p className="text-sm text-slate-400 mt-0.5 leading-snug">
                        {notification.message}
                      </p>

                      {notification.payload?.latitude && notification.payload?.longitude && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
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
