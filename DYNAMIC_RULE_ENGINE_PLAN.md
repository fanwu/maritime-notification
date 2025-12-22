# Dynamic Rule Engine - Implementation Plan

## 1. Overview

### 1.1 Goal
Enable users to create custom notification rules through the UI without writing code. Users should be able to:
- Select any vessel state field (Speed, VesselStatus, Draught, etc.)
- Define conditions (equals, greater than, changed from X to Y, etc.)
- Combine multiple conditions with AND/OR logic
- Filter which vessels the rule applies to

### 1.2 Example Use Cases
| Use Case | Description |
|----------|-------------|
| **Vessel Stopped** | Notify when `Speed = 0` AND `VesselName = 'Northern Spirit'` |
| **Status Change** | Notify when `VesselVoyageStatus` changes from `Voyage` to `Discharging` |
| **Draught Alert** | Notify when `Draught > 15` (deep draft vessel) |
| **Area Entry** | Notify when `AreaName` changes to `Singapore` |
| **Heading Change** | Notify when `Heading` changes by more than 30 degrees |

### 1.3 Current State
The system currently supports 3 hardcoded evaluators in `processor.ts`:
- `geofence` - Point-in-polygon with enter/exit detection
- `compare` - Numeric comparison (gt, lt, eq, etc.)
- `change` - Field value change with optional from/to filters

The limitation is that:
1. The `change` evaluator only tracks `AISDestination` in Redis
2. Adding new tracked fields requires code changes
3. No support for combining multiple conditions
4. No UI for creating custom rules

---

## 2. Architecture Design

### 2.1 Dynamic Condition Schema

```typescript
// A single condition that can be evaluated
interface Condition {
  id: string;                    // Unique identifier for this condition
  field: string;                 // VesselState field name (e.g., "Speed", "VesselVoyageStatus")
  operator: ConditionOperator;   // Type of comparison
  value?: unknown;               // Static value for comparison
  values?: unknown[];            // Multiple values for "in" / "not_in" operators
  previousField?: string;        // For comparing with previous state (e.g., previous Speed)
  tolerance?: number;            // For "changed_by" operator
}

type ConditionOperator =
  | 'eq'           // equals
  | 'neq'          // not equals
  | 'gt'           // greater than
  | 'gte'          // greater than or equal
  | 'lt'           // less than
  | 'lte'          // less than or equal
  | 'in'           // value in array
  | 'not_in'       // value not in array
  | 'contains'     // string contains
  | 'starts_with'  // string starts with
  | 'changed'      // value changed from previous state
  | 'changed_to'   // changed to specific value(s)
  | 'changed_from' // changed from specific value(s)
  | 'changed_by';  // numeric value changed by at least X

// A rule combines conditions with logic
interface DynamicRule {
  id: string;
  name: string;
  description?: string;
  logic: 'AND' | 'OR';           // How to combine conditions
  conditions: Condition[];
  filters: VesselFilters;        // Which vessels to apply to
  template: NotificationTemplate;
  isActive: boolean;
}

interface VesselFilters {
  imos?: number[];               // Specific IMO numbers
  vesselTypes?: string[];        // e.g., ["Dry", "Tanker"]
  vesselClasses?: string[];      // e.g., ["PanamaxDry", "Capesize"]
  areas?: string[];              // e.g., ["Singapore", "Rotterdam"]
  vesselNames?: string[];        // e.g., ["Northern Spirit"]
}

interface NotificationTemplate {
  title: string;                 // Supports {{field}} placeholders
  message: string;               // Supports {{field}} placeholders
  priority: 'low' | 'medium' | 'high';
}
```

### 2.2 State Tracking Architecture

To support `changed`, `changed_to`, `changed_from`, and `changed_by` operators, we need to track previous values for any field, not just `AISDestination`.

**Current approach** (limited):
```typescript
// Only tracks AISDestination
const previousValue = await getCachedDestination(vessel.IMO);
```

**New approach** (generic):
```typescript
// Track any field dynamically based on active rules
const previousState = await getCachedVesselState(vessel.IMO);
// previousState = { Speed: 12.5, VesselVoyageStatus: "Voyage", Heading: 180, ... }
```

**Redis Key Structure:**
```
vessel:state:{IMO} -> Hash {
  Speed: "12.5",
  VesselVoyageStatus: "Voyage",
  Heading: "180",
  AISDestination: "SINGAPORE",
  ...
}
```

