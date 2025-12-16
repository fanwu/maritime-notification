'use client';

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import type { VesselState, Geofence } from '@/types';
import { config } from '@/lib/config';

export interface MapViewHandle {
  focusVessel: (imo: number) => void;
}

interface MapViewProps {
  vessels: VesselState[];
  geofences: Geofence[];
  onGeofenceCreate: (geofence: Omit<Geofence, 'id'>) => void;
  onMapReady?: (handle: MapViewHandle) => void;
}

const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView({ vessels, geofences, onGeofenceCreate, onMapReady }, ref) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const draw = useRef<MapboxDraw | null>(null);
  const markers = useRef<Map<number, mapboxgl.Marker>>(new Map());
  const [isDrawing, setIsDrawing] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [pendingGeofence, setPendingGeofence] = useState<[number, number][] | null>(null);
  const [geofenceName, setGeofenceName] = useState('');
  const [mapLoaded, setMapLoaded] = useState(false);

  // Create the handle object
  const handleRef = useRef<MapViewHandle>({
    focusVessel: (imo: number) => {
      console.log('[MapView] focusVessel called with IMO:', imo);
      const marker = markers.current.get(imo);
      if (marker && map.current) {
        const lngLat = marker.getLngLat();
        console.log('[MapView] Found marker at:', lngLat);

        // Close all other popups first
        markers.current.forEach((m) => {
          const popup = m.getPopup();
          if (popup && popup.isOpen()) {
            m.togglePopup();
          }
        });

        // Pan to vessel location
        map.current.flyTo({
          center: [lngLat.lng, lngLat.lat],
          zoom: 10,
          duration: 1000,
        });

        // Open the popup after fly animation
        setTimeout(() => {
          const popup = marker.getPopup();
          if (popup && !popup.isOpen()) {
            marker.togglePopup();
          }
        }, 1100);
      } else {
        console.log('[MapView] Marker not found for IMO:', imo, 'Available:', Array.from(markers.current.keys()));
      }
    },
  });

  // Expose via ref
  useImperativeHandle(ref, () => handleRef.current, []);

  // Also notify parent via callback
  useEffect(() => {
    if (onMapReady) {
      console.log('[MapView] Calling onMapReady');
      onMapReady(handleRef.current);
    }
  }, [onMapReady]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = config.mapboxToken;

    if (!mapboxgl.accessToken) {
      console.error('Mapbox token not set. Add NEXT_PUBLIC_MAPBOX_TOKEN to your .env file');
      return;
    }

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [103.8, 1.3], // Singapore
      zoom: 5,
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Initialize draw control
    draw.current = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        polygon: true,
        trash: true,
      },
      defaultMode: 'simple_select',
    });
    map.current.addControl(draw.current, 'top-left');

    // Handle draw events
    map.current.on('draw.create', (e) => {
      const feature = e.features[0];
      if (feature.geometry.type === 'Polygon') {
        const coordinates = feature.geometry.coordinates[0] as [number, number][];
        setPendingGeofence(coordinates);
        setShowNameModal(true);
        // Remove from draw (we'll add it as a layer after saving)
        draw.current?.delete(feature.id as string);
      }
    });

    // Load map with geofences
    map.current.on('load', () => {
      // Add geofence source and layer
      map.current?.addSource('geofences', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });

      map.current?.addLayer({
        id: 'geofences-fill',
        type: 'fill',
        source: 'geofences',
        paint: {
          'fill-color': '#3b82f6',
          'fill-opacity': 0.2,
        },
      });

      map.current?.addLayer({
        id: 'geofences-line',
        type: 'line',
        source: 'geofences',
        paint: {
          'line-color': '#3b82f6',
          'line-width': 2,
        },
      });

      // Mark map as loaded so geofences can be rendered
      setMapLoaded(true);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update geofences on map
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    const source = map.current.getSource('geofences') as mapboxgl.GeoJSONSource;
    if (!source) return;

    console.log('Rendering geofences on map:', geofences.length);

    source.setData({
      type: 'FeatureCollection',
      features: geofences.map((g) => ({
        type: 'Feature',
        properties: { name: g.name, id: g.id },
        geometry: {
          type: 'Polygon',
          coordinates: [g.coordinates],
        },
      })),
    });
  }, [geofences, mapLoaded]);

  // Update vessel markers
  useEffect(() => {
    if (!map.current) return;

    // Update existing markers or create new ones
    vessels.forEach((vessel) => {
      let marker = markers.current.get(vessel.IMO);

      if (marker) {
        // Update position
        marker.setLngLat([vessel.Longitude, vessel.Latitude]);
      } else {
        // Create new marker
        const el = document.createElement('div');
        el.className = 'vessel-marker';
        el.style.width = '20px';
        el.style.height = '20px';
        el.style.backgroundColor = getVesselColor(vessel.VesselType);
        el.style.borderRadius = '50%';
        el.style.border = '2px solid white';
        el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
        el.style.cursor = 'pointer';

        // Add rotation indicator
        const arrow = document.createElement('div');
        arrow.style.width = '0';
        arrow.style.height = '0';
        arrow.style.borderLeft = '4px solid transparent';
        arrow.style.borderRight = '4px solid transparent';
        arrow.style.borderBottom = '8px solid white';
        arrow.style.position = 'absolute';
        arrow.style.top = '-6px';
        arrow.style.left = '4px';
        arrow.style.transform = `rotate(${vessel.Heading || 0}deg)`;
        el.appendChild(arrow);

        marker = new mapboxgl.Marker(el)
          .setLngLat([vessel.Longitude, vessel.Latitude])
          .setPopup(
            new mapboxgl.Popup({ offset: 25 }).setHTML(`
              <div class="p-2">
                <h3 class="font-bold">${vessel.VesselName || `IMO: ${vessel.IMO}`}</h3>
                <p class="text-sm text-gray-600">${vessel.VesselType} - ${vessel.VesselClass}</p>
                <div class="mt-2 text-xs">
                  <p><strong>Speed:</strong> ${vessel.Speed} knots</p>
                  <p><strong>Status:</strong> ${vessel.VesselVoyageStatus}</p>
                  <p><strong>Destination:</strong> ${vessel.AISDestination || 'N/A'}</p>
                  <p><strong>Area:</strong> ${vessel.AreaName}</p>
                </div>
              </div>
            `)
          )
          .addTo(map.current!);

        markers.current.set(vessel.IMO, marker);
      }
    });

    // Remove markers for vessels that are no longer in the list
    const currentIMOs = new Set(vessels.map((v) => v.IMO));
    markers.current.forEach((marker, imo) => {
      if (!currentIMOs.has(imo)) {
        marker.remove();
        markers.current.delete(imo);
      }
    });
  }, [vessels]);

  const handleSaveGeofence = useCallback(() => {
    if (!pendingGeofence || !geofenceName.trim()) return;

    onGeofenceCreate({
      clientId: 'demo-client',
      name: geofenceName.trim(),
      geofenceType: 'polygon',
      coordinates: pendingGeofence,
      isActive: true,
    });

    setShowNameModal(false);
    setPendingGeofence(null);
    setGeofenceName('');
  }, [pendingGeofence, geofenceName, onGeofenceCreate]);

  const getVesselColor = (type: string): string => {
    const colors: Record<string, string> = {
      Tanker: '#ef4444',
      Dry: '#f59e0b',
      Container: '#3b82f6',
      LNG: '#10b981',
      LPG: '#8b5cf6',
    };
    return colors[type] || '#6b7280';
  };

  if (!config.mapboxToken) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="text-center p-8">
          <p className="text-xl text-gray-600 mb-4">Mapbox token not configured</p>
          <p className="text-sm text-gray-500">
            Add <code className="bg-gray-200 px-2 py-1 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code> to
            your <code className="bg-gray-200 px-2 py-1 rounded">.env</code> file
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div ref={mapContainer} className="w-full h-full" />

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white p-3 rounded-lg shadow-lg">
        <h4 className="text-sm font-semibold mb-2">Vessel Types</h4>
        <div className="space-y-1">
          {[
            { type: 'Tanker', color: '#ef4444' },
            { type: 'Dry', color: '#f59e0b' },
            { type: 'Container', color: '#3b82f6' },
            { type: 'LNG', color: '#10b981' },
            { type: 'LPG', color: '#8b5cf6' },
          ].map(({ type, color }) => (
            <div key={type} className="flex items-center text-xs">
              <span
                className="w-3 h-3 rounded-full mr-2"
                style={{ backgroundColor: color }}
              />
              {type}
            </div>
          ))}
        </div>
      </div>

      {/* Drawing instructions */}
      <div className="absolute top-4 left-14 bg-white px-3 py-2 rounded-lg shadow text-sm">
        Draw a polygon to create a geofence
      </div>

      {/* Name modal */}
      {showNameModal && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Name Your Geofence</h3>
            <input
              type="text"
              value={geofenceName}
              onChange={(e) => setGeofenceName(e.target.value)}
              placeholder="e.g., Singapore Strait"
              className="w-full px-3 py-2 border rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowNameModal(false);
                  setPendingGeofence(null);
                  setGeofenceName('');
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveGeofence}
                disabled={!geofenceName.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export default MapView;
