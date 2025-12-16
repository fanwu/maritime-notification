# Signal Ocean Notification System - Design Document

## 1. Executive Summary

This document outlines the architecture and implementation plan for a real-time notification system for Signal Ocean's maritime platform. The system will:

- Poll Signal Ocean APIs (starting with LatestVesselState) and process vessel data
- Allow clients to define custom notification rules (geofencing, fixture conditions, etc.)
- Deliver notifications to web and mobile applications with offline support
- Support 500 clients initially, scaling to 10,000+ clients
- Track ~50,000 vessels with per-minute polling

---

## 2. System Requirements

### 2.1 Functional Requirements

| Requirement | Description |
|-------------|-------------|
| Data Ingestion | Poll LatestVesselState API once per minute for all vessels |
| Client Rules | Allow clients to define notification triggers (geofence, fixture conditions) |
| Geofencing | Notify only on enter/exit events, not continuous movement within zone |
| Deduplication | Avoid duplicate notifications from multiple data sources |
| Multi-tenancy | Each client has isolated notification settings |
| Notification Delivery | Support web UI and mobile push notifications |
| Offline Support | Queue notifications when user is offline, deliver on reconnect |
| History | Retain 7 days of notification history, viewable in UI |

### 2.2 Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Latency | Notifications delivered within 30 seconds of data change |
| Throughput | Handle 50K vessels × 1 poll/min = ~833 vessel updates/second |
| Scalability | Support 10K clients with independent rule sets |
| Availability | 99.9% uptime |
| Data Retention | 7 days for notifications |

---

## 3. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Signal Ocean APIs                                   │
│                    (LatestVesselState, Voyages, Fixtures)                       │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           DATA INGESTION LAYER                                   │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐             │
│  │  API Poller     │───▶│  Message Queue  │───▶│  Data Processor │             │
│  │  (Scheduler)    │    │  (Raw Events)   │    │  (Normalizer)   │             │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           STATE MANAGEMENT LAYER                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐             │
│  │  Vessel State   │    │  Client Rules   │    │  Geofence State │             │
│  │  Cache (Redis)  │    │  Database       │    │  (In/Out Track) │             │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           RULES ENGINE LAYER                                     │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐             │
│  │  Rule Evaluator │───▶│  Deduplication  │───▶│  Notification   │             │
│  │  (Per Client)   │    │  Service        │    │  Queue          │             │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           DELIVERY LAYER                                         │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐             │
│  │  WebSocket      │    │  Push Service   │    │  Notification   │             │
│  │  Server         │    │  (Mobile)       │    │  Storage        │             │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                           │
│  ┌─────────────────────────────┐    ┌─────────────────────────────┐             │
│  │  Web Application            │    │  Mobile Application         │             │
│  │  (React + WebSocket)        │    │  (React Native + Push)      │             │
│  └─────────────────────────────┘    └─────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Component Design & Technology Options

### 4.1 Message Queue

The message queue handles high-throughput vessel data ingestion and notification distribution.

| Option | Pros | Cons | Best For |
|--------|------|------|----------|
| **Apache Kafka** | Extremely high throughput (millions/sec), durable, replay capability, excellent for event sourcing | Complex setup, requires ZooKeeper (or KRaft), higher operational overhead | Large scale, event sourcing needs |
| **Amazon SQS + SNS** | Fully managed, no ops overhead, integrates with AWS Lambda, scales automatically | Vendor lock-in, higher latency than Kafka, limited message ordering | AWS-centric deployments |
| **RabbitMQ** | Easy setup, flexible routing, good for complex routing patterns, lower latency | Lower throughput than Kafka, requires more manual scaling | Moderate scale, complex routing |
| **Redis Streams** | Very low latency, simple setup, can double as cache | Less durable than Kafka, limited replay capability | Low-latency, moderate scale |

**Recommendation:** **Apache Kafka** for production (handles scale, provides event replay for debugging), **Redis Streams** for initial development/demo (simpler setup).

---

### 4.2 Database

#### 4.2.1 Primary Database (Client Rules, Notification History)

| Option | Pros | Cons | Best For |
|--------|------|------|----------|
| **PostgreSQL** | ACID compliance, excellent JSON support (JSONB), PostGIS for geospatial, mature ecosystem | Scaling requires more effort (read replicas, partitioning) | Complex queries, geospatial data |
| **MongoDB** | Flexible schema, built-in geospatial queries, horizontal scaling (sharding) | Less strict consistency, query performance can vary | Rapidly changing schemas |
| **CockroachDB** | Distributed SQL, auto-scaling, PostgreSQL compatible | Newer, smaller ecosystem, higher latency for writes | Global distribution needs |

**Recommendation:** **PostgreSQL with PostGIS** - Best balance of features, excellent geospatial support for geofencing, JSONB for flexible rule storage.

#### 4.2.2 Cache (Vessel State, Geofence State)

| Option | Pros | Cons | Best For |
|--------|------|------|----------|
| **Redis** | Extremely fast, rich data structures, pub/sub, Lua scripting | Single-threaded, memory-bound | Hot data caching, real-time state |
| **Memcached** | Simple, fast, multi-threaded | Limited data structures, no persistence | Simple key-value caching |
| **Redis Cluster** | Horizontal scaling, high availability | More complex setup | Large-scale caching |

