'use client';

import { useState, useEffect } from 'react';

interface DestinationPreferences {
  enabled: boolean;
  fromDestinations: string[];
  toDestinations: string[];
}

interface GeofencePreferences {
  enabled: boolean;
  geofenceIds: string[]; // Empty = all geofences
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

// Common destinations for the demo
const AVAILABLE_DESTINATIONS = [
  'SINGAPORE',
  'SG SIN',
  'ROTTERDAM',
  'NL RTM',
  'HONG KONG',
  'HK HKG',
  'SHANGHAI',
  'CN SHA',
  'DUBAI',
  'AE DXB',
  'HOUSTON',
  'US HOU',
  'TOKYO',
  'JP TYO',
  'BUSAN',
  'KR PUS',
  'FUJAIRAH',
  'SANTOS',
  'BR SSZ',
  'LOS ANGELES',
  'US LAX',
];

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

  // Load available geofences and preferences
  useEffect(() => {
    async function loadData() {
      try {
        // Load geofences
        const geofenceRes = await fetch(`/api/geofences?clientId=${clientId}`);
        if (geofenceRes.ok) {
          const geofences = await geofenceRes.json();
          setAvailableGeofences(geofences);
        }

        // Load preferences
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
    setGeofencePrefs((prev) => {
      const current = prev.geofenceIds;
      const updated = current.includes(geofenceId)
        ? current.filter((id) => id !== geofenceId)
        : [...current, geofenceId];
      return { ...prev, geofenceIds: updated };
    });
  };

  const toggleDestination = (
    list: 'fromDestinations' | 'toDestinations',
    destination: string
  ) => {
    setDestinationPrefs((prev) => {
      const current = prev[list];
      const updated = current.includes(destination)
        ? current.filter((d) => d !== destination)
        : [...current, destination];
      return { ...prev, [list]: updated };
    });
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-[500px]">
          <p className="text-center text-gray-500">Loading preferences...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[500px] max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Notification Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* Geofence Alerts */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-medium">Geofence Alerts</h3>
                <p className="text-sm text-gray-500">
                  Notify when vessels enter/exit your geofences
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={geofencePrefs.enabled}
                  onChange={(e) =>
                    setGeofencePrefs((prev) => ({
                      ...prev,
                      enabled: e.target.checked,
                    }))
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {geofencePrefs.enabled && (
              <div className="mt-4 pl-4 border-l-2 border-gray-200">
                {/* Geofence Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Specific Geofences
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Select which geofences to monitor (empty = all geofences)
                  </p>
                  {availableGeofences.length === 0 ? (
                    <p className="text-sm text-gray-400 italic p-2 bg-gray-50 rounded">
                      No geofences created yet. Draw a geofence on the map first.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-gray-50 rounded">
                      {availableGeofences.map((geofence) => (
                        <button
                          key={geofence.id}
                          onClick={() => toggleGeofence(geofence.id)}
                          className={`px-2 py-1 text-xs rounded-full border transition ${
                            geofencePrefs.geofenceIds.includes(geofence.id)
                              ? 'bg-blue-500 text-white border-blue-500'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'
                          }`}
                        >
                          {geofence.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {geofencePrefs.geofenceIds.length > 0 && (
                    <p className="text-xs text-blue-600 mt-1">
                      Selected: {geofencePrefs.geofenceIds
                        .map((id) => availableGeofences.find((g) => g.id === id)?.name)
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Destination Change Alerts */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-medium">Destination Change Alerts</h3>
                <p className="text-sm text-gray-500">
                  Notify when vessels change their destination
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={destinationPrefs.enabled}
                  onChange={(e) =>
                    setDestinationPrefs((prev) => ({
                      ...prev,
                      enabled: e.target.checked,
                    }))
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {destinationPrefs.enabled && (
              <div className="mt-4 pl-4 border-l-2 border-gray-200">
                {/* From Destinations */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    From Destinations
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Only notify when vessel leaves these destinations (empty = any)
                  </p>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-gray-50 rounded">
                    {AVAILABLE_DESTINATIONS.map((dest) => (
                      <button
                        key={`from-${dest}`}
                        onClick={() => toggleDestination('fromDestinations', dest)}
                        className={`px-2 py-1 text-xs rounded-full border transition ${
                          destinationPrefs.fromDestinations.includes(dest)
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'
                        }`}
                      >
                        {dest}
                      </button>
                    ))}
                  </div>
                  {destinationPrefs.fromDestinations.length > 0 && (
                    <p className="text-xs text-blue-600 mt-1">
                      Selected: {destinationPrefs.fromDestinations.join(', ')}
                    </p>
                  )}
                </div>

                {/* To Destinations */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    To Destinations
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Only notify when vessel goes to these destinations (empty = any)
                  </p>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-gray-50 rounded">
                    {AVAILABLE_DESTINATIONS.map((dest) => (
                      <button
                        key={`to-${dest}`}
                        onClick={() => toggleDestination('toDestinations', dest)}
                        className={`px-2 py-1 text-xs rounded-full border transition ${
                          destinationPrefs.toDestinations.includes(dest)
                            ? 'bg-green-500 text-white border-green-500'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-green-300'
                        }`}
                      >
                        {dest}
                      </button>
                    ))}
                  </div>
                  {destinationPrefs.toDestinations.length > 0 && (
                    <p className="text-xs text-green-600 mt-1">
                      Selected: {destinationPrefs.toDestinations.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Info box */}
          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
            <strong>Filter Logic:</strong>
            <ul className="mt-1 list-disc list-inside text-xs">
              <li>Empty "From" = notify when leaving any destination</li>
              <li>Empty "To" = notify when going to any destination</li>
              <li>Both set = only notify for specific routes (From → To)</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </div>
  );
}
