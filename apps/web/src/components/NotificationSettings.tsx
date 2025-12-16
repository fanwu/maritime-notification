'use client';

import { useState, useEffect } from 'react';
import {
  XMarkIcon,
  MapPinIcon,
  ArrowsRightLeftIcon,
  CheckIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

interface DestinationPreferences {
  enabled: boolean;
  fromDestinations: string[];
  toDestinations: string[];
}

interface GeofencePreferences {
  enabled: boolean;
  geofenceIds: string[];
}

interface Geofence {
  id: string;
  name: string;
}

interface NotificationSettingsProps {
  clientId: string;
  onClose: () => void;
  onSave: () => void;
}

const AVAILABLE_DESTINATIONS = [
  'SINGAPORE', 'ROTTERDAM', 'HONG KONG', 'SHANGHAI', 'DUBAI',
  'HOUSTON', 'TOKYO', 'BUSAN', 'FUJAIRAH', 'SANTOS', 'LOS ANGELES',
  'NEW YORK', 'LONDON', 'MUMBAI', 'SYDNEY',
];

// Reusable Toggle Switch component
function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        enabled ? 'bg-blue-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// Reusable Chip component
function Chip({
  label,
  selected,
  onClick,
  color = 'blue',
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  color?: 'blue' | 'green';
}) {
  const colors = {
    blue: selected
      ? 'bg-blue-600 text-white border-blue-600'
      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400',
    green: selected
      ? 'bg-emerald-600 text-white border-emerald-600'
      : 'bg-white text-gray-700 border-gray-300 hover:border-emerald-400',
  };

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border transition-all ${colors[color]}`}
    >
      {selected && <CheckIcon className="w-3 h-3" />}
      {label}
    </button>
  );
}

export default function NotificationSettings({
  clientId,
  onClose,
  onSave,
}: NotificationSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availableGeofences, setAvailableGeofences] = useState<Geofence[]>([]);
  const [destinationPrefs, setDestinationPrefs] = useState<DestinationPreferences>({
    enabled: true,
    fromDestinations: [],
    toDestinations: [],
  });
  const [geofencePrefs, setGeofencePrefs] = useState<GeofencePreferences>({
    enabled: true,
    geofenceIds: [],
  });

  useEffect(() => {
    async function loadData() {
      try {
        const geofenceRes = await fetch(`/api/geofences?clientId=${clientId}`);
        if (geofenceRes.ok) {
          const geofences = await geofenceRes.json();
          setAvailableGeofences(geofences);
        }

        const prefsRes = await fetch(`/api/preferences?clientId=${clientId}`);
        if (prefsRes.ok) {
          const data = await prefsRes.json();
          if (data.destinationChange) {
            setDestinationPrefs(data.destinationChange);
          }
          if (data.geofenceAlert) {
            setGeofencePrefs({
              enabled: data.geofenceAlert.enabled ?? true,
              geofenceIds: data.geofenceAlert.geofenceIds ?? [],
            });
          }
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [clientId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          destinationChange: destinationPrefs,
          geofenceAlert: geofencePrefs,
        }),
      });
      onSave();
      onClose();
    } catch (error) {
      console.error('Failed to save preferences:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleGeofence = (geofenceId: string) => {
    setGeofencePrefs((prev) => ({
      ...prev,
      geofenceIds: prev.geofenceIds.includes(geofenceId)
        ? prev.geofenceIds.filter((id) => id !== geofenceId)
        : [...prev.geofenceIds, geofenceId],
    }));
  };

  const toggleDestination = (list: 'fromDestinations' | 'toDestinations', destination: string) => {
    setDestinationPrefs((prev) => ({
      ...prev,
      [list]: prev[list].includes(destination)
        ? prev[list].filter((d) => d !== destination)
        : [...prev[list], destination],
    }));
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8 shadow-xl">
          <div className="animate-pulse flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-600">Loading preferences...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Notification Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Geofence Alerts Section */}
          <section className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <MapPinIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Geofence Alerts</h3>
                  <p className="text-sm text-gray-500">Get notified when vessels enter or exit geofences</p>
                </div>
              </div>
              <Toggle
                enabled={geofencePrefs.enabled}
                onChange={(v) => setGeofencePrefs((prev) => ({ ...prev, enabled: v }))}
              />
            </div>

            {geofencePrefs.enabled && (
              <div className="ml-12 space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  Monitor specific geofences
                  <span className="font-normal text-gray-400 ml-1">(empty = all)</span>
                </label>
                {availableGeofences.length === 0 ? (
                  <p className="text-sm text-gray-400 italic py-3 px-4 bg-gray-50 rounded-lg">
                    No geofences created yet. Draw one on the map first.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availableGeofences.map((geofence) => (
                      <Chip
                        key={geofence.id}
                        label={geofence.name}
                        selected={geofencePrefs.geofenceIds.includes(geofence.id)}
                        onClick={() => toggleGeofence(geofence.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <hr className="border-gray-200" />

          {/* Destination Change Section */}
          <section className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <ArrowsRightLeftIcon className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Destination Changes</h3>
                  <p className="text-sm text-gray-500">Get notified when vessels change their destination</p>
                </div>
              </div>
              <Toggle
                enabled={destinationPrefs.enabled}
                onChange={(v) => setDestinationPrefs((prev) => ({ ...prev, enabled: v }))}
              />
            </div>

            {destinationPrefs.enabled && (
              <div className="ml-12 space-y-5">
                {/* From Destinations */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Departing from
                    <span className="font-normal text-gray-400 ml-1">(empty = any)</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {AVAILABLE_DESTINATIONS.map((dest) => (
                      <Chip
                        key={`from-${dest}`}
                        label={dest}
                        selected={destinationPrefs.fromDestinations.includes(dest)}
                        onClick={() => toggleDestination('fromDestinations', dest)}
                        color="blue"
                      />
                    ))}
                  </div>
                </div>

                {/* To Destinations */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Arriving at
                    <span className="font-normal text-gray-400 ml-1">(empty = any)</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {AVAILABLE_DESTINATIONS.map((dest) => (
                      <Chip
                        key={`to-${dest}`}
                        label={dest}
                        selected={destinationPrefs.toDestinations.includes(dest)}
                        onClick={() => toggleDestination('toDestinations', dest)}
                        color="green"
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Info Box */}
          <div className="flex gap-3 p-4 bg-gray-50 rounded-lg">
            <InformationCircleIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-600">
              <p className="font-medium text-gray-700 mb-1">How filters work</p>
              <ul className="space-y-1 text-gray-500">
                <li>Empty selection means "match any"</li>
                <li>Multiple selections mean "match any of these"</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
