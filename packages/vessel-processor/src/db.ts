// PostgreSQL database client with PostGIS support
import pg from 'pg';
import { config } from './config.js';
import type { ClientRule, Geofence, NotificationType, Notification, RuleState } from './types.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      password: config.postgres.password,
      max: config.postgres.maxConnections,
    });

    pool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err);
    });
  }
  return pool;
}

export async function connectDb(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT NOW()');
    console.log(`PostgreSQL connected: ${result.rows[0].now}`);
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('PostgreSQL connection closed');
  }
}

// Get all active rules for vessel.state data source
export async function getActiveRules(): Promise<ClientRule[]> {
  const pool = getPool();
  const result = await pool.query(`
    SELECT
      r.id, r."clientId" as client_id, r."typeId" as type_id, r.name, r.condition, r.filters,
      r.settings, r."isActive" as is_active, r."geofenceId" as geofence_id,
      nt.id as nt_id, nt."typeId" as nt_type_id, nt.name as nt_name,
      nt."dataSource" as data_source, nt."conditionSchema" as condition_schema,
      nt."filterSchema" as filter_schema, nt."defaultTemplate" as default_template,
      nt."stateTracking" as state_tracking,
      g.id as g_id, g."clientId" as g_client_id, g.name as g_name,
      g."geofenceType" as geofence_type, g.coordinates, g."centerLat" as center_lat,
      g."centerLng" as center_lng, g."radiusKm" as radius_km, g."isActive" as g_is_active
    FROM "ClientRule" r
    JOIN "NotificationType" nt ON r."typeId" = nt."typeId"
    LEFT JOIN "Geofence" g ON r."geofenceId" = g.id
    WHERE r."isActive" = true AND nt."dataSource" = 'vessel.state'
  `);

  return result.rows.map((row) => ({
    id: row.id,
    clientId: row.client_id,
    typeId: row.type_id,
    name: row.name,
    condition: row.condition,
    filters: row.filters || {},
    settings: row.settings || {},
    isActive: row.is_active,
    geofenceId: row.geofence_id,
    geofence: row.g_id ? {
      id: row.g_id,
      clientId: row.g_client_id,
      name: row.g_name,
      geofenceType: row.geofence_type,
      coordinates: row.coordinates,
      centerLat: row.center_lat,
      centerLng: row.center_lng,
      radiusKm: row.radius_km,
      isActive: row.g_is_active,
    } : undefined,
    notificationType: {
      id: row.nt_id,
      typeId: row.nt_type_id,
      name: row.nt_name,
      dataSource: row.data_source,
      conditionSchema: row.condition_schema,
      filterSchema: row.filter_schema || {},
      defaultTemplate: row.default_template,
      stateTracking: row.state_tracking || { enabled: false },
      isActive: true,
    },
  }));
}

// Get rule state for a specific rule and entity
export async function getRuleState(ruleId: string, entityId: string): Promise<RuleState | null> {
  const pool = getPool();
  const result = await pool.query(
    'SELECT "ruleId", "entityId", state, "lastEvaluatedAt" FROM "RuleState" WHERE "ruleId" = $1 AND "entityId" = $2',
    [ruleId, entityId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    ruleId: row.ruleId,
    entityId: row.entityId,
    state: row.state,
    lastEvaluatedAt: row.lastEvaluatedAt,
  };
}

// Upsert rule state
export async function upsertRuleState(ruleId: string, entityId: string, state: Record<string, unknown>): Promise<void> {
  const pool = getPool();
  await pool.query(`
    INSERT INTO "RuleState" (id, "ruleId", "entityId", state, "lastEvaluatedAt")
    VALUES (gen_random_uuid(), $1, $2, $3, NOW())
    ON CONFLICT ("ruleId", "entityId")
    DO UPDATE SET state = $3, "lastEvaluatedAt" = NOW()
  `, [ruleId, entityId, JSON.stringify(state)]);
}

// Create a notification
export async function createNotification(notification: Omit<Notification, 'id' | 'createdAt'>): Promise<Notification> {
  const pool = getPool();
  const result = await pool.query(`
    INSERT INTO "Notification" (id, "clientId", "ruleId", "typeId", title, message, payload, priority, status, "expiresAt")
    VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, "clientId", "ruleId", "typeId", title, message, payload, priority, status, "createdAt", "expiresAt"
  `, [
    notification.clientId,
    notification.ruleId || null,
    notification.typeId,
    notification.title,
    notification.message,
    JSON.stringify(notification.payload),
    notification.priority,
    notification.status,
    notification.expiresAt,
  ]);

  const row = result.rows[0];
  return {
    id: row.id,
    clientId: row.clientId,
    ruleId: row.ruleId,
    typeId: row.typeId,
    title: row.title,
    message: row.message,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    priority: row.priority,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

// Get all active geofences (for caching)
export async function getActiveGeofences(): Promise<Geofence[]> {
  const pool = getPool();
  const result = await pool.query(`
    SELECT id, "clientId", name, description, "geofenceType", coordinates,
           "centerLat", "centerLng", "radiusKm", "isActive"
    FROM "Geofence"
    WHERE "isActive" = true
  `);

  return result.rows.map((row) => ({
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    description: row.description,
    geofenceType: row.geofenceType,
    coordinates: typeof row.coordinates === 'string' ? JSON.parse(row.coordinates) : row.coordinates,
    centerLat: row.centerLat,
    centerLng: row.centerLng,
    radiusKm: row.radiusKm,
    isActive: row.isActive,
  }));
}
