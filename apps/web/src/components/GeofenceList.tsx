'use client';

import type { Geofence } from '@/types';

interface GeofenceListProps {
  geofences: Geofence[];
  onDelete: (id: string) => void;
}

export default function GeofenceList({ geofences, onDelete }: GeofenceListProps) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4 flex items-center">
        <span className="mr-2">📍</span>
        Geofences
        <span className="ml-2 text-sm font-normal text-gray-500">
          ({geofences.length})
        </span>
      </h2>

      {geofences.length === 0 ? (
        <p className="text-sm text-gray-500 italic">
          No geofences yet. Draw one on the map!
        </p>
      ) : (
        <div className="space-y-2">
          {geofences.map((geofence) => (
            <div
              key={geofence.id}
              className="p-3 bg-gray-50 rounded-lg border border-gray-200"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">{geofence.name}</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {geofence.geofenceType === 'polygon'
                      ? `${geofence.coordinates.length} points`
                      : `Radius: ${geofence.radiusKm}km`}
                  </p>
                </div>
                <button
                  onClick={() => onDelete(geofence.id)}
                  className="text-red-500 hover:text-red-700 text-sm"
                  title="Delete geofence"
                >
                  🗑️
                </button>
              </div>
              {geofence.description && (
                <p className="text-sm text-gray-600 mt-2">{geofence.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>Tip:</strong> Use the draw tools on the map to create new geofences.
          Click the polygon tool, then click points on the map. Double-click to finish.
        </p>
      </div>
    </div>
  );
}
