## 21. Real Data POC Plan

This section outlines the plan to transition from the demo prototype to a real data proof-of-concept capable of handling production-scale vessel data (500K messages every 5 minutes).

### 21.1 POC Objectives

| Objective | Description |
|-----------|-------------|
| Real Data Integration | Connect to Signal Ocean's actual vessel state API |
| Scale Validation | Process 500K messages / 5 min (~1,667 msgs/sec) |
| End-to-End Latency | Notifications delivered within 30 seconds of data change |
| Multi-User Support | Support 50+ concurrent users with independent preferences |
| Infrastructure Validation | Validate AWS MSK + supporting services at scale |

### 21.2 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           Signal Ocean Vessel API                                     │
│                    (LatestVesselState - Polling or Streaming)                        │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          Data Ingestion Layer (ECS Fargate)                          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  Vessel Poller Service                                                       │    │
│  │  - Polls API every minute (or receives webhook/stream)                       │    │
│  │  - Produces to MSK topic: vessel.state.changed                              │    │
│  │  - Handles rate limiting, retries, backpressure                             │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              AWS MSK (Kafka)                                         │
│                                                                                      │
│   Topic: vessel.state.changed (6 partitions, replication-factor 3)                  │
│   - 3x kafka.m5.large brokers                                                        │
│   - 2TB storage per broker                                                           │
│   - IAM authentication, TLS encryption                                               │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
┌───────────────────────────────────┐     ┌───────────────────────────────────────────┐
│   Notification Processor (ECS)    │     │        State Tracker (ECS)                │
│                                   │     │                                           │
│  - Consumer group: notification   │     │  - Consumer group: state-tracker          │
│  - 3 tasks (1 per partition pair) │     │  - Maintains vessel positions in Redis    │
│  - Evaluates geofence rules       │     │  - Detects destination changes            │
│  - Evaluates destination rules    │     │  - Updates vessel state cache             │
│  - Writes to RDS (notifications)  │     │                                           │
│  - Publishes to Redis pub/sub     │     │                                           │
└───────────────────────────────────┘     └───────────────────────────────────────────┘
                    │                                       │
                    ▼                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         Amazon ElastiCache (Redis)                                   │
│                                                                                      │
│   - Vessel state cache (current position, destination)                              │
│   - Geofence cache (polygon data)                                                   │
│   - User preferences cache                                                           │
│   - Socket.io adapter (for multi-instance pub/sub)                                  │
│   - Notification pub/sub channel                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                            Amazon RDS (PostgreSQL)                                   │
│                                                                                      │
│   - Notifications table (with TTL cleanup)                                          │
│   - Geofences table (with PostGIS for spatial queries)                              │
│   - User preferences table                                                           │
│   - Notification types configuration                                                 │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          Web Application (ECS Fargate)                               │
│                                                                                      │
│   - Next.js application (2-4 tasks behind ALB)                                      │
│   - Socket.io with Redis adapter                                                     │
│   - Subscribes to Redis notification channel                                         │
│   - Serves web UI and API endpoints                                                  │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                               Clients                                                │
│                    (Web Browsers, Mobile Apps)                                       │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 21.3 AWS Services Required

| Service | Purpose | Specification | Est. Monthly Cost |
|---------|---------|---------------|-------------------|
| **MSK Provisioned** | Message streaming | 3x kafka.m5.large, 6TB | ~$1,100 |
| **ECS Fargate** | Container workloads | 4-6 tasks (various sizes) | ~$150 |
| **RDS PostgreSQL** | Persistent storage | db.t3.medium, 100GB | ~$70 |
| **ElastiCache Redis** | Caching & pub/sub | cache.t3.medium | ~$50 |
| **ALB** | Load balancing | 1 ALB | ~$25 |
| **NAT Gateway** | Outbound internet | 1 NAT | ~$35 |
| **ECR** | Container registry | Storage + transfer | ~$10 |
| **CloudWatch** | Logging & monitoring | Logs + metrics | ~$30 |
| **VPC** | Networking | VPC, subnets | Free |
| **Total** | | | **~$1,470/month** |

### 21.4 Code Changes Required

#### 21.4.1 Separate Kafka Consumer from Web Server

**Current:** `server.ts` contains both Next.js server and Kafka consumer

**New:** Split into separate services:

```
packages/
├── vessel-processor/          # NEW: Kafka consumer service
│   ├── src/
│   │   ├── consumer.ts        # Kafka consumer logic
│   │   ├── geofence.ts        # Geofence evaluation
│   │   ├── destination.ts     # Destination change detection
│   │   └── notifier.ts        # Redis pub/sub publisher
│   ├── Dockerfile
│   └── package.json
│
├── data-ingestion/            # NEW: API poller service
│   ├── src/
│   │   ├── poller.ts          # Signal Ocean API poller
│   │   ├── producer.ts        # Kafka producer
│   │   └── transformer.ts     # Data transformation
│   ├── Dockerfile
│   └── package.json
│
└── mock-producer/             # EXISTING: Keep for local dev
```

#### 21.4.2 Update Web Server

```typescript
// apps/web/server.ts - SIMPLIFIED

// Remove Kafka consumer code
// Subscribe to Redis pub/sub for notifications

import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

// Socket.io with Redis adapter for multi-instance support
io.adapter(createAdapter(pubClient, subClient));

// Subscribe to notification channel
const notificationSub = pubClient.duplicate();
await notificationSub.subscribe('notifications', (message) => {
  const notification = JSON.parse(message);
  // Emit to specific client room
  io.to(`client:${notification.clientId}`).emit('notification', notification);
});
```

#### 21.4.3 Vessel Processor Service

