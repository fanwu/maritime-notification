import { prisma } from './prisma';
import { evaluateGeofence, evaluateCompare, evaluateChange } from './geofence';
import { emitNotification, emitVesselUpdate } from './socket-manager';
import type { VesselState, Notification, Geofence, EvaluationResult } from '@/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Process a vessel state update and evaluate all matching rules
 */
export async function processVesselState(vessel: VesselState): Promise<void> {
  // Emit vessel update to all connected clients
  emitVesselUpdate(vessel);

  // Get all active rules for vessel.state data source
  const rules = await prisma.clientRule.findMany({
    where: {
      isActive: true,
      type: {
        dataSource: 'vessel.state',
      },
    },
    include: {
      type: true,
      geofence: true,
    },
  });

  for (const rule of rules) {
    try {
      // Parse JSON fields
      const condition = JSON.parse(rule.condition);
      const filters = JSON.parse(rule.filters);
      const stateTracking = JSON.parse(rule.type.stateTracking);

      // Apply filters
      if (!matchesFilters(vessel, filters)) {
        continue;
      }

      // Get previous state if state tracking is enabled
      let previousState: Record<string, unknown> | undefined;
      if (stateTracking.enabled) {
        const savedState = await prisma.ruleState.findUnique({
          where: {
            ruleId_entityId: {
              ruleId: rule.id,
              entityId: String(vessel.IMO),
            },
          },
        });
        if (savedState) {
          previousState = JSON.parse(savedState.state);
        }
      }

      // Evaluate the condition
      const conditionSchema = JSON.parse(rule.type.conditionSchema);
      const result = await evaluateCondition(
        conditionSchema.evaluator,
        vessel,
        condition,
        previousState,
        rule.geofence ? parseGeofence(rule.geofence) : undefined
      );

      // Update state if tracking is enabled
      if (stateTracking.enabled && result.context) {
        await prisma.ruleState.upsert({
          where: {
            ruleId_entityId: {
              ruleId: rule.id,
              entityId: String(vessel.IMO),
            },
          },
          update: {
            state: JSON.stringify(result.context),
            lastEvaluatedAt: new Date(),
          },
          create: {
            ruleId: rule.id,
            entityId: String(vessel.IMO),
            state: JSON.stringify(result.context),
          },
        });
      }

      // Generate notification if triggered
      if (result.triggered) {
        const notification = await createNotification(rule, vessel, result);
        emitNotification(rule.clientId, notification);
      }
    } catch (error) {
      console.error(`Error processing rule ${rule.id}:`, error);
    }
  }
}

/**
 * Check if vessel matches the rule filters
 */
function matchesFilters(vessel: VesselState, filters: Record<string, unknown>): boolean {
  if (filters.imos && Array.isArray(filters.imos)) {
    if (!filters.imos.includes(vessel.IMO)) {
      return false;
    }
  }

  if (filters.vesselTypes && Array.isArray(filters.vesselTypes)) {
    if (!filters.vesselTypes.includes(vessel.VesselType)) {
      return false;
    }
  }

  if (filters.vesselClasses && Array.isArray(filters.vesselClasses)) {
    if (!filters.vesselClasses.includes(vessel.VesselClass)) {
      return false;
    }
  }

  if (filters.areas && Array.isArray(filters.areas)) {
    if (!filters.areas.includes(vessel.AreaName) && !filters.areas.includes(vessel.AreaNameLevel1)) {
      return false;
    }
  }

  return true;
}

/**
 * Evaluate condition based on evaluator type
 */
async function evaluateCondition(
  evaluator: string,
  vessel: VesselState,
  condition: Record<string, unknown>,
  previousState?: Record<string, unknown>,
  geofence?: Geofence
): Promise<EvaluationResult> {
  switch (evaluator) {
    case 'geofence':
      if (!geofence) {
        return { triggered: false };
      }
      return evaluateGeofence(
        vessel,
        geofence,
        condition.triggerOn as 'enter' | 'exit' | 'both',
        previousState as { isInside: boolean } | undefined
      );

    case 'compare':
      return evaluateCompare(vessel, condition as { field: string; operator: string; value: number });

    case 'change':
      return evaluateChange(
        vessel,
        condition as { field: string; from?: string[]; to?: string[] },
        previousState as { value: unknown } | undefined
      );

    default:
      console.warn(`Unknown evaluator: ${evaluator}`);
      return { triggered: false };
  }
}

/**
 * Parse geofence from database model
 */
function parseGeofence(dbGeofence: {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  geofenceType: string;
  coordinates: string;
  centerLat: number | null;
  centerLng: number | null;
  radiusKm: number | null;
  isActive: boolean;
}): Geofence {
  return {
    id: dbGeofence.id,
    clientId: dbGeofence.clientId,
    name: dbGeofence.name,
    description: dbGeofence.description || undefined,
    geofenceType: dbGeofence.geofenceType as 'polygon' | 'circle',
    coordinates: JSON.parse(dbGeofence.coordinates),
    centerLat: dbGeofence.centerLat || undefined,
    centerLng: dbGeofence.centerLng || undefined,
    radiusKm: dbGeofence.radiusKm || undefined,
    isActive: dbGeofence.isActive,
  };
}

/**
 * Create and store a notification
 */
async function createNotification(
  rule: {
    id: string;
    clientId: string;
    typeId: string;
    name: string;
    type: { defaultTemplate: string };
  },
  vessel: VesselState,
  result: EvaluationResult
): Promise<Notification> {
  const template = JSON.parse(rule.type.defaultTemplate);

  // Build context for template
  const context: Record<string, unknown> = {
    ...result.context,
    vesselName: vessel.VesselName || `IMO ${vessel.IMO}`,
    imo: vessel.IMO,
    vesselType: vessel.VesselType,
    vesselClass: vessel.VesselClass,
    latitude: vessel.Latitude,
    longitude: vessel.Longitude,
    speed: vessel.Speed,
    destination: vessel.AISDestination,
    status: vessel.VesselVoyageStatus,
    timestamp: new Date().toISOString(),
  };

  // Simple template rendering
  const title = renderTemplate(template.title, context);
  const message = renderTemplate(template.message, context);

  const notification = await prisma.notification.create({
    data: {
      clientId: rule.clientId,
      ruleId: rule.id,
      typeId: rule.typeId,
      title,
      message,
      payload: JSON.stringify(context),
      priority: 'medium',
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  return {
    id: notification.id,
    clientId: notification.clientId,
    ruleId: notification.ruleId || undefined,
    typeId: notification.typeId,
    title: notification.title,
    message: notification.message,
    payload: context,
    priority: notification.priority as 'low' | 'medium' | 'high',
    status: notification.status as 'pending' | 'delivered' | 'read',
    createdAt: notification.createdAt.toISOString(),
  };
}

/**
 * Simple template rendering with {{variable}} syntax
 */
function renderTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return context[key] !== undefined ? String(context[key]) : `{{${key}}}`;
  });
}