### 2.3 Evaluation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Vessel State Message                          │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│               1. Get Previous Vessel State                       │
│                  from Redis cache                                │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│               2. Get Active Dynamic Rules                        │
│                  from database (cached)                          │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│               3. For Each Rule:                                  │
│                  a. Apply vessel filters                         │
│                  b. Evaluate each condition                      │
│                  c. Combine with AND/OR logic                    │
│                  d. If triggered, generate notification          │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│               4. Update Vessel State Cache                       │
│                  in Redis (for next evaluation)                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema Changes

### 3.1 New Notification Type: `dynamic_rule`

```sql
-- Add new notification type for dynamic rules
INSERT INTO notification_types (type_id, name, description, data_source, condition_schema, default_template, state_tracking) VALUES
(
    'dynamic_rule',
    'Dynamic Rule',
    'User-defined notification rule with custom conditions',
    'vessel.state',
    '{"evaluator": "dynamic", "supportsComposite": true}',
    '{"title": "Alert: {{vesselName}}", "message": "Rule triggered for {{vesselName}} (IMO: {{imo}})"}',
    '{"enabled": true, "trackAllFields": true}'
);
```

### 3.2 Extended Client Rules Schema

The existing `client_rules` table already supports JSONB conditions. We'll use this structure:

```typescript
// Example client_rules.condition for a dynamic rule:
{
  "logic": "AND",
  "conditions": [
    {
      "id": "c1",
      "field": "Speed",
      "operator": "eq",
      "value": 0
    },
    {
      "id": "c2",
      "field": "VesselVoyageStatus",
      "operator": "changed_to",
      "values": ["Discharging", "Loading"]
    }
  ]
}

// Example client_rules.settings for custom template:
{
  "template": {
    "title": "Vessel Stopped: {{vesselName}}",
    "message": "{{vesselName}} has stopped (Speed=0) and is now {{VesselVoyageStatus}}"
  }
}
```

---

## 4. Implementation Plan

### Phase 1: Core Dynamic Evaluator (Backend)

#### 4.1 Create Dynamic Condition Evaluator

**File: `packages/vessel-processor/src/dynamic-evaluator.ts`**

```typescript
import type { VesselState } from './types.js';

export interface Condition {
  id: string;
  field: string;
  operator: ConditionOperator;
  value?: unknown;
  values?: unknown[];
  tolerance?: number;
}

export type ConditionOperator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'not_in' | 'contains' | 'starts_with'
  | 'changed' | 'changed_to' | 'changed_from' | 'changed_by';

export interface DynamicCondition {
  logic: 'AND' | 'OR';
  conditions: Condition[];
}

export interface EvaluationContext {
  currentState: VesselState;
  previousState: Partial<VesselState> | null;
}

export function evaluateCondition(
  condition: Condition,
  ctx: EvaluationContext
): { triggered: boolean; details: Record<string, unknown> } {
  const currentValue = ctx.currentState[condition.field as keyof VesselState];
  const previousValue = ctx.previousState?.[condition.field as keyof VesselState];

  switch (condition.operator) {
    case 'eq':
      return { triggered: currentValue === condition.value, details: { currentValue } };
    case 'neq':
      return { triggered: currentValue !== condition.value, details: { currentValue } };
    case 'gt':
      return { triggered: Number(currentValue) > Number(condition.value), details: { currentValue } };
    case 'gte':
      return { triggered: Number(currentValue) >= Number(condition.value), details: { currentValue } };
    case 'lt':
      return { triggered: Number(currentValue) < Number(condition.value), details: { currentValue } };
    case 'lte':
      return { triggered: Number(currentValue) <= Number(condition.value), details: { currentValue } };
    case 'in':
      return { triggered: condition.values?.includes(currentValue) ?? false, details: { currentValue } };
    case 'not_in':
      return { triggered: !condition.values?.includes(currentValue) ?? true, details: { currentValue } };
    case 'contains':
      return { triggered: String(currentValue).includes(String(condition.value)), details: { currentValue } };
    case 'starts_with':
      return { triggered: String(currentValue).startsWith(String(condition.value)), details: { currentValue } };
    case 'changed':
      return {
        triggered: previousValue !== undefined && previousValue !== null && currentValue !== previousValue,
        details: { currentValue, previousValue }
      };
    case 'changed_to':
      return {
        triggered: previousValue !== currentValue && (condition.values?.includes(currentValue) ?? false),
        details: { currentValue, previousValue }
      };
    case 'changed_from':
      return {
        triggered: previousValue !== currentValue && (condition.values?.includes(previousValue) ?? false),
        details: { currentValue, previousValue }
      };
    case 'changed_by':
      const diff = Math.abs(Number(currentValue) - Number(previousValue ?? 0));
      return {
        triggered: previousValue !== undefined && diff >= (condition.tolerance ?? 0),
        details: { currentValue, previousValue, difference: diff }
      };
    default:
      return { triggered: false, details: {} };
  }
}

export function evaluateDynamicRule(
  rule: DynamicCondition,
  ctx: EvaluationContext
): { triggered: boolean; conditionResults: Map<string, boolean> } {
  const results = new Map<string, boolean>();

  for (const condition of rule.conditions) {
    const result = evaluateCondition(condition, ctx);
    results.set(condition.id, result.triggered);
  }

  const triggered = rule.logic === 'AND'
    ? Array.from(results.values()).every(v => v)
    : Array.from(results.values()).some(v => v);

  return { triggered, conditionResults: results };
}
```