**Recommendation:** **Redis Cluster** - Fast reads/writes for vessel state tracking, supports complex data structures for geofence state management.

---

### 4.3 Backend Services

| Option | Pros | Cons | Best For |
|--------|------|------|----------|
| **Node.js (TypeScript)** | Excellent async I/O, large ecosystem, good for real-time apps, same language as frontend | Single-threaded CPU-bound tasks | Real-time, I/O heavy workloads |
| **Python (FastAPI)** | Clean syntax, excellent data processing libraries, good async support | Slower than Node.js for I/O, GIL limitations | Data processing, ML integration |
| **Go** | Excellent concurrency, fast compilation, low memory footprint | Smaller ecosystem, more verbose | High-performance microservices |
| **Rust** | Maximum performance, memory safety, zero-cost abstractions | Steeper learning curve, longer development time | Performance-critical components |

**Recommendation:**
- **Node.js (TypeScript)** for API Gateway and WebSocket services (real-time focus)
- **Go** for high-throughput data processing services (API poller, rule evaluator)

---

### 4.4 Real-Time Communication

| Option | Pros | Cons | Best For |
|--------|------|------|----------|
| **Socket.io** | Easy to use, automatic fallback, room support, widespread adoption | Higher overhead than raw WebSocket | Rapid development, browser compatibility |
| **ws (Node.js)** | Lightweight, fast, low-level control | Requires manual reconnection logic, no built-in rooms | Performance-critical WebSocket |
| **Pusher/Ably** | Fully managed, global infrastructure, presence features | Cost at scale, vendor dependency | Quick to market, global reach |
| **GraphQL Subscriptions** | Type-safe, integrates with GraphQL API | Additional complexity if not using GraphQL | GraphQL-based systems |

**Recommendation:** **Socket.io** for web (ease of use, automatic reconnection), **Firebase Cloud Messaging (FCM)** for mobile push.

---

### 4.5 Mobile Push Notifications

| Option | Pros | Cons | Best For |
|--------|------|------|----------|
| **Firebase Cloud Messaging (FCM)** | Free, supports iOS/Android, reliable delivery | Google dependency, limited analytics | Cross-platform mobile push |
| **Amazon SNS** | AWS integration, supports multiple platforms | Less feature-rich than FCM | AWS-centric deployments |
| **OneSignal** | Rich features, A/B testing, segmentation | Costs at scale | Marketing-focused notifications |

**Recommendation:** **Firebase Cloud Messaging** - Industry standard, free tier sufficient, excellent reliability.

---

### 4.6 Frontend Framework

| Option | Pros | Cons | Best For |
|--------|------|------|----------|
| **React** | Largest ecosystem, excellent tooling, component-based | Requires additional libraries for state management | Complex interactive UIs |
| **Vue.js** | Gentle learning curve, good documentation, built-in state management | Smaller ecosystem than React | Rapid development |
| **Next.js (React)** | SSR/SSG, file-based routing, API routes, excellent DX | More opinionated, larger bundle size | Production React apps |
| **SvelteKit** | Excellent performance, less boilerplate, compiled output | Smaller ecosystem, fewer developers | Performance-focused apps |

**Recommendation:** **Next.js** - Best developer experience, built-in API routes for demo backend, excellent React ecosystem for maps and real-time features.

---

### 4.7 Map Library (for Geofencing UI)

| Option | Pros | Cons | Best For |
|--------|------|------|----------|
| **Mapbox GL JS** | Beautiful maps, excellent performance, drawing tools | Costs at scale, requires API key | Professional map applications |
| **Leaflet** | Free, lightweight, large plugin ecosystem | Less performant with many markers | Simple map needs |
| **Google Maps** | Familiar UI, excellent documentation | Costs at scale, less customizable | Consumer-facing apps |
| **OpenLayers** | Powerful, free, extensive GIS features | Steeper learning curve | Complex GIS applications |
| **react-map-gl** | React wrapper for Mapbox, declarative API | Inherits Mapbox costs | React + Mapbox integration |

**Recommendation:** **Mapbox GL JS with react-map-gl** - Best drawing tools for custom polygon geofencing, smooth performance for 50K vessel markers.

---

### 4.8 Container Orchestration

| Option | Pros | Cons | Best For |
|--------|------|------|----------|
| **Kubernetes (K8s)** | Industry standard, auto-scaling, self-healing, portable | Complex setup, steep learning curve | Large-scale production |
| **AWS ECS/Fargate** | Simpler than K8s, serverless option, AWS integration | Vendor lock-in | AWS deployments |
| **Docker Compose** | Simple, good for development | Not production-ready for scale | Local development, small deployments |

**Recommendation:** **Kubernetes** for production (portable, scalable), **Docker Compose** for local development.

---

## 5. Detailed Component Design

### 5.1 Data Ingestion Service

```
┌─────────────────────────────────────────────────────────────┐
│                    API Poller Service                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐       │
│  │  Scheduler  │──▶│  API Client │──▶│  Publisher  │       │
│  │  (1 min)    │   │  (Batch)    │   │  (Kafka)    │       │
│  └─────────────┘   └─────────────┘   └─────────────┘       │
│                                                              │
│  Strategy: Batch fetch all 50K vessels, publish to Kafka    │
│  Topic: vessel.state.raw                                     │
└─────────────────────────────────────────────────────────────┘
```

