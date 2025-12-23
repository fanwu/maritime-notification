// Geofence evaluation using Turf.js
// @ts-expect-error - turf types don't export correctly with NodeNext resolution
import * as turf from '@turf/turf';
import type { VesselState, EvaluationResult, Geofence } from './types.js';

/**
 * Check if a coordinate is a valid number
 */
function isValidCoord(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Check if a point has valid coordinates
 */
function isValidPoint(point: [unknown, unknown]): point is [number, number] {
  return isValidCoord(point[0]) && isValidCoord(point[1]);
}

/**
 * Check if a polygon has valid coordinates (at least 4 points, all valid)
 */
function isValidPolygon(polygon: unknown[]): polygon is [number, number][] {
  if (!Array.isArray(polygon) || polygon.length < 4) return false;
  return polygon.every((coord) =>
    Array.isArray(coord) && coord.length >= 2 && isValidPoint([coord[0], coord[1]])
  );
}

/**
 * Check if a point is inside a polygon
 */
export function isPointInPolygon(
  point: [number, number], // [lng, lat]
  polygon: [number, number][] // [[lng, lat], ...]
): boolean {
  // Validate inputs
  if (!isValidPoint(point) || !isValidPolygon(polygon)) {
    return false;
  }
  const turfPoint = turf.point(point);
  const turfPolygon = turf.polygon([polygon]);
  return turf.booleanPointInPolygon(turfPoint, turfPolygon);
}

/**
 * Check if a point is inside a circle
 */
export function isPointInCircle(
  point: [number, number], // [lng, lat]
  center: [number, number], // [lng, lat]
  radiusKm: number
): boolean {
  // Validate inputs
  if (!isValidPoint(point) || !isValidPoint(center) || !isValidCoord(radiusKm)) {
    return false;
  }
  const from = turf.point(center);
  const to = turf.point(point);
  const distance = turf.distance(from, to, { units: 'kilometers' });
  return distance <= radiusKm;
}

/**
 * Check if vessel is inside a geofence
 */
export function isVesselInGeofence(vessel: VesselState, geofence: Geofence): boolean {
  // Validate vessel coordinates first
  if (!isValidCoord(vessel.Longitude) || !isValidCoord(vessel.Latitude)) {
    return false;
  }

  const point: [number, number] = [vessel.Longitude, vessel.Latitude];

  if (geofence.geofenceType === 'circle' && geofence.centerLng && geofence.centerLat && geofence.radiusKm) {
    return isPointInCircle(point, [geofence.centerLng, geofence.centerLat], geofence.radiusKm);
  } else {
    return isPointInPolygon(point, geofence.coordinates);
  }
}

/**
 * Evaluate geofence condition with enter/exit detection
 */
export function evaluateGeofence(
  vessel: VesselState,
  geofence: Geofence,
  triggerOn: 'enter' | 'exit' | 'both',
  wasInside: boolean | null
): EvaluationResult {
  const isCurrentlyInside = isVesselInGeofence(vessel, geofence);

  // No previous state, can't detect transition
  if (wasInside === null) {
    return {
      triggered: false,
      context: {
        isInside: isCurrentlyInside,
        geofenceName: geofence.name,
        geofenceId: geofence.id,
        action: null,
      },
    };
  }

  // Determine if we should trigger
  let triggered = false;
  let transition: 'enter' | 'exit' | null = null;

  if (!wasInside && isCurrentlyInside) {
    // Entered the geofence
    transition = 'enter';
    triggered = triggerOn === 'enter' || triggerOn === 'both';
  } else if (wasInside && !isCurrentlyInside) {
    // Exited the geofence
    transition = 'exit';
    triggered = triggerOn === 'exit' || triggerOn === 'both';
  }

  return {
    triggered,
    transition,
    context: {
      isInside: isCurrentlyInside,
      geofenceName: geofence.name,
      geofenceId: geofence.id,
      action: transition === 'enter' ? 'entered' : transition === 'exit' ? 'exited' : null,
    },
  };
}

/**
 * Evaluate compare condition (e.g., Speed > 15)
 */
export function evaluateCompare(
  vessel: VesselState,
  condition: { field: string; operator: string; value: number }
): EvaluationResult {
  const fieldValue = vessel[condition.field as keyof VesselState] as number;

  let triggered = false;
  switch (condition.operator) {
    case 'gt':
      triggered = fieldValue > condition.value;
      break;
    case 'lt':
      triggered = fieldValue < condition.value;
      break;
    case 'gte':
      triggered = fieldValue >= condition.value;
      break;
    case 'lte':
      triggered = fieldValue <= condition.value;
      break;
    case 'eq':
      triggered = fieldValue === condition.value;
      break;
  }

  return {
    triggered,
    context: {
      field: condition.field,
      operator: condition.operator,
      threshold: condition.value,
      currentValue: fieldValue,
    },
  };
}

/**
 * Check if a value matches a pattern (supports wildcards)
 * Patterns:
 *   "*text*" - contains "text" (case-insensitive)
 *   "*text"  - ends with "text" (case-insensitive)
 *   "text*"  - starts with "text" (case-insensitive)
 *   "text"   - exact match (case-insensitive)
 */
function matchesPattern(value: string, pattern: string): boolean {
  const valueLower = value.toLowerCase();
  const patternLower = pattern.toLowerCase();

  const startsWithWildcard = patternLower.startsWith('*');
  const endsWithWildcard = patternLower.endsWith('*');

  // Remove wildcards to get the actual text to match
  let searchText = patternLower;
  if (startsWithWildcard) searchText = searchText.slice(1);
  if (endsWithWildcard) searchText = searchText.slice(0, -1);

  if (startsWithWildcard && endsWithWildcard) {
    // *text* - contains
    return valueLower.includes(searchText);
  } else if (startsWithWildcard) {
    // *text - ends with
    return valueLower.endsWith(searchText);
  } else if (endsWithWildcard) {
    // text* - starts with
    return valueLower.startsWith(searchText);
  } else {
    // exact match
    return valueLower === patternLower;
  }
}

/**
 * Check if a value matches any of the patterns in the list
 */
function matchesAnyPattern(value: string, patterns: string[]): boolean {
  return patterns.some(pattern => matchesPattern(value, pattern));
}

/**
 * Evaluate change condition (e.g., destination changed)
 * Supports wildcard patterns in from/to filters:
 *   "*SINGAPORE*" matches any destination containing "SINGAPORE"
 */
export function evaluateChange(
  vessel: VesselState,
  condition: { field: string; from?: string[]; to?: string[] },
  previousValue: unknown
): EvaluationResult {
  const currentValue = vessel[condition.field as keyof VesselState];

  // No previous state, can't detect change
  if (previousValue === undefined || previousValue === null) {
    return {
      triggered: false,
      context: { currentValue, previousValue: null },
    };
  }

  // Check if value changed
  if (currentValue === previousValue) {
    return {
      triggered: false,
      context: { currentValue, previousValue },
    };
  }

  // Skip if either value is empty (avoid notifications for "" -> "something")
  const prevStr = String(previousValue).trim();
  const currStr = String(currentValue ?? '').trim();
  if (!prevStr || !currStr) {
    return {
      triggered: false,
      context: { currentValue, previousValue, reason: 'empty_value' },
    };
  }

  // Check from/to filters if specified (supports wildcard patterns)
  let triggered = true;

  if (condition.from && condition.from.length > 0) {
    triggered = triggered && matchesAnyPattern(prevStr, condition.from);
  }

  if (condition.to && condition.to.length > 0) {
    triggered = triggered && matchesAnyPattern(currStr, condition.to);
  }

  return {
    triggered,
    transition: 'change',
    context: {
      field: condition.field,
      previousValue: prevStr,
      currentValue: currStr,
    },
  };
}