#### 4.2 Update Processor to Support Dynamic Rules

**File: `packages/vessel-processor/src/processor.ts`** (additions)

```typescript
import { evaluateDynamicRule, DynamicCondition, EvaluationContext } from './dynamic-evaluator.js';
import { getCachedVesselFullState, cacheVesselFullState, getTrackedFields } from './redis.js';

// In the switch statement for evaluators, add:
case 'dynamic': {
  const dynamicCondition = rule.condition as DynamicCondition;

  // Get previous full state from Redis
  const previousState = await getCachedVesselFullState(vessel.IMO);

  const ctx: EvaluationContext = {
    currentState: vessel,
    previousState,
  };

  const evalResult = evaluateDynamicRule(dynamicCondition, ctx);

  result = {
    triggered: evalResult.triggered,
    context: {
      conditionResults: Object.fromEntries(evalResult.conditionResults),
      ...vessel,
    },
  };
  break;
}

// After processing all rules, cache the current state for change detection:
await cacheVesselFullState(vessel);
```

#### 4.3 Extend Redis Caching

**File: `packages/vessel-processor/src/redis.ts`** (additions)

```typescript
// Fields to track for change detection
const TRACKED_FIELDS = [
  'Speed', 'VesselVoyageStatus', 'VesselStatus', 'AISDestination',
  'AreaName', 'AreaNameLevel1', 'Heading', 'Draught', 'Course',
  'IsSeagoing'  // Important: true = on voyage, false = stopped
];

export async function getCachedVesselFullState(imo: number): Promise<Partial<VesselState> | null> {
  const redis = getRedis();
  const data = await redis.hgetall(`vessel:state:${imo}`);
  if (!data || Object.keys(data).length === 0) return null;

  // Parse stored values back to appropriate types
  return Object.entries(data).reduce((acc, [key, value]) => {
    acc[key] = isNaN(Number(value)) ? value : Number(value);
    return acc;
  }, {} as Partial<VesselState>);
}

export async function cacheVesselFullState(vessel: VesselState): Promise<void> {
  const redis = getRedis();
  const data: Record<string, string> = {};

  for (const field of TRACKED_FIELDS) {
    const value = vessel[field as keyof VesselState];
    if (value !== undefined && value !== null) {
      data[field] = String(value);
    }
  }

  if (Object.keys(data).length > 0) {
    await redis.hset(`vessel:state:${vessel.IMO}`, data);
    await redis.expire(`vessel:state:${vessel.IMO}`, 86400); // 24 hour TTL
  }
}
```

---

### Phase 2: UI Components (Frontend)

#### 4.4 Dynamic Rule Builder Component

**File: `apps/web/src/components/DynamicRuleBuilder.tsx`**

A new component that allows users to:
1. Add/remove conditions
2. Select field from dropdown (populated from VesselState fields)
3. Select operator from dropdown (based on field type)
4. Enter value or select from discovered values
5. Choose AND/OR logic
6. Customize notification template

```tsx
// Key features:
// - Field selector with type hints (numeric vs string)
// - Operator selector that adapts based on field type
// - Value input with autocomplete for discovered values
// - Preview of what the rule will do
// - Test button to simulate against sample data
```

#### 4.5 Updated Notification Settings

Add a new section to `NotificationSettings.tsx` for creating dynamic rules.

---

### Phase 3: Demo Implementation

For the demo, we'll implement **2 specific dynamic rule types** to prove the concept:

#### Demo Rule 1: "Vessel Stopped Alert"
- **Condition Option A**: `Speed = 0`
- **Condition Option B**: `IsSeagoing` changed from `true` to `false` (more semantic - vessel stopped voyage)
- **Optional Filter**: Specific vessel name or IMO
- **Template**: "{{vesselName}} has stopped moving at {{AreaName}}"

> **Note**: `IsSeagoing` is a boolean field that indicates whether a vessel is currently on a voyage. When it changes from `true` to `false`, it means the vessel has stopped its voyage - this is more meaningful than just checking `Speed = 0` which could be temporary (e.g., waiting for port clearance).

#### Demo Rule 2: "Voyage Status Change Alert"
- **Condition**: `VesselVoyageStatus` changed to specific status
- **Options**: Discharging, Loading, Waiting, etc.
- **Template**: "{{vesselName}} status changed to {{VesselVoyageStatus}}"

---

## 5. Implementation Steps

### Step 1: Backend - Dynamic Evaluator (2-3 hours)
1. [ ] Create `dynamic-evaluator.ts` with condition evaluation logic
2. [ ] Add `getCachedVesselFullState` and `cacheVesselFullState` to Redis module
3. [ ] Add `dynamic` evaluator case to `processor.ts`
4. [ ] Test with hardcoded dynamic rules

### Step 2: Database - Seed Dynamic Rule Types (30 min)
1. [ ] Add `dynamic_rule` notification type to database
2. [ ] Add `vessel_stopped` and `status_change_alert` as predefined dynamic types
3. [ ] Create migration script if needed

### Step 3: API - Dynamic Rule CRUD (1-2 hours)
1. [ ] Add API endpoints for creating/updating dynamic rules
2. [ ] Add API endpoint to get available fields and operators
3. [ ] Add API endpoint to preview/test a rule

### Step 4: Frontend - Simple Rule Builder (2-3 hours)
1. [ ] Create simplified `DynamicRuleBuilder` component
2. [ ] Add "Vessel Stopped" rule card to settings
3. [ ] Add "Status Change" rule card to settings
4. [ ] Wire up to API

### Step 5: Testing & Demo (1 hour)
1. [ ] Create test cases for dynamic evaluator
2. [ ] Test end-to-end with mock data
3. [ ] Demo walkthrough

---

## 6. Code Structure

```
packages/vessel-processor/src/
├── processor.ts           # Updated to support 'dynamic' evaluator
├── dynamic-evaluator.ts   # NEW: Generic condition evaluation engine
├── redis.ts               # Extended with full state caching
└── types.ts               # Extended with DynamicCondition types

apps/web/src/
├── components/
│   ├── NotificationSettings.tsx  # Extended with dynamic rules section
│   └── DynamicRuleBuilder.tsx    # NEW: UI for building rules
└── app/api/
    └── rules/
        ├── route.ts              # CRUD for dynamic rules
        ├── fields/route.ts       # Get available fields/operators
        └── test/route.ts         # Test rule against sample data
```

---

## 7. Available Fields for Dynamic Rules

Based on `VesselState` interface:

| Field | Type | Example Operators | Notes |
|-------|------|-------------------|-------|
| `Speed` | number | eq, gt, lt, changed_by | 0 = stopped/anchored |
| `Heading` | number | eq, changed_by | Significant heading change |
| `Course` | number | eq, changed_by | Course deviation |
| `Draught` | number | gt, lt, changed_by | Loading/unloading indicator |
| `VesselStatus` | string | eq, changed, changed_to | Voyage, Repair, etc. |
| `VesselVoyageStatus` | string | eq, changed, changed_to, changed_from | Discharging, Loading, Waiting, etc. |
| `AISDestination` | string | eq, contains, changed, changed_to | Port/destination changes |
| `AreaName` | string | eq, in, changed, changed_to | Geographic area |
| `AreaNameLevel1` | string | eq, in, changed | Regional area |
| `VesselType` | string | eq, in | Dry, Tanker, etc. |
| `VesselClass` | string | eq, in | PanamaxDry, Capesize, etc. |
| `IsSeagoing` | boolean | eq, changed, changed_from | **Key field**: `false` when vessel stopped voyage |

---

## 8. Example Dynamic Rules (JSON)