**Key Design Decisions:**
- Fetch all vessels in batches (e.g., 1000 at a time)
- Publish raw events to Kafka for downstream processing
- Separate polling from processing for better scalability

### 5.2 Vessel State Processor

```go
// Pseudocode for vessel state processing
func processVesselState(event VesselStateEvent) {
    // 1. Get previous state from Redis
    prevState := redis.Get(f"vessel:{event.IMO}:state")

    // 2. Check if state actually changed (deduplication)
    if !hasSignificantChange(prevState, event) {
        return // Skip, no meaningful change
    }

    // 3. Update current state in Redis
    redis.Set(f"vessel:{event.IMO}:state", event)

    // 4. Publish state change event
    kafka.Publish("vessel.state.changed", event)
}

func hasSignificantChange(prev, curr VesselState) bool {
    // Position change > 0.001 degrees (~100m)
    // Status change
    // Area change
    // etc.
}
```

### 5.3 Rules Engine

```
┌─────────────────────────────────────────────────────────────┐
│                      Rules Engine                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Input: Vessel State Change Event                           │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  For each client with rules matching this vessel:    │   │
│  │                                                       │   │
│  │  1. Load client rules from cache/DB                  │   │
│  │  2. Evaluate each rule:                              │   │
│  │     - Geofence rules (polygon containment)           │   │
│  │     - Fixture rules (rate, cargo, quantity)          │   │
│  │     - Status rules (voyage status changes)           │   │
│  │  3. Check geofence state (was inside? now inside?)   │   │
│  │  4. Generate notification if rule triggers           │   │
│  │  5. Deduplicate against recent notifications         │   │
│  │  6. Publish to notification queue                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Geofencing Design

### 6.1 User Experience Recommendation

**Recommended Approach: Interactive Polygon Drawing**

Users should be able to:
1. **Draw custom polygons** - Click to add points, double-click to complete
2. **Use predefined regions** - Common maritime zones (e.g., Singapore Strait, Gulf of Mexico)
3. **Draw circles** - Click center, drag to set radius (useful for port areas)
4. **Import GeoJSON** - For advanced users with existing geofence data

```
┌─────────────────────────────────────────────────────────────┐
│                    Geofence UI Mockup                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                       │   │
│  │              [Interactive Map]                        │   │
│  │                                                       │   │
│  │    Draw Tools: [Polygon] [Circle] [Rectangle]        │   │
│  │                                                       │   │
│  │         ○───────○                                    │   │
│  │        /         \                                   │   │
│  │       /    🚢     \      ← User-drawn polygon        │   │
│  │      ○             ○                                 │   │
│  │       \           /                                  │   │
│  │        ○─────────○                                   │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  Geofence Name: [Singapore Approach Zone        ]           │
│  Trigger On:    [●] Enter  [●] Exit  [ ] Both              │
│  Vessel Filter: [Tanker ▼] [All Sizes ▼]                   │
│                                                              │
│  [Save Geofence]  [Cancel]                                  │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Geofence Data Model

```typescript
interface Geofence {
  id: string;
  clientId: string;
  name: string;
  type: 'polygon' | 'circle';

  // For polygon
  coordinates?: [number, number][]; // Array of [lng, lat]

  // For circle
  center?: [number, number]; // [lng, lat]
  radiusKm?: number;

  // Trigger configuration
  triggerOn: 'enter' | 'exit' | 'both';

  // Vessel filters (optional)
  vesselFilters?: {
    vesselTypes?: string[];
    vesselClasses?: string[];
    imos?: number[];
  };

  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### 6.3 Geofence Evaluation Algorithm

```typescript
// Point-in-polygon using ray casting algorithm
function isPointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

// Geofence state tracking (Redis)
interface GeofenceState {
  vesselIMO: number;
  geofenceId: string;
  isInside: boolean;
  lastChecked: Date;
}

// Notification logic
function evaluateGeofence(vessel: VesselState, geofence: Geofence): Notification | null {
  const currentPosition: [number, number] = [vessel.Longitude, vessel.Latitude];
  const isCurrentlyInside = isPointInPolygon(currentPosition, geofence.coordinates);

  // Get previous state from Redis
  const stateKey = `geofence:${geofence.id}:vessel:${vessel.IMO}`;
  const previousState = await redis.get(stateKey);
  const wasInside = previousState?.isInside ?? false;

  // Update state
  await redis.set(stateKey, { isInside: isCurrentlyInside, lastChecked: new Date() });

  // Determine if notification should be sent
  if (wasInside && !isCurrentlyInside && ['exit', 'both'].includes(geofence.triggerOn)) {
    return createNotification('GEOFENCE_EXIT', vessel, geofence);
  }

  if (!wasInside && isCurrentlyInside && ['enter', 'both'].includes(geofence.triggerOn)) {
    return createNotification('GEOFENCE_ENTER', vessel, geofence);
  }

  return null; // No notification needed
}
```

### 6.4 Geospatial Optimization

For 50K vessels × potentially thousands of geofences, we need optimization:

```
┌─────────────────────────────────────────────────────────────┐
│              Geospatial Query Optimization                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Bounding Box Pre-filter:                                │
│     - Each geofence has a bounding box                      │
│     - Quick AABB test before expensive polygon test         │
│                                                              │
│  2. Spatial Indexing (PostGIS):                             │
│     CREATE INDEX idx_geofence_geom ON geofences             │
│       USING GIST (geometry);                                │
│                                                              │
│     SELECT * FROM geofences                                 │
│     WHERE ST_Contains(geometry,                             │
│       ST_Point(vessel_lng, vessel_lat));                    │
│                                                              │
│  3. Regional Partitioning:                                  │
│     - Divide world into grid cells                          │
│     - Map geofences to cells they intersect                 │
│     - Only check geofences in vessel's cell                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Notification Deduplication Strategy

