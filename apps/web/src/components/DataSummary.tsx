'use client';

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  ChartBarIcon,
  MapPinIcon,
  TruckIcon,
  GlobeAltIcon,
  ArrowPathIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';

interface DiscoveryStats {
  vessels: number;
  destinations: number;
  areas: number;
  areasLevel1: number;
  vesselTypes: number;
  vesselClasses: number;
  voyageStatuses: number;
}

interface DataSummaryProps {
  socket: Socket | null;
}

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <div className={`p-3 rounded-lg ${color}`}>
      <div className="flex items-center gap-2">
        <div className="flex-shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-400 truncate">{label}</p>
          <p className="text-lg font-bold text-white">
            {value.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function DataSummary({ socket }: DataSummaryProps) {
  const [stats, setStats] = useState<DiscoveryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/discovered');
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();
      setStats(data.stats);
      setError(null);
    } catch (err) {
      setError('Failed to load');
      console.error('Error fetching discovery stats:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchStats();
  }, []);

  // Listen to WebSocket for real-time updates
  useEffect(() => {
    if (!socket) return;

    const handleStats = (newStats: DiscoveryStats) => {
      setStats(newStats);
      setIsLive(true);
      setLoading(false);
      // Flash effect - reset after short delay
      setTimeout(() => setIsLive(false), 500);
    };

    socket.on('discovery:stats', handleStats);

    return () => {
      socket.off('discovery:stats', handleStats);
    };
  }, [socket]);

  if (loading && !stats) {
    return (
      <div className="p-4 bg-slate-800 rounded-lg">
        <div className="flex items-center gap-2 text-slate-400">
          <ArrowPathIcon className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading stats...</span>
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="p-4 bg-red-900/30 rounded-lg">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChartBarIcon className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base font-semibold text-white">Vessel Data Summary</h2>
          {socket && (
            <span className={`flex items-center gap-1 text-xs ${isLive ? 'text-emerald-400' : 'text-slate-500'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              live
            </span>
          )}
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="p-1 text-slate-400 hover:text-white rounded transition-colors"
          title="Refresh stats"
        >
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          label="Vessels"
          value={stats.vessels || 0}
          icon={<TruckIcon className="w-5 h-5 text-cyan-400" />}
          color="bg-slate-800"
        />
        <StatCard
          label="Destinations"
          value={stats.destinations || 0}
          icon={<MapPinIcon className="w-5 h-5 text-emerald-400" />}
          color="bg-slate-800"
        />
        <StatCard
          label="Areas"
          value={stats.areas || 0}
          icon={<GlobeAltIcon className="w-5 h-5 text-purple-400" />}
          color="bg-slate-800"
        />
        <StatCard
          label="Vessel Types"
          value={stats.vesselTypes || 0}
          icon={<ChartBarIcon className="w-5 h-5 text-orange-400" />}
          color="bg-slate-800"
        />
      </div>

      {/* Secondary Stats */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2 py-1 bg-slate-800 rounded-full text-slate-300">
          {stats.vesselClasses || 0} classes
        </span>
        <span className="px-2 py-1 bg-slate-800 rounded-full text-slate-300">
          {stats.areasLevel1 || 0} regions
        </span>
        <span className="px-2 py-1 bg-slate-800 rounded-full text-slate-300">
          {stats.voyageStatuses || 0} statuses
        </span>
      </div>
    </div>
  );
}
