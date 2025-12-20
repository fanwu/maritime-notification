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
  focusGeofence: (geofenceId: string) => void;
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
  const [isDrawing, setIsDrawing] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [pendingGeofence, setPendingGeofence] = useState<[number, number][] | null>(null);
  const [geofenceName, setGeofenceName] = useState('');
  const [mapLoaded, setMapLoaded] = useState(false);

  // Create the handle object - we'll update focusGeofence when geofences change
  const geofencesRef = useRef(geofences);
  geofencesRef.current = geofences;
  const vesselsRef = useRef(vessels);
  vesselsRef.current = vessels;

  const handleRef = useRef<MapViewHandle>({
    focusVessel: (imo: number) => {
      const vessel = vesselsRef.current.find((v) => v.IMO === imo);
      if (vessel && map.current) {
        // Fly to vessel location
        map.current.flyTo({
          center: [vessel.Longitude, vessel.Latitude],
          zoom: 10,
          duration: 1000,
        });

        // Show popup for the vessel
        setTimeout(() => {
          if (!map.current) return;
          new mapboxgl.Popup({ offset: 15 })
            .setLngLat([vessel.Longitude, vessel.Latitude])
            .setHTML(`
              <div class="p-3">
                <h3 class="font-semibold text-gray-900">${vessel.VesselName || `IMO: ${vessel.IMO}`}</h3>
                <p class="text-sm text-gray-500">${vessel.VesselType || ''} - ${vessel.VesselClass || ''}</p>
                <div class="mt-2 text-sm space-y-1">
                  <div><span class="text-gray-500">Speed:</span> ${vessel.Speed || 0} kn</div>
                  <div><span class="text-gray-500">Destination:</span> ${vessel.AISDestination || 'N/A'}</div>
                  <div><span class="text-gray-500">Area:</span> ${vessel.AreaName || 'N/A'}</div>
                </div>
              </div>
            `)
            .addTo(map.current);
        }, 1100);
      }
    },
    focusGeofence: (geofenceId: string) => {
      const geofence = geofencesRef.current.find((g) => g.id === geofenceId);
      if (geofence && map.current && geofence.coordinates.length > 0) {
        // Calculate bounds of the geofence
        const coords = geofence.coordinates;
        const bounds = coords.reduce(
          (acc, coord) => ({
            minLng: Math.min(acc.minLng, coord[0]),
            maxLng: Math.max(acc.maxLng, coord[0]),
            minLat: Math.min(acc.minLat, coord[1]),
            maxLat: Math.max(acc.maxLat, coord[1]),
          }),
          { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity }
        );

        // Fit map to bounds with padding
        map.current.fitBounds(
          [
            [bounds.minLng, bounds.minLat],
            [bounds.maxLng, bounds.maxLat],
          ],
          {
            padding: 100,
            duration: 1000,
          }
        );
      }
    },
  });

  // Expose via ref
  useImperativeHandle(ref, () => handleRef.current, []);

  // Also notify parent via callback
  useEffect(() => {
    if (onMapReady) {
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

      // Add vessels source with clustering
      map.current?.addSource('vessels', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 10,
        clusterRadius: 50,
      });

      // Cluster circles
      map.current?.addLayer({
        id: 'vessel-clusters',
        type: 'circle',
        source: 'vessels',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#51bbd6', 100,
            '#f1f075', 500,
            '#f28cb1'
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            15, 100,
            20, 500,
            25
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });

      // Cluster count labels
      map.current?.addLayer({
        id: 'vessel-cluster-count',
        type: 'symbol',
        source: 'vessels',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12,
        },
      });

      // Individual vessel points
      map.current?.addLayer({
        id: 'vessel-points',
        type: 'circle',
        source: 'vessels',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': [
            'match',
            ['get', 'vesselType'],
            'Tanker', '#ef4444',
            'Cargo', '#3b82f6',
            'Container', '#22c55e',
            '#6b7280'
          ],
          'circle-radius': 6,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });

      // Click on cluster to zoom
      map.current?.on('click', 'vessel-clusters', (e) => {
        const features = map.current?.queryRenderedFeatures(e.point, { layers: ['vessel-clusters'] });
        if (!features?.length) return;
        const clusterId = features[0].properties?.cluster_id;
        const source = map.current?.getSource('vessels') as mapboxgl.GeoJSONSource;
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err || !map.current) return;
          const geometry = features[0].geometry as GeoJSON.Point;
          map.current.easeTo({
            center: geometry.coordinates as [number, number],
            zoom: zoom || 10,
          });
        });
      });

      // Click on vessel point for popup
      map.current?.on('click', 'vessel-points', (e) => {
        const features = map.current?.queryRenderedFeatures(e.point, { layers: ['vessel-points'] });
        if (!features?.length) return;
        const props = features[0].properties;
        const geometry = features[0].geometry as GeoJSON.Point;
        new mapboxgl.Popup({ offset: 15 })
          .setLngLat(geometry.coordinates as [number, number])
          .setHTML(`
            <div class="p-3">
              <h3 class="font-semibold text-gray-900">${props?.vesselName || `IMO: ${props?.imo}`}</h3>
              <p class="text-sm text-gray-500">${props?.vesselType || ''} - ${props?.vesselClass || ''}</p>
              <div class="mt-2 text-sm space-y-1">
                <div><span class="text-gray-500">Speed:</span> ${props?.speed || 0} kn</div>
                <div><span class="text-gray-500">Destination:</span> ${props?.destination || 'N/A'}</div>
                <div><span class="text-gray-500">Area:</span> ${props?.area || 'N/A'}</div>
              </div>
            </div>
          `)
          .addTo(map.current!);
      });

      // Cursor changes
      map.current?.on('mouseenter', 'vessel-clusters', () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current?.on('mouseleave', 'vessel-clusters', () => {
        if (map.current) map.current.getCanvas().style.cursor = '';
      });
      map.current?.on('mouseenter', 'vessel-points', () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current?.on('mouseleave', 'vessel-points', () => {
        if (map.current) map.current.getCanvas().style.cursor = '';
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

  // Update vessels GeoJSON source (fast WebGL rendering with clustering)
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    const source = map.current.getSource('vessels') as mapboxgl.GeoJSONSource;
    if (!source) return;

    // Convert vessels to GeoJSON features
    const features = vessels
      .filter((v) =>
        typeof v.Longitude === 'number' &&
        typeof v.Latitude === 'number' &&
        !isNaN(v.Longitude) &&
        !isNaN(v.Latitude)
      )
      .map((vessel) => ({
        type: 'Feature' as const,
        properties: {
          imo: vessel.IMO,
          vesselName: vessel.VesselName || '',
          vesselType: vessel.VesselType || '',
          vesselClass: vessel.VesselClass || '',
          speed: vessel.Speed || 0,
          heading: vessel.Heading || 0,
          destination: vessel.AISDestination || '',
          status: vessel.VesselVoyageStatus || '',
          area: vessel.AreaName || '',
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [vessel.Longitude, vessel.Latitude],
        },
      }));

    source.setData({
      type: 'FeatureCollection',
      features,
    });
  }, [vessels, mapLoaded]);

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