### 7.1 Deduplication Layers

```
Layer 1: Data Source Deduplication
├── Hash vessel state by key fields
├── Compare with previous hash in Redis
└── Skip if unchanged

Layer 2: Rule Evaluation Deduplication
├── Track geofence state (inside/outside)
├── Only trigger on state transitions
└── Track last notification per rule

Layer 3: Notification Delivery Deduplication
├── Hash notification content
├── Check against 24-hour sliding window
└── Skip if duplicate exists
```

### 7.2 Deduplication Data Structures

```typescript
// Redis keys for deduplication

// Vessel state hash (for source deduplication)
// Key: vessel:state:hash:{IMO}
// Value: MD5 hash of significant fields
// TTL: 5 minutes

// Geofence state (for transition detection)
// Key: geofence:{geofenceId}:vessel:{IMO}
// Value: { isInside: boolean, timestamp: Date }
// TTL: 24 hours

// Notification dedup (for delivery deduplication)
// Key: notification:sent:{clientId}:{hash}
// Value: notification ID
// TTL: 24 hours
```

---

## 8. Notification Storage & Offline Support

### 8.1 Notification Data Model

```typescript
interface Notification {
  id: string;
  clientId: string;
  userId?: string; // Optional: for user-specific delivery

  type: 'GEOFENCE_ENTER' | 'GEOFENCE_EXIT' | 'FIXTURE_CHANGE' | 'VESSEL_STATUS';

  // Notification content
  title: string;
  message: string;
  data: {
    vesselIMO?: number;
    vesselName?: string;
    geofenceId?: string;
    geofenceName?: string;
    // ... other relevant data
  };

  // Delivery tracking
  status: 'pending' | 'delivered' | 'read';
  deliveredAt?: Date;
  readAt?: Date;

  // Metadata
  createdAt: Date;
  expiresAt: Date; // 7 days from creation
}
```

### 8.2 Offline Support Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Offline Support Flow                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  User Online:                                                │
│  ┌──────────┐    WebSocket    ┌──────────┐                 │
│  │  Client  │◀───────────────▶│  Server  │                 │
│  └──────────┘                  └──────────┘                 │
│       │                              │                       │
│       │  Real-time push              │  Also store in DB    │
│       ▼                              ▼                       │
│  [Notification]              [Notification DB]              │
│                                                              │
│  User Offline:                                              │
│  ┌──────────┐                 ┌──────────┐                 │
│  │  Client  │  (disconnected) │  Server  │                 │
│  └──────────┘                 └──────────┘                 │
│                                     │                       │
│                                     ▼                       │
│                              [Notification DB]              │
│                              (stored as pending)            │
│                                                              │
│  User Reconnects:                                           │
│  ┌──────────┐    1. Connect    ┌──────────┐               │
│  │  Client  │─────────────────▶│  Server  │               │
│  └──────────┘                  └──────────┘               │
│       ▲                              │                      │
│       │  2. Fetch pending            │  Query: status=pending
│       │     notifications            │  AND createdAt > 7 days ago
│       │                              ▼                      │
│       └─────────────────────  [Notification DB]            │
│                                                              │
│  Mobile (Offline):                                          │
│  ┌──────────┐                 ┌──────────┐                 │
│  │  Mobile  │◀── FCM Push ───│  Server  │                 │
│  └──────────┘                 └──────────┘                 │
│       │                                                     │
│       └── FCM handles offline queueing automatically       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Client Rules Configuration

### 9.1 Rule Types

```typescript
type NotificationRule = GeofenceRule | FixtureRule | VesselStatusRule;

interface BaseRule {
  id: string;
  clientId: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface GeofenceRule extends BaseRule {
  type: 'geofence';
  geofenceId: string;
  vesselFilters?: VesselFilter;
}

interface FixtureRule extends BaseRule {
  type: 'fixture';
  conditions: {
    rateChange?: { threshold: number; direction: 'increase' | 'decrease' | 'any' };
    cargoTypes?: string[];
    quantityRange?: { min?: number; max?: number };
    routes?: { origin?: string; destination?: string }[];
  };
  vesselFilters?: VesselFilter;
}

interface VesselStatusRule extends BaseRule {
  type: 'vessel_status';
  statusChanges: {
    from?: string[];
    to?: string[];
  };
  vesselFilters?: VesselFilter;
}

interface VesselFilter {
  imos?: number[];
  vesselTypes?: string[];
  vesselClasses?: string[];
  trades?: string[];
  operators?: string[];
}
```

### 9.2 Rules UI Mockup

