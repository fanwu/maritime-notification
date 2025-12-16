import * as turf from '@turf/turf';
import type { VesselState, EvaluationResult, Geofence } from '@/types';

/**
 * Check if a point is inside a polygon using ray casting algorithm
 */
export function isPointInPolygon(
  point: [number, number], // [lng, lat]
  polygon: [number, number][] // [[lng, lat], ...]
): boolean {
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
  const from = turf.point(center);
  const to = turf.point(point);
  const distance = turf.distance(from, to, { units: 'kilometers' });
  return distance <= radiusKm;
}

/**
 * Evaluate geofence condition
 */
export function evaluateGeofence(
  vessel: VesselState,
  geofence: Geofence,
  triggerOn: 'enter' | 'exit' | 'both',
  previousState?: { isInside: boolean }
): EvaluationResult {
  const point: [number, number] = [vessel.Longitude, vessel.Latitude];

  let isCurrentlyInside: boolean;

  if (geofence.geofenceType === 'circle' && geofence.centerLng && geofence.centerLat && geofence.radiusKm) {
    isCurrentlyInside = isPointInCircle(
      point,
      [geofence.centerLng, geofence.centerLat],
      geofence.radiusKm
    );
  } else {
    isCurrentlyInside = isPointInPolygon(point, geofence.coordinates);
  }

  const wasInside = previousState?.isInside ?? false;

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
 * Evaluate change condition (e.g., destination changed)
 */
export function evaluateChange(
  vessel: VesselState,
  condition: { field: string; from?: string[]; to?: string[] },
  previousState?: { value: unknown }
): EvaluationResult {
  const currentValue = vessel[condition.field as keyof VesselState];
  const previousValue = previousState?.value;

  // No previous state, can't detect change
  if (previousValue === undefined) {
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

  // Check from/to filters if specified
  let triggered = true;

  if (condition.from && condition.from.length > 0) {
    triggered = triggered && condition.from.includes(String(previousValue));
  }

  if (condition.to && condition.to.length > 0) {
    triggered = triggered && condition.to.includes(String(currentValue));
  }

  return {
    triggered,
    transition: 'change',
    context: {
      field: condition.field,
      previousValue,
      currentValue,
    },
  };
}
