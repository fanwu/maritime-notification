import * as turf from '@turf/turf';
import landData from '@/data/land.json';

interface LandFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

// Cache the land features for performance
let landFeatures: LandFeature[] | null = null;

function getLandFeatures(): LandFeature[] {
  if (!landFeatures) {
    landFeatures = landData.features as LandFeature[];
  }
  return landFeatures;
}

/**
 * Check if a point (longitude, latitude) is on water (not on land)
 */
export function isOnWater(longitude: number, latitude: number): boolean {
  const point = turf.point([longitude, latitude]);
  const features = getLandFeatures();

  for (const feature of features) {
    try {
      if (turf.booleanPointInPolygon(point, feature as turf.Feature<turf.Polygon | turf.MultiPolygon>)) {
        return false; // Point is on land
      }
    } catch {
      // Skip invalid features
    }
  }

  return true; // Point is on water
}