```
┌─────────────────────────────────────────────────────────────┐
│                  Notification Rules                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [+ Add Rule ▼]                                             │
│    ├── Geofence Alert                                       │
│    ├── Fixture Change Alert                                 │
│    └── Vessel Status Alert                                  │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ● Singapore Strait Watch               [Edit] [Delete]│   │
│  │   Type: Geofence                                      │   │
│  │   Trigger: Enter & Exit                               │   │
│  │   Vessels: All Tankers                                │   │
│  │   Status: Active ✓                                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ○ Dry Bulk Rate Alert                  [Edit] [Delete]│   │
│  │   Type: Fixture                                       │   │
│  │   Condition: Rate change > 5%                         │   │
│  │   Cargo: Coal, Iron Ore                               │   │
│  │   Status: Paused                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. API Design

### 10.1 REST API Endpoints

```yaml
# Client Rules API
POST   /api/v1/rules                    # Create a new rule
GET    /api/v1/rules                    # List all rules for client
GET    /api/v1/rules/:id                # Get rule details
PUT    /api/v1/rules/:id                # Update a rule
DELETE /api/v1/rules/:id                # Delete a rule
PATCH  /api/v1/rules/:id/toggle         # Toggle rule active status

# Geofence API
POST   /api/v1/geofences                # Create a geofence
GET    /api/v1/geofences                # List all geofences for client
GET    /api/v1/geofences/:id            # Get geofence details
PUT    /api/v1/geofences/:id            # Update a geofence
DELETE /api/v1/geofences/:id            # Delete a geofence

# Notifications API
GET    /api/v1/notifications            # List notifications (paginated)
GET    /api/v1/notifications/unread     # Get unread count
PATCH  /api/v1/notifications/:id/read   # Mark as read
PATCH  /api/v1/notifications/read-all   # Mark all as read

# Vessels API (for filtering/search)
GET    /api/v1/vessels                  # Search vessels
GET    /api/v1/vessels/:imo             # Get vessel details
GET    /api/v1/vessels/positions        # Get all vessel positions (for map)
```

### 10.2 WebSocket Events

```typescript
// Client -> Server
interface WebSocketClientEvents {
  'subscribe': { channels: string[] };
  'unsubscribe': { channels: string[] };
  'notification:read': { notificationId: string };
}

// Server -> Client
interface WebSocketServerEvents {
  'notification': Notification;
  'notification:batch': Notification[]; // On reconnect
  'vessel:update': VesselState;         // Optional: real-time vessel updates
  'connection:status': { status: 'connected' | 'reconnecting' };
}
```

---

## 11. Database Schema

### 11.1 PostgreSQL Schema

```sql
-- Clients table
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    api_key VARCHAR(255) UNIQUE NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Geofences table (with PostGIS)
CREATE TABLE geofences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('polygon', 'circle')),
    geometry GEOMETRY(GEOMETRY, 4326) NOT NULL,
    trigger_on VARCHAR(20) NOT NULL CHECK (trigger_on IN ('enter', 'exit', 'both')),
    vessel_filters JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_geofences_client ON geofences(client_id);
CREATE INDEX idx_geofences_geometry ON geofences USING GIST(geometry);

-- Notification rules table
CREATE TABLE notification_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    config JSONB NOT NULL,
    geofence_id UUID REFERENCES geofences(id) ON DELETE CASCADE,
    vessel_filters JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_rules_client ON notification_rules(client_id);
CREATE INDEX idx_rules_type ON notification_rules(type);

-- Notifications table (partitioned by date for efficient cleanup)
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES notification_rules(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days')
) PARTITION BY RANGE (created_at);

-- Create partitions for each day (automated via pg_partman or cron)
CREATE TABLE notifications_2024_01 PARTITION OF notifications
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE INDEX idx_notifications_client_status ON notifications(client_id, status);
CREATE INDEX idx_notifications_created ON notifications(created_at);
```

---

## 12. Recommended Technology Stack

### 12.1 Final Stack Recommendation

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Message Queue** | Apache Kafka | High throughput, event replay, proven at scale |
| **Primary Database** | PostgreSQL + PostGIS | ACID, excellent geospatial support |
| **Cache** | Redis Cluster | Fast state management, pub/sub |
| **API Services** | Node.js (TypeScript) + Fastify | Excellent async I/O, type safety |
| **Data Processing** | Go | High-performance batch processing |
| **Real-time (Web)** | Socket.io | Easy reconnection, room support |
| **Mobile Push** | Firebase Cloud Messaging | Industry standard, reliable |
| **Frontend** | Next.js + React | SSR, great DX, large ecosystem |
| **Map Library** | Mapbox GL JS + react-map-gl | Best drawing tools, performance |
| **Mobile App** | React Native | Code sharing with web |
| **Container Runtime** | Docker + Kubernetes | Scalability, portability |
| **Monitoring** | Prometheus + Grafana | Industry standard observability |

### 12.2 Architecture Diagram (Final)

```
                                 ┌──────────────────┐
                                 │  Signal Ocean    │
                                 │  APIs            │
                                 └────────┬─────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     ▼                     │
                    │  ┌────────────────────────────────────┐  │
                    │  │         API Poller (Go)            │  │
                    │  │   Fetches 50K vessels/minute       │  │
                    │  └──────────────┬─────────────────────┘  │
                    │                 │                         │
                    │                 ▼                         │
                    │  ┌────────────────────────────────────┐  │
                    │  │         Apache Kafka               │  │
                    │  │   Topics: vessel.raw, vessel.changed│ │
                    │  └──────────────┬─────────────────────┘  │
                    │                 │                         │
                    │    ┌────────────┼────────────┐           │
                    │    ▼            ▼            ▼           │
                    │ ┌──────┐   ┌──────────┐  ┌──────────┐   │
                    │ │State │   │  Rules   │  │Notifier  │   │
                    │ │Proc. │   │  Engine  │  │ Service  │   │
                    │ │(Go)  │   │  (Go)    │  │ (Node)   │   │
                    │ └──┬───┘   └────┬─────┘  └────┬─────┘   │
                    │    │            │             │          │
                    │    ▼            ▼             ▼          │
                    │ ┌─────────────────────────────────────┐ │
                    │ │           Redis Cluster             │ │
                    │ │   Vessel State | Geofence State     │ │
                    │ └─────────────────────────────────────┘ │
                    │                                          │
                    │ ┌─────────────────────────────────────┐ │
                    │ │      PostgreSQL + PostGIS           │ │
                    │ │  Clients | Rules | Geofences | Notif│ │
                    │ └─────────────────────────────────────┘ │
                    │                                          │
                    │          BACKEND SERVICES                │
                    └─────────────────────┬────────────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     ▼                     │
                    │  ┌────────────────────────────────────┐  │
                    │  │      API Gateway (Node.js)         │  │
                    │  │   REST API + WebSocket Server      │  │
                    │  └──────────────┬─────────────────────┘  │
                    │                 │                         │
                    │          DELIVERY LAYER                  │
                    └─────────────────────┬────────────────────┘
                                          │
                         ┌────────────────┼────────────────┐
                         ▼                ▼                ▼
                    ┌─────────┐    ┌───────────┐    ┌───────────┐
                    │  Web    │    │  Mobile   │    │  Mobile   │
                    │  App    │    │  App      │    │  Push     │
                    │(Next.js)│    │  (RN)     │    │  (FCM)    │
                    └─────────┘    └───────────┘    └───────────┘