```typescript
// packages/vessel-processor/src/consumer.ts

import { Kafka } from 'kafkajs';
import { createClient } from 'redis';
import { Pool } from 'pg';
import * as turf from '@turf/turf';

const kafka = new Kafka({
  clientId: 'vessel-processor',
  brokers: process.env.KAFKA_BROKERS!.split(','),
  ssl: true,
  sasl: { mechanism: 'aws', /* IAM auth config */ },
});

const consumer = kafka.consumer({ groupId: 'notification-processor' });
const redis = createClient({ url: process.env.REDIS_URL });
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function processMessage(message: VesselState) {
  const { IMO, Latitude, Longitude, AISDestination } = message;

  // 1. Get previous state from Redis
  const prevState = await redis.hGetAll(`vessel:${IMO}`);

  // 2. Check geofence enter/exit
  const geofences = await getActiveGeofences(); // Cached in Redis
  for (const geofence of geofences) {
    const wasInside = prevState[`geofence:${geofence.id}`] === 'true';
    const isInside = turf.booleanPointInPolygon(
      turf.point([Longitude, Latitude]),
      geofence.polygon
    );

    if (wasInside !== isInside) {
      await createNotification({
        type: 'geofence_alert',
        vesselIMO: IMO,
        geofenceId: geofence.id,
        event: isInside ? 'entered' : 'exited',
      });
    }

    // Update state
    await redis.hSet(`vessel:${IMO}`, `geofence:${geofence.id}`, String(isInside));
  }

  // 3. Check destination change
  if (prevState.destination && prevState.destination !== AISDestination) {
    await createNotification({
      type: 'destination_change',
      vesselIMO: IMO,
      previousDestination: prevState.destination,
      newDestination: AISDestination,
    });
  }

  // 4. Update vessel state in Redis
  await redis.hSet(`vessel:${IMO}`, {
    latitude: String(Latitude),
    longitude: String(Longitude),
    destination: AISDestination || '',
    updatedAt: new Date().toISOString(),
  });
}

async function createNotification(data: NotificationData) {
  // 1. Get clients with matching preferences
  const clients = await getMatchingClients(data);

  for (const clientId of clients) {
    // 2. Save to database
    const notification = await db.query(
      `INSERT INTO notifications (client_id, type, data, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')
       RETURNING *`,
      [clientId, data.type, JSON.stringify(data)]
    );

    // 3. Publish to Redis for real-time delivery
    await redis.publish('notifications', JSON.stringify({
      clientId,
      notification: notification.rows[0],
    }));
  }
}
```

#### 21.4.4 Data Ingestion Service

```typescript
// packages/data-ingestion/src/poller.ts

import { Kafka } from 'kafkajs';

const POLL_INTERVAL_MS = 60_000; // 1 minute
const BATCH_SIZE = 10_000; // Vessels per API call

async function pollVesselStates() {
  const producer = kafka.producer();
  await producer.connect();

  while (true) {
    try {
      const startTime = Date.now();
      let page = 0;
      let totalProcessed = 0;

      // Paginate through all vessels
      while (true) {
        const vessels = await fetchVesselStates(page, BATCH_SIZE);
        if (vessels.length === 0) break;

        // Batch send to Kafka
        await producer.send({
          topic: 'vessel.state.changed',
          messages: vessels.map(v => ({
            key: String(v.IMO),
            value: JSON.stringify(v),
            timestamp: String(Date.now()),
          })),
        });

        totalProcessed += vessels.length;
        page++;
      }

      console.log(`Processed ${totalProcessed} vessels in ${Date.now() - startTime}ms`);

      // Wait for next poll interval
      const elapsed = Date.now() - startTime;
      if (elapsed < POLL_INTERVAL_MS) {
        await sleep(POLL_INTERVAL_MS - elapsed);
      }
    } catch (error) {
      console.error('Poll error:', error);
      await sleep(5000); // Retry after 5s
    }
  }
}

async function fetchVesselStates(page: number, limit: number): Promise<VesselState[]> {
  const response = await fetch(
    `${process.env.SIGNAL_API_URL}/vessels/states?page=${page}&limit=${limit}`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.SIGNAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}
```

### 21.5 Database Schema (PostgreSQL with PostGIS)

```sql
-- Enable PostGIS for spatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Geofences table with spatial index
CREATE TABLE geofences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  polygon GEOMETRY(POLYGON, 4326) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_geofences_polygon ON geofences USING GIST(polygon);
CREATE INDEX idx_geofences_client ON geofences(client_id);
CREATE INDEX idx_geofences_active ON geofences(is_active) WHERE is_active = true;

-- Notifications table with TTL
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  data JSONB NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_notifications_client ON notifications(client_id, created_at DESC);
CREATE INDEX idx_notifications_expires ON notifications(expires_at);

-- Auto-delete expired notifications (run via pg_cron or scheduled task)
CREATE OR REPLACE FUNCTION delete_expired_notifications()
RETURNS void AS $$
BEGIN
  DELETE FROM notifications WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- User preferences
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id VARCHAR(255) UNIQUE NOT NULL,
  preferences JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_preferences_client ON user_preferences(client_id);
```

### 21.6 Implementation Phases

#### Phase 1: Infrastructure Setup (Week 1)

| Task | Description | Owner |
|------|-------------|-------|
| MSK Cluster | Complete MSK Provisioned setup with public access | DevOps |
| VPC & Networking | Create VPC, subnets, security groups via Terraform | DevOps |
| RDS PostgreSQL | Deploy database with PostGIS extension | DevOps |
| ElastiCache Redis | Deploy Redis cluster | DevOps |
| ECR Repositories | Create container registries | DevOps |

#### Phase 2: Service Refactoring (Week 2)

| Task | Description | Owner |
|------|-------------|-------|
| Split Services | Separate Kafka consumer from web server | Backend |
| Vessel Processor | Create standalone consumer service | Backend |
| Redis Integration | Add Redis adapter to Socket.io | Backend |
| Database Migration | Migrate from SQLite to PostgreSQL | Backend |
| Docker Images | Build and push to ECR | Backend |

#### Phase 3: Data Integration (Week 3)

| Task | Description | Owner |
|------|-------------|-------|
| API Integration | Connect to Signal Ocean vessel API | Backend |
| Data Ingestion | Deploy poller service | Backend |
| Schema Mapping | Map API response to internal schema | Backend |
| Rate Limiting | Implement API rate limit handling | Backend |

#### Phase 4: Testing & Optimization (Week 4)

| Task | Description | Owner |
|------|-------------|-------|
| Load Testing | Validate 500K messages / 5 min throughput | QA |
| Latency Testing | Verify <30s notification delivery | QA |
| Consumer Tuning | Optimize batch sizes, parallelism | Backend |
| Monitoring | Set up CloudWatch dashboards and alarms | DevOps |

### 21.7 Monitoring & Alerts

| Metric | Threshold | Action |
|--------|-----------|--------|
| Kafka Consumer Lag | > 10,000 messages | Alert, scale consumers |
| Notification Latency (p99) | > 30 seconds | Alert, investigate |
| WebSocket Connections | > 80% capacity | Scale web instances |
| RDS CPU | > 80% | Alert, consider scaling |
| Redis Memory | > 80% | Alert, review cache TTLs |

### 21.8 Cost Optimization Tips

| Optimization | Potential Savings |
|--------------|-------------------|
| Use Spot Fargate for processors | ~70% on compute |
| Reserved capacity for RDS | ~30% on database |
| Single NAT Gateway (dev/staging) | ~$70/month per extra NAT |
| Right-size Redis (start cache.t3.small) | ~$25/month |
| S3 lifecycle policies for logs | ~20% on log storage |

### 21.9 Success Criteria

| Criteria | Target | Measurement |
|----------|--------|-------------|
| Throughput | 500K msgs / 5 min | Kafka metrics |
| Latency | < 30s end-to-end | Custom tracing |
| Availability | 99.9% uptime | CloudWatch |
| Data Loss | 0 notifications lost | Audit logs |
| Cost | < $1,500/month | AWS billing |

---
