// Vessel state processor - evaluates rules and generates notifications
import { v4 as uuidv4 } from 'uuid';
import { config } from './config.js';
import { getActiveRules, getRuleState, upsertRuleState, createNotification } from './db.js';
import {
  publishNotification,
  publishVesselUpdate,
  getCachedGeofenceState,
  cacheGeofenceState,
  getCachedDestination,
  cacheDestination,
  cacheVesselPosition,
} from './redis.js';
import { evaluateGeofence, evaluateCompare, evaluateChange, isVesselInGeofence } from './geofence.js';
import type { VesselState, ClientRule, EvaluationResult, Notification } from './types.js';

// Cache for rules (refreshed periodically)
let rulesCache: ClientRule[] = [];
let rulesCacheTime = 0;
const RULES_CACHE_TTL = 60000; // 1 minute

/**
 * Check if vessel has valid coordinates for geofence evaluation
 */
function hasValidCoordinates(vessel: VesselState): boolean {
  return (
    typeof vessel.Latitude === 'number' &&
    typeof vessel.Longitude === 'number' &&
    !isNaN(vessel.Latitude) &&
    !isNaN(vessel.Longitude) &&
    isFinite(vessel.Latitude) &&
    isFinite(vessel.Longitude)
  );
}

/**
 * Get active rules (with caching)
 */
async function getRules(): Promise<ClientRule[]> {
  const now = Date.now();
  if (now - rulesCacheTime > RULES_CACHE_TTL) {
    try {
      rulesCache = await getActiveRules();
      rulesCacheTime = now;
      console.log(`Refreshed rules cache: ${rulesCache.length} rules`);
    } catch (error) {
      console.error('Error refreshing rules cache:', error);
      // Return stale cache if refresh fails
    }
  }
  return rulesCache;
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
 * Simple template rendering with {{variable}} syntax
 */
function renderTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return context[key] !== undefined ? String(context[key]) : `{{${key}}}`;
  });
}

/**
 * Generate notification from rule and evaluation result
 */
async function generateNotification(
  rule: ClientRule,
  vessel: VesselState,
  result: EvaluationResult
): Promise<Notification> {
  const template = rule.notificationType?.defaultTemplate || { title: 'Notification', message: '' };

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

  // Render templates
  const title = renderTemplate(template.title, context);
  const message = renderTemplate(template.message, context);

  // Calculate expiry
  const expiresAt = new Date(
    Date.now() + config.processing.notificationExpiryDays * 24 * 60 * 60 * 1000
  ).toISOString();

  // Save to database
  const notification = await createNotification({
    clientId: rule.clientId,
    ruleId: rule.id,
    typeId: rule.typeId,
    title,
    message,
    payload: context,
    priority: 'medium',
    status: 'pending',
    expiresAt,
  });

  return notification;
}

/**
 * Process a single vessel state update
 */
export async function processVesselState(vessel: VesselState): Promise<void> {
  // Cache vessel position for map display
  await cacheVesselPosition(vessel);

  // Publish vessel update for real-time map
  await publishVesselUpdate(vessel);

  // Get active rules
  const rules = await getRules();

  for (const rule of rules) {
    try {
      // Apply filters
      if (!matchesFilters(vessel, rule.filters)) {
        continue;
      }

      // Get evaluator type from condition schema
      const conditionSchema = rule.notificationType?.conditionSchema as { evaluator?: string } | undefined;
      const evaluator = conditionSchema?.evaluator || 'unknown';

      let result: EvaluationResult;

      switch (evaluator) {
        case 'geofence': {
          // Skip if vessel or geofence doesn't have valid coordinates
          if (!rule.geofence || !hasValidCoordinates(vessel)) {
            continue;
          }
          const condition = rule.condition as { triggerOn?: 'enter' | 'exit' | 'both' };
          const triggerOn = condition.triggerOn || 'both';

          // Get previous geofence state from Redis
          const wasInside = await getCachedGeofenceState(vessel.IMO, rule.geofence.id);

          result = evaluateGeofence(vessel, rule.geofence, triggerOn, wasInside);

          // Update geofence state in Redis
          const isInside = result.context?.isInside as boolean;
          await cacheGeofenceState(vessel.IMO, rule.geofence.id, isInside);
          break;
        }

        case 'compare': {
          const condition = rule.condition as { field: string; operator: string; value: number };
          result = evaluateCompare(vessel, condition);
          break;
        }

        case 'change': {
          const condition = rule.condition as { field: string; from?: string[]; to?: string[] };

          // Get previous value from Redis
          let previousValue: unknown = null;
          if (condition.field === 'AISDestination') {
            previousValue = await getCachedDestination(vessel.IMO);
          }

          result = evaluateChange(vessel, condition, previousValue);

          // Update cached value
          if (condition.field === 'AISDestination') {
            await cacheDestination(vessel.IMO, vessel.AISDestination || '');
          }
          break;
        }

        default:
          console.warn(`Unknown evaluator: ${evaluator}`);
          continue;
      }

      // Generate and publish notification if triggered
      if (result.triggered) {
        const notification = await generateNotification(rule, vessel, result);
        await publishNotification(rule.clientId, notification);
        console.log(`Notification created: ${notification.title} for client ${rule.clientId}`);
      }
    } catch (error) {
      console.error(`Error processing rule ${rule.id}:`, error);
    }
  }
}

/**
 * Process a batch of vessel states
 */
export async function processVesselBatch(vessels: VesselState[]): Promise<void> {
  const startTime = Date.now();

  for (const vessel of vessels) {
    await processVesselState(vessel);
  }

  const elapsed = Date.now() - startTime;
  console.log(`Processed ${vessels.length} vessels in ${elapsed}ms`);
}