```

---

## 13. Implementation Plan

### 13.1 One-Day Prototype Plan (Priority)

**Goal:** A working demo showing Kafka-powered notifications with geofencing in ~8 hours.

**Tech Stack for Prototype:**
- All services in **Node.js/TypeScript** (simplicity over performance for demo)
- **Docker Compose** for local environment
- **Apache Kafka** (with KRaft mode - no ZooKeeper needed)
- **SQLite** instead of PostgreSQL (zero setup, good enough for demo)
- **Next.js** for frontend
- **Mapbox GL JS** for geofencing UI
- **Socket.io** for real-time notifications
- **Mock data generator** instead of API poller

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      1-DAY PROTOTYPE ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐            │
│  │ Mock Data    │────▶│    Kafka     │────▶│  Processor   │            │
│  │ Generator    │     │   (KRaft)    │     │  Service     │            │
│  │ (Node.js)    │     │              │     │  (Node.js)   │            │
│  └──────────────┘     └──────────────┘     └──────┬───────┘            │
│        │                                          │                     │
│        │ Simulates vessel                         │ Evaluates           │
│        │ position updates                         │ geofences           │
│        │ every 5 seconds                          │                     │
│                                                   ▼                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     Next.js Application                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │  │
│  │  │ API Routes  │  │ Socket.io   │  │ SQLite (via Prisma)     │  │  │
│  │  │ /api/*      │  │ Server      │  │ - geofences             │  │  │
│  │  └─────────────┘  └─────────────┘  │ - notifications         │  │  │
│  │                                     └─────────────────────────┘  │  │
│  │  ┌───────────────────────────────────────────────────────────┐  │  │
│  │  │                    React Frontend                          │  │  │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │  │
│  │  │  │ Map View    │  │ Geofence    │  │ Notification│       │  │  │
│  │  │  │ (Mapbox)    │  │ Editor      │  │ Center      │       │  │  │
│  │  │  └─────────────┘  └─────────────┘  └─────────────┘       │  │  │
│  │  └───────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Hour 1-2: Environment Setup
- [ ] Create project structure (monorepo with pnpm workspaces)
- [ ] Set up Docker Compose with Apache Kafka (KRaft mode, no ZooKeeper)
- [ ] Initialize Next.js app with TypeScript
- [ ] Set up Prisma with SQLite
- [ ] Create database schema (geofences, notifications)

#### Hour 3-4: Kafka & Mock Data
- [ ] Create Kafka producer service (mock vessel data generator)
- [ ] Generate realistic vessel movements (ships moving along routes)
- [ ] Create Kafka consumer in Next.js API route
- [ ] Test message flow: producer → Kafka → consumer

#### Hour 5-6: Geofencing & Rules Engine
- [ ] Implement point-in-polygon algorithm
- [ ] Create geofence CRUD API routes
- [ ] Build geofence state tracking (enter/exit detection)
- [ ] Connect Kafka consumer to geofence evaluator
- [ ] Store notifications in SQLite

#### Hour 7-8: Frontend & Real-time
- [ ] Integrate Mapbox with polygon drawing tools
- [ ] Build geofence management UI (create, list, delete)
- [ ] Implement Socket.io for real-time notifications
- [ ] Create notification center with history
- [ ] Add vessel markers on map (real-time positions)

#### Demo Scenarios to Support
1. **Draw a geofence** around Singapore Strait
2. **Watch vessels move** on the map (simulated)
3. **Receive notification** when vessel enters/exits geofence
4. **View notification history** in the notification center

---

### 13.2 Quick Start Commands (After Implementation)

```bash
# Start all services
docker-compose up -d