### Example 1a: Vessel Stopped (using Speed)
```json
{
  "typeId": "dynamic_rule",
  "name": "Vessel Stopped Alert",
  "condition": {
    "logic": "AND",
    "conditions": [
      { "id": "speed", "field": "Speed", "operator": "eq", "value": 0 }
    ]
  },
  "filters": {
    "vesselNames": ["Northern Spirit"]
  },
  "settings": {
    "template": {
      "title": "Vessel Stopped: {{vesselName}}",
      "message": "{{vesselName}} (IMO: {{imo}}) has stopped moving at {{AreaName}}"
    }
  }
}
```

### Example 1b: Vessel Stopped Voyage (using IsSeagoing)
```json
{
  "typeId": "dynamic_rule",
  "name": "Vessel Stopped Voyage",
  "condition": {
    "logic": "AND",
    "conditions": [
      { "id": "seagoing", "field": "IsSeagoing", "operator": "changed_from", "values": [true] }
    ]
  },
  "filters": {
    "vesselNames": ["Northern Spirit"]
  },
  "settings": {
    "template": {
      "title": "Voyage Ended: {{vesselName}}",
      "message": "{{vesselName}} (IMO: {{imo}}) has ended its voyage and is now at {{AreaName}}"
    }
  }
}
```

### Example 2: Status Change to Discharging
```json
{
  "typeId": "dynamic_rule",
  "name": "Vessel Now Discharging",
  "condition": {
    "logic": "AND",
    "conditions": [
      { "id": "status", "field": "VesselVoyageStatus", "operator": "changed_to", "values": ["Discharging"] }
    ]
  },
  "filters": {},
  "settings": {
    "template": {
      "title": "Status Changed: {{vesselName}}",
      "message": "{{vesselName}} is now {{VesselVoyageStatus}} at {{AreaName}}"
    }
  }
}
```

### Example 3: Deep Draft Vessel Entering Area
```json
{
  "typeId": "dynamic_rule",
  "name": "Deep Draft in Singapore",
  "condition": {
    "logic": "AND",
    "conditions": [
      { "id": "draught", "field": "Draught", "operator": "gt", "value": 14 },
      { "id": "area", "field": "AreaName", "operator": "changed_to", "values": ["Singapore"] }
    ]
  },
  "filters": {},
  "settings": {
    "template": {
      "title": "Deep Draft Alert",
      "message": "{{vesselName}} (draught: {{Draught}}m) has entered Singapore"
    }
  }
}
```

---

## 9. UI Mockup

### Dynamic Rules Section in Settings

```
┌─────────────────────────────────────────────────────────────────┐
│  Dynamic Rules                                        [+ Add]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 🛑 Vessel Stopped Alert                          [ON]    │   │
│  │   When: Speed = 0                                         │   │
│  │   For: Northern Spirit                                    │   │
│  │                                                 [Edit]    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 📦 Vessel Discharging                           [ON]     │   │
│  │   When: VesselVoyageStatus changes to "Discharging"      │   │
│  │   For: All vessels                                        │   │
│  │                                                 [Edit]    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Rule Editor Dialog

```
┌─────────────────────────────────────────────────────────────────┐
│  Create Dynamic Rule                                     [X]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Rule Name: [Vessel Stopped Alert_________________]              │
│                                                                  │
│  Conditions (AND ▼)                                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ [Speed____▼] [equals___▼] [0_______] [x]                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│  [+ Add Condition]                                               │
│                                                                  │
│  Apply to Vessels:                                               │
│  ○ All vessels                                                   │
│  ● Specific vessels: [Northern Spirit, Pacific Star] [+ Add]   │
│                                                                  │
│  Notification:                                                   │
│  Title: [Vessel Stopped: {{vesselName}}__________]               │
│  Message: [{{vesselName}} stopped at {{AreaName}}]               │
│                                                                  │
│                                          [Cancel] [Save Rule]   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. Success Criteria

1. **Backend**: Dynamic evaluator correctly evaluates composite conditions
2. **State Tracking**: Previous vessel state cached and used for change detection
3. **UI**: Users can create a "Vessel Stopped" rule from the settings UI
4. **UI**: Users can create a "Status Changed" rule from the settings UI
5. **Demo**: End-to-end flow works with mock Kafka data
6. **Extensibility**: Clear pattern for adding new operators without code changes

---

## 11. Future Enhancements (Out of Scope for Demo)

- Complex nested conditions (AND of ORs)
- Time-based conditions (vessel stopped for > 1 hour)
- Aggregate conditions (speed dropped by 50% in last 10 minutes)
- ML-powered anomaly detection
- Template builder with variable picker UI
- Rule sharing/templates marketplace
