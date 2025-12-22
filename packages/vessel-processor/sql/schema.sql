-- PostgreSQL Schema for Vessel Notification System
-- Requires PostGIS extension for geospatial queries

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================
-- Notification Types (admin-managed templates)
-- ============================================
CREATE TABLE notification_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type_id VARCHAR(100) UNIQUE NOT NULL,  -- e.g., "geofence_alert", "destination_change"
    name VARCHAR(255) NOT NULL,
    description TEXT,
    data_source VARCHAR(100) NOT NULL,     -- e.g., "vessel.state"
    condition_schema JSONB NOT NULL,       -- Schema for condition validation
    filter_schema JSONB DEFAULT '{}',      -- Schema for filter validation
    default_template JSONB NOT NULL,       -- {title, message} templates
    state_tracking JSONB DEFAULT '{"enabled": false}',
    ui_schema JSONB DEFAULT '{}',          -- UI hints for rule builder
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notification_types_type_id ON notification_types(type_id);
CREATE INDEX idx_notification_types_active ON notification_types(is_active) WHERE is_active = true;

-- ============================================
-- Geofences (polygons/circles for geographic alerts)
-- ============================================
CREATE TABLE geofences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    geofence_type VARCHAR(20) NOT NULL CHECK (geofence_type IN ('polygon', 'circle')),
    coordinates JSONB NOT NULL,            -- [[lng, lat], ...] for polygon
    center_lat DOUBLE PRECISION,           -- For circles
    center_lng DOUBLE PRECISION,           -- For circles
    radius_km DOUBLE PRECISION,            -- For circles
    -- PostGIS geometry for efficient spatial queries
    geometry GEOMETRY(GEOMETRY, 4326),
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_geofences_client ON geofences(client_id);
CREATE INDEX idx_geofences_active ON geofences(is_active) WHERE is_active = true;
CREATE INDEX idx_geofences_geometry ON geofences USING GIST(geometry);

-- ============================================
-- Client Rules (notification rules per client)
-- ============================================
CREATE TABLE client_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id VARCHAR(255) NOT NULL,
    type_id VARCHAR(100) NOT NULL REFERENCES notification_types(type_id),
    name VARCHAR(255) NOT NULL,
    condition JSONB NOT NULL,              -- Condition parameters
    filters JSONB DEFAULT '{}',            -- Entity filters (imos, vesselTypes, etc.)
    settings JSONB DEFAULT '{}',           -- Client-specific settings
    geofence_id UUID REFERENCES geofences(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_client_rules_client ON client_rules(client_id);
CREATE INDEX idx_client_rules_type ON client_rules(type_id);
CREATE INDEX idx_client_rules_active ON client_rules(is_active) WHERE is_active = true;
CREATE INDEX idx_client_rules_geofence ON client_rules(geofence_id) WHERE geofence_id IS NOT NULL;

-- ============================================
-- Rule States (for enter/exit/change detection)
-- ============================================
CREATE TABLE rule_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id UUID NOT NULL REFERENCES client_rules(id) ON DELETE CASCADE,
    entity_id VARCHAR(255) NOT NULL,       -- e.g., IMO number
    state JSONB NOT NULL,                  -- Current state
    last_evaluated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(rule_id, entity_id)
);

CREATE INDEX idx_rule_states_rule ON rule_states(rule_id);
CREATE INDEX idx_rule_states_entity ON rule_states(entity_id);

-- ============================================
-- Notifications (generated alerts)
-- ============================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id VARCHAR(255) NOT NULL,
    rule_id UUID REFERENCES client_rules(id) ON DELETE SET NULL,
    type_id VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    message TEXT NOT NULL,
    payload JSONB NOT NULL,                -- All contextual data
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'read')),
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_notifications_client ON notifications(client_id, created_at DESC);
CREATE INDEX idx_notifications_status ON notifications(client_id, status);
CREATE INDEX idx_notifications_type ON notifications(type_id);
CREATE INDEX idx_notifications_expires ON notifications(expires_at);

-- ============================================
-- User Preferences
-- ============================================
CREATE TABLE user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id VARCHAR(255) UNIQUE NOT NULL,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_preferences_client ON user_preferences(client_id);

-- ============================================
-- Vessel State Cache (for change detection)
-- ============================================
CREATE TABLE vessel_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    imo INTEGER UNIQUE NOT NULL,
    state_hash VARCHAR(64),                -- Hash of significant fields
    last_state JSONB NOT NULL,             -- Full vessel state
    last_updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vessel_states_imo ON vessel_states(imo);

-- ============================================
-- Functions
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
CREATE TRIGGER tr_notification_types_updated_at
    BEFORE UPDATE ON notification_types
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_geofences_updated_at
    BEFORE UPDATE ON geofences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_client_rules_updated_at
    BEFORE UPDATE ON client_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_user_preferences_updated_at
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Delete expired notifications (run via pg_cron or scheduled task)
CREATE OR REPLACE FUNCTION delete_expired_notifications()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM notifications WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Seed Data: Default Notification Types
-- ============================================
INSERT INTO notification_types (type_id, name, description, data_source, condition_schema, default_template, state_tracking) VALUES
(
    'geofence_alert',
    'Geofence Alert',
    'Triggered when a vessel enters or exits a defined geographic area',
    'vessel.state',
    '{"evaluator": "geofence", "fields": ["triggerOn"], "triggerOn": {"type": "enum", "values": ["enter", "exit", "both"]}}',
    '{"title": "Geofence Alert: {{vesselName}}", "message": "{{vesselName}} (IMO: {{imo}}) has {{action}} {{geofenceName}}"}',
    '{"enabled": true, "fields": ["isInside"]}'
),
(
    'destination_change',
    'Destination Change',
    'Triggered when a vessel changes its AIS destination',
    'vessel.state',
    '{"evaluator": "change", "fields": ["field", "from", "to"], "field": "AISDestination"}',
    '{"title": "Destination Changed: {{vesselName}}", "message": "{{vesselName}} (IMO: {{imo}}) destination changed from {{previousValue}} to {{currentValue}}"}',
    '{"enabled": true, "fields": ["value"]}'
),
(
    'speed_alert',
    'Speed Alert',
    'Triggered when a vessel speed exceeds or falls below a threshold',
    'vessel.state',
    '{"evaluator": "compare", "fields": ["field", "operator", "value"], "field": "Speed"}',
    '{"title": "Speed Alert: {{vesselName}}", "message": "{{vesselName}} (IMO: {{imo}}) speed is {{currentValue}} knots (threshold: {{operator}} {{threshold}})"}',
    '{"enabled": false}'
),
(
    'status_change',
    'Voyage Status Change',
    'Triggered when a vessel voyage status changes',
    'vessel.state',
    '{"evaluator": "change", "fields": ["field", "from", "to"], "field": "VesselVoyageStatus"}',
    '{"title": "Status Changed: {{vesselName}}", "message": "{{vesselName}} (IMO: {{imo}}) status changed from {{previousValue}} to {{currentValue}}"}',
    '{"enabled": true, "fields": ["value"]}'
);

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE notification_types IS 'Admin-managed notification type definitions';
COMMENT ON TABLE geofences IS 'Geographic areas for vessel tracking alerts';
COMMENT ON TABLE client_rules IS 'Client-specific notification rules';
COMMENT ON TABLE rule_states IS 'State tracking for enter/exit/change detection';
COMMENT ON TABLE notifications IS 'Generated notifications with 7-day expiry';
COMMENT ON TABLE vessel_states IS 'Vessel state cache for change detection';