# Install dependencies
pnpm install

# Run database migrations
pnpm db:push

# Start the mock data generator
pnpm mock:start

# Start the Next.js app
pnpm dev

# Open browser
open http://localhost:3000
```

---

### 13.3 Project Structure (Prototype)

```
signal-notification/
├── docker-compose.yml          # Apache Kafka (KRaft mode)
├── package.json                # Root package.json (pnpm workspace)
├── pnpm-workspace.yaml
│
├── packages/
│   └── mock-producer/          # Mock vessel data generator
│       ├── package.json
│       ├── src/
│       │   ├── index.ts        # Main producer
│       │   ├── vessels.ts      # Mock vessel data
│       │   └── routes.ts       # Simulated shipping routes
│       └── tsconfig.json
│
└── apps/
    └── web/                    # Next.js application
        ├── package.json
        ├── next.config.js
        ├── prisma/
        │   └── schema.prisma   # SQLite schema
        ├── src/
        │   ├── app/
        │   │   ├── page.tsx              # Main dashboard
        │   │   ├── layout.tsx
        │   │   └── api/
        │   │       ├── geofences/        # CRUD routes
        │   │       ├── notifications/    # History routes
        │   │       └── socket/           # Socket.io handler
        │   ├── components/
        │   │   ├── Map.tsx               # Mapbox component
        │   │   ├── GeofenceEditor.tsx    # Polygon drawing
        │   │   ├── NotificationCenter.tsx
        │   │   └── VesselMarker.tsx
        │   ├── lib/
        │   │   ├── kafka.ts              # Kafka consumer
        │   │   ├── geofence.ts           # Point-in-polygon
        │   │   ├── prisma.ts             # DB client
        │   │   └── socket.ts             # Socket.io server
        │   └── types/
        │       └── index.ts              # TypeScript types
        └── tsconfig.json
