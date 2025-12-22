'use client';

import {
  MapPinIcon,
  TrashIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { MapPinIcon as MapPinSolidIcon } from '@heroicons/react/24/solid';
import type { Geofence, VesselState } from '@/types';
import * as turf from '@turf/turf';

interface GeofenceListProps {
  geofences: Geofence[];
  vessels: VesselState[];
  onDelete: (id: string) => void;
  onGeofenceClick?: (id: string) => void;
}

function countVesselsInGeofence(geofence: Geofence, vessels: VesselState[]): number {
  if (geofence.geofenceType !== 'polygon' || !geofence.coordinates.length) {
    return 0;
  }

  const coords = [...geofence.coordinates];
  if (
    coords[0][0] !== coords[coords.length - 1][0] ||
    coords[0][1] !== coords[coords.length - 1][1]
  ) {
    coords.push(coords[0]);
  }

  const polygon = turf.polygon([coords]);

  return vessels.filter((vessel) => {
    // Skip vessels with invalid coordinates
    if (typeof vessel.Longitude !== 'number' || typeof vessel.Latitude !== 'number') {
      return false;
    }
    const point = turf.point([vessel.Longitude, vessel.Latitude]);
    return turf.booleanPointInPolygon(point, polygon);
  }).length;
}

export default function GeofenceList({ geofences, vessels, onDelete, onGeofenceClick }: GeofenceListProps) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <MapPinSolidIcon className="w-5 h-5 text-blue-600" />
        <h2 className="text-base font-semibold text-gray-900">Geofences</h2>
        <span className="text-sm text-gray-400">({geofences.length})</span>
      </div>

      {/* List */}
      {geofences.length === 0 ? (
        <div className="text-sm text-gray-500 py-4 px-3 bg-gray-50 rounded-lg text-center">
          No geofences yet. Draw one on the map!
        </div>
      ) : (
        <div className="space-y-2">
          {geofences.map((geofence) => {
            const vesselCount = countVesselsInGeofence(geofence, vessels);
            return (
              <div
                key={geofence.id}
                onClick={() => onGeofenceClick?.(geofence.id)}
                className={`group p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/50 transition-colors ${onGeofenceClick ? 'cursor-pointer' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 text-sm truncate">
                      {geofence.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${vesselCount > 0 ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                      {vesselCount === 0
                        ? 'No vessels inside'
                        : vesselCount === 1
                        ? '1 vessel inside'
                        : `${vesselCount} vessels inside`}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(geofence.id);
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete geofence"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
                {geofence.description && (
                  <p className="text-xs text-gray-500 mt-2 line-clamp-2">{geofence.description}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tip */}
      <div className="flex gap-2 p-3 bg-blue-50 rounded-lg">
        <InformationCircleIcon className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          Use the polygon tool on the map to draw geofences. Click to add points, double-click to finish.
        </p>
      </div>
    </div>
  );
}