```

---

### 13.4 Mock Data Strategy

**Pre-defined Vessels (10 ships for demo):**

| IMO | Name | Type | Starting Location | Route |
|-----|------|------|-------------------|-------|
| 9865556 | MV Atlantic Star | Tanker | Brazil | Brazil → Singapore |
| 9812345 | MV Pacific Trader | Dry Bulk | Gulf of Mexico | Gulf → Rotterdam |
| 9876543 | MV Ocean Glory | Container | Singapore | Singapore → Los Angeles |
| ... | ... | ... | ... | ... |

**Movement Simulation:**
- Ships move along predefined waypoints
- Position updates every 5 seconds (for demo speed)
- Speed varies based on vessel type
- Random minor deviations for realism

```typescript
// Example mock vessel generator
const vessels = [
  {
    IMO: 9865556,
    VesselName: "MV Atlantic Star",
    VesselType: "Tanker",
    route: [
      { lat: -20.2972, lng: -40.2361 },  // Brazil
      { lat: -10.0, lng: -30.0 },
      { lat: 0.0, lng: -20.0 },
      { lat: 5.0, lng: 0.0 },
      { lat: 1.3521, lng: 103.8198 },    // Singapore
    ],
    speedKnots: 12,
  },
  // ... more vessels
];
```

---

### 13.5 Full Implementation Plan (Future Phases)

*After the prototype is validated, proceed with these phases:*

#### Phase 2: Production Database & API Integration
- [ ] Migrate from SQLite to PostgreSQL + PostGIS
- [ ] Implement real API poller for Signal Ocean APIs
- [ ] Add Redis for caching and state management
- [ ] Implement proper authentication (JWT)

#### Phase 3: Scalability
- [ ] Migrate processor service to Go (performance)
- [ ] Add Kafka consumer groups for parallel processing
- [ ] Implement proper deduplication with Redis
- [ ] Add fixture rules support

#### Phase 4: Mobile & Offline
- [ ] Integrate Firebase Cloud Messaging
- [ ] Build React Native mobile app
- [ ] Implement offline notification queuing

#### Phase 5: Production Deployment
- [ ] Set up Kubernetes cluster
- [ ] Add monitoring (Prometheus/Grafana)
- [ ] Implement CI/CD pipeline
- [ ] Load testing and optimization

---

## 14. Demo UI Wireframes

### 14.1 Dashboard

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Signal Ocean Notifications                      [🔔 12] [User ▼]       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                   │   │
│  │                      VESSEL MAP                                   │   │
│  │                                                                   │   │
│  │      🚢  🚢      [Zoom +/-]                                      │   │
│  │          🚢                                                       │   │
│  │    ┌──────────┐                                                  │   │
│  │    │ Geofence │   🚢                                             │   │
│  │    │   Zone   │                                                   │   │
│  │    └──────────┘        🚢                                        │   │
│  │               🚢                                                  │   │
│  │                                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────┐  ┌──────────────────────────────────────┐   │
│  │  QUICK STATS          │  │  RECENT NOTIFICATIONS                 │   │
│  │                       │  │                                        │   │
│  │  Active Rules: 5      │  │  🟢 MV Atlantic entered Singapore     │   │
│  │  Geofences: 3         │  │     Strait - 2 min ago                │   │
│  │  Today: 23 alerts     │  │                                        │   │
│  │  Unread: 12           │  │  🔴 MV Pacific exited Gulf Watch      │   │
│  │                       │  │     Zone - 15 min ago                  │   │
│  └──────────────────────┘  │                                        │   │
│                             │  🟡 Fixture rate changed +5%           │   │
│                             │     Capesize Dry - 1 hour ago          │   │
│                             └──────────────────────────────────────┘   │
│                                                                          │
│  [Manage Rules]  [Manage Geofences]  [View All Notifications]           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 14.2 Geofence Editor

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Create Geofence                                           [← Back]     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Draw Tools:  [📍 Polygon] [⭕ Circle] [▢ Rectangle] [🗑 Clear]  │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │                                                                   │   │
│  │                                                                   │   │
│  │         Click on map to start drawing a polygon                  │   │
│  │         Double-click to complete the shape                       │   │
│  │                                                                   │   │
│  │              ○──────────○                                        │   │
│  │             /            \                                       │   │
│  │            /              \                                      │   │
│  │           ○                ○                                     │   │
│  │            \              /                                      │   │
│  │             ○────────────○                                       │   │
│  │                                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Name:        [Singapore Approach Zone                        ]  │   │
│  │                                                                   │   │
│  │  Trigger On:  (●) Enter only  ( ) Exit only  ( ) Enter & Exit   │   │
│  │                                                                   │   │
│  │  Vessel Filter (optional):                                       │   │
│  │  Type: [All Types      ▼]  Class: [All Classes    ▼]            │   │
│  │                                                                   │   │
│  │  Or specific vessels: [Search IMO or name...               ]     │   │
│  │                                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  [Cancel]                                              [Save Geofence]  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 14.3 Notification Center

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Notification Center                                [Mark All Read]     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Filter: [All ▼]  [All Types ▼]  [Last 7 Days ▼]        🔍 [Search]    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 🟢 NEW                                            Dec 16, 14:32 │   │
│  │ Vessel Entered Geofence                                          │   │
│  │ MV Atlantic Star (IMO: 9865556) entered "Singapore Strait"      │   │
│  │ Position: 1.2656° N, 103.8200° E                                │   │
│  │ Vessel Type: Tanker | Class: Panamax                            │   │
│  │                                                    [View on Map] │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 🔴                                                Dec 16, 14:15 │   │
│  │ Vessel Exited Geofence                                           │   │
│  │ MV Pacific Trader (IMO: 9812345) exited "Gulf Watch Zone"       │   │
│  │ Position: 28.5421° N, -88.9012° W                               │   │
│  │ Vessel Type: Dry Bulk | Class: Capesize                         │   │
│  │                                                    [View on Map] │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 🟡                                                Dec 16, 13:45 │   │
│  │ Fixture Rate Change                                              │   │
│  │ Capesize Dry Bulk rate increased by 5.2%                        │   │
│  │ New Rate: $15,420/day | Previous: $14,650/day                   │   │
│  │ Route: Brazil → China                                           │   │
│  │                                                   [View Details] │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  [Load More...]                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 15. Security Considerations

| Area | Approach |
|------|----------|
| Authentication | JWT tokens with refresh, API keys for service-to-service |
| Authorization | Role-based access control (RBAC), client isolation |
| Data Isolation | Tenant ID in all queries, row-level security in PostgreSQL |
| API Security | Rate limiting, input validation, HTTPS only |
| WebSocket Security | Token-based auth on connection, message validation |

---

## 16. Monitoring & Observability

| Component | Metrics |
|-----------|---------|
| API Poller | Fetch latency, success rate, vessels processed/min |
| Rules Engine | Rules evaluated/sec, notifications generated/sec |
| WebSocket | Connected clients, messages/sec, reconnection rate |
| Database | Query latency, connection pool, table sizes |
| Kafka | Consumer lag, message throughput, partition health |

---

## 17. Cost Estimates (Cloud Deployment)

| Service | Specification | Est. Monthly Cost |
|---------|---------------|-------------------|
| Kubernetes (EKS/GKE) | 3 nodes, m5.large | $300-400 |
| PostgreSQL (RDS) | db.r5.large, 500GB | $400-500 |
| Redis (ElastiCache) | r5.large cluster | $200-300 |
| Kafka (MSK) | 3 brokers, kafka.m5.large | $400-600 |
| Load Balancer | ALB/NLB | $50-100 |
| Data Transfer | ~500GB/month | $50-100 |
| **Total** | | **$1,400-2,000/month** |

*Costs scale with usage. Initial development can use smaller instances.*

---

## 18. Open Questions & Future Considerations

1. **Multi-region deployment** - Needed for global clients?
2. **Analytics** - Track notification engagement metrics?
3. **Webhooks** - Allow clients to receive notifications via HTTP callbacks?
4. **API rate limits** - Should we implement client-specific rate limits?
5. **Mobile app scope** - Native features beyond push notifications?

---

## 19. Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| IMO | International Maritime Organization number - unique vessel identifier |
| Geofence | Virtual geographic boundary that triggers alerts |
| Fixture | A shipping contract/booking between parties |
| AIS | Automatic Identification System - vessel tracking |

### B. References

- [Signal Ocean API Documentation](https://signalocean.com/api)
- [PostGIS Documentation](https://postgis.net/documentation/)
- [Mapbox GL JS Drawing](https://docs.mapbox.com/mapbox-gl-js/example/mapbox-gl-draw/)
- [Socket.io Documentation](https://socket.io/docs/v4/)
- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
