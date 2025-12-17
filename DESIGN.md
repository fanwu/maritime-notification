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
| **Azure Service Bus** | Enterprise-grade, AMQP support, dead-letter queues, sessions for ordering, integrates with Azure Functions | Azure vendor lock-in, costs at scale | Azure-centric deployments |
| **Azure Event Hubs** | Kafka-compatible API, millions of events/sec, capture to Azure Storage, fully managed | Azure lock-in, less feature-rich than full Kafka | High-throughput Azure streaming |
| **RabbitMQ** | Easy setup, flexible routing, good for complex routing patterns, lower latency | Lower throughput than Kafka, requires more manual scaling | Moderate scale, complex routing |
| **Redis Streams** | Very low latency, simple setup, can double as cache | Less durable than Kafka, limited replay capability | Low-latency, moderate scale |

**Recommendation:** **Apache Kafka** for production (handles scale, provides event replay for debugging), **Redis Streams** for initial development/demo (simpler setup).

**Azure Alternative:** **Azure Event Hubs** with Kafka-compatible API allows using existing Kafka code with minimal changes, or **Azure Service Bus** for enterprise messaging patterns.

---

### 4.2 Database

#### 4.2.1 Primary Database (Client Rules, Notification History)

| Option | Pros | Cons | Best For |
|--------|------|------|----------|
| **PostgreSQL** | ACID compliance, excellent JSON support (JSONB), PostGIS for geospatial, mature ecosystem | Scaling requires more effort (read replicas, partitioning) | Complex queries, geospatial data |
| **Azure SQL Database** | Fully managed SQL Server, built-in HA, auto-tuning, spatial data types | Azure lock-in, licensing costs | .NET/Azure enterprise deployments |
| **Azure Cosmos DB** | Global distribution, multi-model (SQL, MongoDB, Cassandra), auto-scaling, geospatial queries | Cost at scale, eventual consistency by default | Global apps, flexible schema |
| **MongoDB** | Flexible schema, built-in geospatial queries, horizontal scaling (sharding) | Less strict consistency, query performance can vary | Rapidly changing schemas |
| **CockroachDB** | Distributed SQL, auto-scaling, PostgreSQL compatible | Newer, smaller ecosystem, higher latency for writes | Global distribution needs |

**Recommendation:** **PostgreSQL with PostGIS** - Best balance of features, excellent geospatial support for geofencing, JSONB for flexible rule storage.

**Azure Alternative:** **Azure SQL Database** for SQL Server compatibility with .NET, or **Azure Cosmos DB** for global distribution with built-in geospatial support.

#### 4.2.2 Cache (Vessel State, Geofence State)

| Option | Pros | Cons | Best For |
|--------|------|------|----------|
| **Redis** | Extremely fast, rich data structures, pub/sub, Lua scripting | Single-threaded, memory-bound | Hot data caching, real-time state |
| **Azure Cache for Redis** | Fully managed Redis, Enterprise tier with active geo-replication, VNet integration | Azure lock-in, costs at scale | Azure deployments needing Redis |
| **Memcached** | Simple, fast, multi-threaded | Limited data structures, no persistence | Simple key-value caching |
| **Redis Cluster** | Horizontal scaling, high availability | More complex setup | Large-scale caching |

**Recommendation:** **Redis Cluster** - Fast reads/writes for vessel state tracking, supports complex data structures for geofence state management.

**Azure Alternative:** **Azure Cache for Redis** (Premium/Enterprise tier) provides managed Redis with clustering and geo-replication.

---

### 4.3 Backend Services

| Option | Pros | Cons | Best For |
|--------|------|------|----------|
| **Node.js (TypeScript)** | Excellent async I/O, large ecosystem, good for real-time apps, same language as frontend | Single-threaded CPU-bound tasks | Real-time, I/O heavy workloads |
| **ASP.NET Core (C#)** | High performance, excellent tooling (Visual Studio), SignalR for real-time, enterprise-grade | Windows-centric ecosystem (though cross-platform), steeper learning curve | Enterprise .NET shops, Azure integration |
| **.NET Minimal APIs** | Lightweight, fast startup, good for microservices, AOT compilation support | Less structured than full ASP.NET | Simple APIs, Azure Functions |
| **Python (FastAPI)** | Clean syntax, excellent data processing libraries, good async support | Slower than Node.js for I/O, GIL limitations | Data processing, ML integration |
| **Go** | Excellent concurrency, fast compilation, low memory footprint | Smaller ecosystem, more verbose | High-performance microservices |
| **Rust** | Maximum performance, memory safety, zero-cost abstractions | Steeper learning curve, longer development time | Performance-critical components |

**Recommendation:**
- **Node.js (TypeScript)** for API Gateway and WebSocket services (real-time focus)
- **Go** for high-throughput data processing services (API poller, rule evaluator)

**Azure/.NET Alternative:**
- **ASP.NET Core** with **SignalR** for real-time WebSocket communication
- **Azure Functions** (.NET) for serverless event processing
- **Azure Container Apps** for microservices deployment

---

### 4.4 Real-Time Communication

| Option | Pros | Cons | Best For |
|--------|------|------|----------|
| **Socket.io** | Easy to use, automatic fallback, room support, widespread adoption | Higher overhead than raw WebSocket | Rapid development, browser compatibility |
| **Azure SignalR Service** | Fully managed, auto-scaling, integrates with ASP.NET Core SignalR, serverless mode | Azure lock-in, costs at scale | .NET/Azure real-time apps |
| **ASP.NET Core SignalR** | Built into .NET, strongly typed hubs, excellent performance | Requires .NET backend | .NET-based real-time apps |
| **ws (Node.js)** | Lightweight, fast, low-level control | Requires manual reconnection logic, no built-in rooms | Performance-critical WebSocket |
| **Pusher/Ably** | Fully managed, global infrastructure, presence features | Cost at scale, vendor dependency | Quick to market, global reach |
| **GraphQL Subscriptions** | Type-safe, integrates with GraphQL API | Additional complexity if not using GraphQL | GraphQL-based systems |

**Recommendation:** **Socket.io** for web (ease of use, automatic reconnection), **Firebase Cloud Messaging (FCM)** for mobile push.

**Azure Alternative:** **Azure SignalR Service** provides fully managed SignalR with automatic scaling, or self-hosted **ASP.NET Core SignalR** for .NET backends.

---

### 4.5 Mobile Push Notifications

| Option | Pros | Cons | Best For |
|--------|------|------|----------|
| **Firebase Cloud Messaging (FCM)** | Free, supports iOS/Android, reliable delivery | Google dependency, limited analytics | Cross-platform mobile push |
| **Azure Notification Hubs** | Cross-platform (iOS, Android, Windows), tag-based routing, scales to millions, integrates with Azure | Azure lock-in, costs at scale | Azure-centric mobile apps |
| **Amazon SNS** | AWS integration, supports multiple platforms | Less feature-rich than FCM | AWS-centric deployments |
| **OneSignal** | Rich features, A/B testing, segmentation | Costs at scale | Marketing-focused notifications |

**Recommendation:** **Firebase Cloud Messaging** - Industry standard, free tier sufficient, excellent reliability.

**Azure Alternative:** **Azure Notification Hubs** provides cross-platform push with tag-based routing and scales to millions of devices.

---

### 4.6 Frontend Framework

| Option | Pros | Cons | Best For |
|--------|------|------|----------|
| **React** | Largest ecosystem, excellent tooling, component-based | Requires additional libraries for state management | Complex interactive UIs |
| **Blazor WebAssembly** | C# in browser, share code with .NET backend, strong typing | Larger initial download, smaller ecosystem | .NET full-stack teams |
| **Blazor Server** | C# UI, thin client, real-time via SignalR, fast initial load | Requires constant connection, latency-sensitive | Internal .NET enterprise apps |
| **Vue.js** | Gentle learning curve, good documentation, built-in state management | Smaller ecosystem than React | Rapid development |
| **Next.js (React)** | SSR/SSG, file-based routing, API routes, excellent DX | More opinionated, larger bundle size | Production React apps |
| **SvelteKit** | Excellent performance, less boilerplate, compiled output | Smaller ecosystem, fewer developers | Performance-focused apps |

**Recommendation:** **Next.js** - Best developer experience, built-in API routes for demo backend, excellent React ecosystem for maps and real-time features.

**Azure/.NET Alternative:** **Blazor Server** for internal enterprise apps with real-time requirements (uses SignalR), or **Blazor WebAssembly** for full .NET stack with shared C# models.

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
| **Azure Kubernetes Service (AKS)** | Managed K8s, Azure AD integration, Azure Monitor, easy scaling | Azure lock-in | Azure K8s deployments |
| **Azure Container Apps** | Serverless containers, Dapr integration, auto-scaling, simpler than AKS | Less control than full K8s, newer service | Event-driven microservices |
| **Azure App Service** | PaaS for web apps, built-in CI/CD, easy SSL, auto-scaling | Less flexibility than containers | Simple web app deployments |
| **AWS ECS/Fargate** | Simpler than K8s, serverless option, AWS integration | Vendor lock-in | AWS deployments |
| **Docker Compose** | Simple, good for development | Not production-ready for scale | Local development, small deployments |

**Recommendation:** **Kubernetes** for production (portable, scalable), **Docker Compose** for local development.

**Azure Alternative:** **Azure Container Apps** for serverless container deployment with built-in scaling, or **AKS** for full Kubernetes control. **Azure App Service** for simpler PaaS deployment.

---

### 4.9 Complete Azure/.NET Stack Summary

For organizations preferring Microsoft technologies, here's the complete Azure/.NET alternative stack:

| Component | Recommended | Azure/.NET Alternative |
|-----------|-------------|------------------------|
| **Message Queue** | Apache Kafka | Azure Event Hubs (Kafka API) or Azure Service Bus |
| **Primary Database** | PostgreSQL + PostGIS | Azure SQL Database or Azure Cosmos DB |
| **Cache** | Redis Cluster | Azure Cache for Redis |
| **Backend Services** | Node.js (TypeScript) | ASP.NET Core (C#) |
| **Real-Time** | Socket.io | Azure SignalR Service |
| **Mobile Push** | Firebase (FCM) | Azure Notification Hubs |
| **Frontend** | Next.js (React) | Blazor Server/WASM or React |
| **Maps** | Mapbox GL JS | Azure Maps or Mapbox |
| **Container Orchestration** | Kubernetes | AKS or Azure Container Apps |
| **Serverless Functions** | - | Azure Functions |
| **API Gateway** | - | Azure API Management |
| **Identity** | - | Azure AD / Azure AD B2C |
| **Monitoring** | - | Azure Monitor + Application Insights |

#### Azure/.NET Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AZURE/.NET ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │  Azure Event    │    │  Azure          │    │  Azure          │         │
│  │  Hubs (Kafka)   │───▶│  Functions      │───▶│  Service Bus    │         │
│  │                 │    │  (.NET)         │    │  (Topics)       │         │
│  └─────────────────┘    └─────────────────┘    └────────┬────────┘         │
│                                                          │                  │
│  ┌─────────────────┐    ┌─────────────────┐             │                  │
│  │  Azure SQL      │◀───│  ASP.NET Core   │◀────────────┘                  │
│  │  Database       │    │  Web API        │                                 │
│  └─────────────────┘    └────────┬────────┘                                 │
│                                  │                                          │
│  ┌─────────────────┐    ┌────────▼────────┐    ┌─────────────────┐         │
│  │  Azure Cache    │◀───│  Azure SignalR  │───▶│  Blazor /       │         │
│  │  for Redis      │    │  Service        │    │  React SPA      │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │  Azure          │    │  Azure AD       │    │  Azure          │         │
│  │  Notification   │    │  B2C            │    │  Monitor        │         │
│  │  Hubs           │    │  (Identity)     │    │  + App Insights │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Key .NET Libraries

| Purpose | Library |
|---------|---------|
| Web Framework | ASP.NET Core 8+ |
| Real-Time | Microsoft.AspNetCore.SignalR |
| ORM | Entity Framework Core |
| Geospatial | NetTopologySuite |
| Kafka Client | Confluent.Kafka |
| Service Bus | Azure.Messaging.ServiceBus |
| Caching | Microsoft.Extensions.Caching.StackExchangeRedis |
| Push Notifications | Microsoft.Azure.NotificationHubs |
| Maps | Azure.Maps.* SDKs |

#### Sample ASP.NET Core SignalR Hub

```csharp
using Microsoft.AspNetCore.SignalR;

public class NotificationHub : Hub
{
    public async Task SubscribeToClient(string clientId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"client:{clientId}");
    }

    public async Task UnsubscribeFromClient(string clientId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"client:{clientId}");
    }
}

// Sending notifications from a service
public class NotificationService
{
    private readonly IHubContext<NotificationHub> _hubContext;

    public NotificationService(IHubContext<NotificationHub> hubContext)
    {
        _hubContext = hubContext;
    }

    public async Task SendNotification(string clientId, Notification notification)
    {
        await _hubContext.Clients
            .Group($"client:{clientId}")
            .SendAsync("notification", notification);
    }

    public async Task SendVesselUpdate(string clientId, VesselState vessel)
    {
        await _hubContext.Clients
            .Group($"client:{clientId}")
            .SendAsync("vessel:update", vessel);
    }
}
```

#### Azure Cost Estimate (.NET Stack)

| Service | Specification | Est. Monthly Cost |
|---------|---------------|-------------------|
| Azure Container Apps | 2 vCPU, 4GB RAM | $50-100 |
| Azure SQL Database | S2 (50 DTU) | $75 |
| Azure Cache for Redis | C1 (1GB) | $40 |
| Azure Event Hubs | Standard, 1 TU | $22 |
| Azure SignalR Service | Standard, 1 unit | $50 |
| Azure Notification Hubs | Basic | $10 |
| **Total** | | **~$250-300/month** |

*Costs vary by region and usage. Use Azure Pricing Calculator for accurate estimates.*

---

## 5. Detailed Component Design

### 5.1 Data Ingestion Service

The system supports two ingestion modes: **Push Mode** (production) and **Poll Mode** (MVP/fallback).

#### 5.1.1 Push Mode (Production - Preferred)

Signal Ocean's LatestVesselState API knows when data changes. In production, Signal Ocean pushes change events directly to our system, eliminating the need to poll 50K vessels.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PUSH MODE ARCHITECTURE (Production)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐                                                    │
│  │  Signal Ocean API   │                                                    │
│  │  (LatestVesselState)│                                                    │
│  └──────────┬──────────┘                                                    │
│             │                                                                │
│             │  Push on change (Webhook or Kafka)                            │
│             ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     INGESTION GATEWAY                                │   │
│  │                                                                       │   │
│  │  Option A: Webhook Endpoint         Option B: Kafka Consumer         │   │
│  │  ┌─────────────────────┐           ┌─────────────────────┐          │   │
│  │  │ POST /webhook/      │           │ Consume from Signal │          │   │
│  │  │   vessel-state      │           │ Ocean Kafka topic   │          │   │
│  │  │                     │           │                     │          │   │
│  │  │ - Validate payload  │           │ - Direct Kafka-to-  │          │   │
│  │  │ - Auth verification │           │   Kafka bridging    │          │   │
│  │  │ - Publish to Kafka  │           │ - Lower latency     │          │   │
│  │  └─────────────────────┘           └─────────────────────┘          │   │
│  └──────────────────────────────┬──────────────────────────────────────┘   │
│                                 │                                           │
│                                 ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Apache Kafka                                 │   │
│  │                   Topic: vessel.state.changed                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Push Mode Benefits:**
- Real-time updates (sub-second latency)
- No wasted API calls for unchanged vessels
- Reduced load on Signal Ocean API
- More efficient resource usage
- Signal Ocean only sends actual changes

**Webhook Endpoint Specification:**

```typescript
// POST /api/webhook/vessel-state
interface VesselStateWebhook {
  // Authentication
  headers: {
    'X-Signal-Signature': string;    // HMAC signature for verification
    'X-Signal-Timestamp': string;    // Request timestamp
  };

  body: {
    eventType: 'vessel.state.changed';
    eventId: string;                  // Idempotency key
    timestamp: string;                // ISO 8601
    data: {
      vessel: LatestVesselState;      // Full vessel state
      changedFields: string[];        // Which fields changed
      previousValues?: Record<string, any>;  // Optional: previous values
    };
  };
}

// Webhook handler
async function handleVesselStateWebhook(req: Request): Promise<Response> {
  // 1. Verify signature
  if (!verifySignature(req)) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Check idempotency (prevent duplicate processing)
  if (await isAlreadyProcessed(req.body.eventId)) {
    return new Response('OK', { status: 200 });
  }

  // 3. Publish to Kafka
  await kafka.publish('vessel.state.changed', {
    ...req.body.data.vessel,
    _meta: {
      eventId: req.body.eventId,
      changedFields: req.body.data.changedFields,
      receivedAt: new Date().toISOString(),
    }
  });

  // 4. Mark as processed
  await markAsProcessed(req.body.eventId);

  return new Response('OK', { status: 200 });
}
```

**Kafka-to-Kafka Bridge (if Signal Ocean exposes Kafka):**

```typescript
// If Signal Ocean provides direct Kafka access
const signalOceanConsumer = kafka.consumer({ groupId: 'notification-bridge' });

await signalOceanConsumer.subscribe({
  topic: 'signal-ocean.vessel.state.changes',  // Signal Ocean's topic
});

await signalOceanConsumer.run({
  eachMessage: async ({ message }) => {
    // Transform and republish to our internal topic
    const vesselState = JSON.parse(message.value.toString());

    await internalProducer.send({
      topic: 'vessel.state.changed',
      messages: [{
        key: vesselState.IMO.toString(),
        value: JSON.stringify(vesselState),
      }],
    });
  },
});
```

#### 5.1.2 Poll Mode (MVP / Fallback)

For the MVP or when push is unavailable, we poll the LatestVesselState API.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    POLL MODE ARCHITECTURE (MVP / Fallback)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐                                                    │
│  │  Signal Ocean API   │                                                    │
│  │  (LatestVesselState)│                                                    │
│  └──────────┬──────────┘                                                    │
│             ▲                                                                │
│             │  Poll every 1 minute                                          │
│             │                                                                │
│  ┌──────────┴──────────────────────────────────────────────────────────┐   │
│  │                      API POLLER SERVICE                              │   │
│  │                                                                       │   │
│  │  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐               │   │
│  │  │  Scheduler  │──▶│  API Client │──▶│  Publisher  │               │   │
│  │  │  (1 min)    │   │  (Batch)    │   │  (Kafka)    │               │   │
│  │  └─────────────┘   └─────────────┘   └─────────────┘               │   │
│  │                                                                       │   │
│  │  Strategy:                                                            │   │
│  │  - Fetch vessels in batches (1000 at a time)                         │   │
│  │  - Use ModifiedOn timestamp to detect changes                        │   │
│  │  - Only publish vessels that have changed since last poll            │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                 │                                           │
│                                 ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Apache Kafka                                 │   │
│  │                   Topic: vessel.state.raw                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                 │                                           │
│                                 ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    CHANGE DETECTION SERVICE                          │   │
│  │                                                                       │   │
│  │  - Compare with previous state in Redis                              │   │
│  │  - Detect which fields changed                                       │   │
│  │  - Only emit if significant change detected                          │   │
│  │  - Publish to vessel.state.changed topic                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                 │                                           │
│                                 ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Apache Kafka                                 │   │
│  │                   Topic: vessel.state.changed                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Poll Mode Optimization:**
- Use `ModifiedOn` field to skip unchanged vessels
- Track last poll timestamp per vessel group
- Only process vessels where `ModifiedOn > lastPollTime`

```typescript
// Optimized polling using ModifiedOn timestamp
async function pollVesselStates(groupId: number): Promise<void> {
  const lastPollTime = await redis.get(`poll:${groupId}:lastTime`);

  // Fetch only modified vessels
  const vessels = await signalOceanApi.getLatestVesselStates({
    groupId,
    modifiedSince: lastPollTime,  // Only get vessels modified since last poll
  });

  for (const vessel of vessels) {
    await kafka.publish('vessel.state.raw', vessel);
  }

  await redis.set(`poll:${groupId}:lastTime`, new Date().toISOString());
}
```

#### 5.1.3 Hybrid Mode (Recommended for Production)

Use Push as primary with Poll as fallback for reliability.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    HYBRID MODE (Production Recommended)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                      ┌─────────────────────┐                                │
│                      │  Signal Ocean API   │                                │
│                      └──────────┬──────────┘                                │
│                                 │                                           │
│               ┌─────────────────┴─────────────────┐                        │
│               │                                   │                        │
│               ▼                                   ▼                        │
│  ┌────────────────────────┐        ┌────────────────────────┐             │
│  │   PUSH (Primary)       │        │   POLL (Fallback)      │             │
│  │   Webhook/Kafka        │        │   Every 5 minutes      │             │
│  │   Real-time updates    │        │   Catch missed events  │             │
│  └───────────┬────────────┘        └───────────┬────────────┘             │
│              │                                  │                          │
│              └──────────────┬───────────────────┘                          │
│                             ▼                                              │
│              ┌────────────────────────┐                                    │
│              │   DEDUPLICATION        │                                    │
│              │   (by IMO + timestamp) │                                    │
│              └───────────┬────────────┘                                    │
│                          ▼                                                 │
│              ┌────────────────────────┐                                    │
│              │   vessel.state.changed │                                    │
│              └────────────────────────┘                                    │
│                                                                              │
│  Benefits:                                                                  │
│  - Real-time updates via push                                              │
│  - Poll catches any missed webhooks                                        │
│  - Graceful degradation if push fails                                      │
│  - Self-healing: poll fills gaps automatically                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Vessel State Processor

The processor is the same regardless of ingestion mode - it receives events from Kafka and processes them.

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
    // Destination change
    // etc.
}
```

### 5.3 Extensible Rules Engine

**Design Principle:** Notification types and rules are treated as *data*, not *code*. New notification types can be added without changing the core codebase or database schema.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EXTENSIBLE RULES ENGINE ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────┐      ┌────────────────────┐                        │
│  │ Notification Type  │      │ Client Rules       │                        │
│  │ Definitions        │      │ (per-client config)│                        │
│  │ (JSON Schema)      │      │ (JSON)             │                        │
│  └─────────┬──────────┘      └─────────┬──────────┘                        │
│            │                           │                                    │
│            ▼                           ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     GENERIC RULES ENGINE                             │   │
│  │                                                                       │   │
│  │  1. Receive event (vessel state, fixture, etc.)                      │   │
│  │  2. Load all active rules for matching data source                   │   │
│  │  3. For each rule:                                                   │   │
│  │     a. Apply entity filters (vessel type, IMO, etc.)                 │   │
│  │     b. Invoke condition evaluator based on rule type                 │   │
│  │     c. Check state transitions (enter/exit, changed, etc.)           │   │
│  │     d. Generate notification if triggered                            │   │
│  │  4. Deduplicate and publish notifications                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                           │                                                 │
│                           ▼                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                  PLUGGABLE CONDITION EVALUATORS                      │   │
│  │                                                                       │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │   │
│  │  │ geofence │ │ compare  │ │  change  │ │  range   │ │composite │  │   │
│  │  │          │ │ (>,<,=)  │ │ (detect) │ │ (min/max)│ │ (AND/OR) │  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │   │
│  │                                                                       │   │
│  │  New evaluators can be added as plugins without schema changes       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 5.3.1 Notification Type Definitions

Notification types are defined as configuration records, not hardcoded in the system:

```typescript
interface NotificationTypeDefinition {
  typeId: string;           // Unique identifier, e.g., "geofence_alert"
  name: string;             // Human-readable name
  description: string;
  dataSource: string;       // Event source: "vessel.state", "fixture", etc.

  // JSON Schema defining what conditions this type supports
  conditionSchema: {
    evaluator: string;      // Which evaluator to use
    parameters: JSONSchema; // Parameters the evaluator accepts
  };

  // What filters can be applied
  filterSchema: JSONSchema;

  // UI schema for rendering user preference settings dynamically
  preferencesUISchema?: {
    sections: Array<{
      key: string;           // Field path in condition, e.g., "from", "to"
      label: string;         // Display label
      type: 'multiselect' | 'select' | 'number' | 'toggle' | 'text';
      options?: string[];    // Static options for select/multiselect
      optionsSource?: string; // Dynamic options: "destinations", "vesselTypes", "ports"
      placeholder?: string;
      helpText?: string;
    }>;
  };

  // Notification template
  defaultTemplate: {
    title: string;          // Template with {{variables}}
    message: string;
  };

  // State tracking requirements
  stateTracking?: {
    enabled: boolean;
    transitionEvents: ('enter' | 'exit' | 'change')[];
  };
}
```

**Example Type Definitions:**

```json
[
  {
    "typeId": "geofence_alert",
    "name": "Geofence Alert",
    "dataSource": "vessel.state",
    "conditionSchema": {
      "evaluator": "geofence",
      "parameters": {
        "type": "object",
        "properties": {
          "polygonId": { "type": "string" },
          "triggerOn": { "enum": ["enter", "exit", "both"] }
        }
      }
    },
    "stateTracking": { "enabled": true, "transitionEvents": ["enter", "exit"] },
    "defaultTemplate": {
      "title": "Vessel {{triggerOn}} {{geofenceName}}",
      "message": "{{vesselName}} (IMO: {{imo}}) has {{triggerOn}} {{geofenceName}}"
    }
  },
  {
    "typeId": "speed_alert",
    "name": "Speed Alert",
    "dataSource": "vessel.state",
    "conditionSchema": {
      "evaluator": "compare",
      "parameters": {
        "type": "object",
        "properties": {
          "field": { "const": "Speed" },
          "operator": { "enum": ["gt", "lt", "eq", "gte", "lte"] },
          "value": { "type": "number" }
        }
      }
    },
    "defaultTemplate": {
      "title": "Speed Alert: {{vesselName}}",
      "message": "{{vesselName}} speed is {{speed}} knots (threshold: {{operator}} {{value}})"
    }
  },
  {
    "typeId": "status_change",
    "name": "Vessel Status Change",
    "dataSource": "vessel.state",
    "conditionSchema": {
      "evaluator": "change",
      "parameters": {
        "type": "object",
        "properties": {
          "field": { "type": "string" },
          "from": { "type": "array", "items": { "type": "string" } },
          "to": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "stateTracking": { "enabled": true, "transitionEvents": ["change"] },
    "defaultTemplate": {
      "title": "Status Changed: {{vesselName}}",
      "message": "{{vesselName}} status changed from {{previousValue}} to {{currentValue}}"
    }
  },
  {
    "typeId": "fixture_rate_change",
    "name": "Fixture Rate Alert",
    "dataSource": "fixture",
    "conditionSchema": {
      "evaluator": "compare",
      "parameters": {
        "type": "object",
        "properties": {
          "field": { "const": "rate" },
          "operator": { "enum": ["gt", "lt", "change_percent"] },
          "value": { "type": "number" }
        }
      }
    },
    "defaultTemplate": {
      "title": "Fixture Rate Change",
      "message": "Rate changed to {{rate}} ({{changePercent}}% change)"
    }
  },
  {
    "typeId": "destination_change",
    "name": "Destination Change Alert",
    "dataSource": "vessel.state",
    "conditionSchema": {
      "evaluator": "change",
      "parameters": {
        "type": "object",
        "properties": {
          "field": { "enum": ["AISDestination", "AISDestinationPortID"] },
          "from": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Only notify when leaving these destinations (empty = any)"
          },
          "to": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Only notify when arriving at these destinations (empty = any)"
          }
        },
        "required": ["field"]
      }
    },
    "preferencesUISchema": {
      "sections": [
        {
          "key": "from",
          "label": "From Destinations",
          "type": "multiselect",
          "optionsSource": "destinations",
          "placeholder": "Any destination",
          "helpText": "Only notify when vessel leaves these destinations"
        },
        {
          "key": "to",
          "label": "To Destinations",
          "type": "multiselect",
          "optionsSource": "destinations",
          "placeholder": "Any destination",
          "helpText": "Only notify when vessel arrives at these destinations"
        }
      ]
    },
    "stateTracking": { "enabled": true, "transitionEvents": ["change"] },
    "defaultTemplate": {
      "title": "Destination Changed: {{vesselName}}",
      "message": "{{vesselName}} (IMO: {{imo}}) destination changed from \"{{previousValue}}\" to \"{{currentValue}}\""
    }
  }
]
```

#### 5.3.2 Client Rule Configuration

Clients create rules by referencing type definitions:

```typescript
interface ClientRule {
  id: string;
  clientId: string;
  typeId: string;              // References NotificationTypeDefinition
  name: string;

  // Condition parameters (validated against type's conditionSchema)
  condition: Record<string, any>;

  // Entity filters
  filters?: {
    imos?: number[];
    vesselTypes?: string[];
    vesselClasses?: string[];
    trades?: string[];
    areas?: string[];
  };

  // Client-specific settings
  settings?: {
    cooldownMinutes?: number;  // Min time between notifications
    priority?: 'low' | 'medium' | 'high';
    channels?: ('web' | 'mobile' | 'email')[];
  };

  isActive: boolean;
}
```

**Example Client Rules:**

```json
[
  {
    "id": "rule-001",
    "clientId": "client-123",
    "typeId": "geofence_alert",
    "name": "Singapore Strait Watch",
    "condition": {
      "polygonId": "geofence-sg-strait",
      "triggerOn": "both"
    },
    "filters": {
      "vesselTypes": ["Tanker", "Container"]
    },
    "settings": {
      "priority": "high",
      "channels": ["web", "mobile"]
    },
    "isActive": true
  },
  {
    "id": "rule-002",
    "clientId": "client-123",
    "typeId": "speed_alert",
    "name": "High Speed Tanker Alert",
    "condition": {
      "field": "Speed",
      "operator": "gt",
      "value": 18
    },
    "filters": {
      "vesselTypes": ["Tanker"]
    },
    "isActive": true
  },
  {
    "id": "rule-003",
    "clientId": "client-456",
    "typeId": "status_change",
    "name": "Voyage Status Change",
    "condition": {
      "field": "VesselVoyageStatus",
      "to": ["Discharging", "Loading"]
    },
    "filters": {
      "imos": [9865556, 9812345]
    },
    "isActive": true
  },
  {
    "id": "rule-004",
    "clientId": "client-123",
    "typeId": "destination_change",
    "name": "Any Destination Change - My Fleet",
    "condition": {
      "field": "AISDestination"
    },
    "filters": {
      "imos": [9865556, 9812345, 9876543]
    },
    "settings": {
      "priority": "medium"
    },
    "isActive": true
  },
  {
    "id": "rule-005",
    "clientId": "client-456",
    "typeId": "destination_change",
    "name": "Vessels Heading to Singapore",
    "condition": {
      "field": "AISDestination",
      "to": ["SG", "SGSIN", "SINGAPORE", "SG SIN"]
    },
    "filters": {
      "vesselTypes": ["Tanker", "Container"]
    },
    "isActive": true
  }
]
```

#### 5.3.3 User Preferences & Filter Logic

User preferences are stored within the `condition` object of each `ClientRule`. The `preferencesUISchema` in the type definition tells the UI how to render the preference settings dynamically.

**Filter Evaluation Logic for `change` Evaluator:**

```typescript
function evaluateChangeCondition(
  currentValue: any,
  previousValue: any,
  condition: { field: string; from?: string[]; to?: string[] }
): boolean {
  // No change = no notification
  if (previousValue === currentValue) return false;

  // Check "from" filter (if specified)
  if (condition.from && condition.from.length > 0) {
    if (!condition.from.includes(previousValue)) return false;
  }

  // Check "to" filter (if specified)
  if (condition.to && condition.to.length > 0) {
    if (!condition.to.includes(currentValue)) return false;
  }

  // All filters passed (or no filters set)
  return true;
}
```

**User Preference Scenarios:**

| Scenario | `from` Filter | `to` Filter | Notification Triggered When |
|----------|---------------|-------------|------------------------------|
| All destination changes | `[]` (empty) | `[]` (empty) | Any destination change |
| Leaving specific ports | `["SINGAPORE", "HK"]` | `[]` | Leaving Singapore OR Hong Kong (to anywhere) |
| Arriving at specific ports | `[]` | `["ROTTERDAM", "DUBAI"]` | Arriving at Rotterdam OR Dubai (from anywhere) |
| Specific route | `["SINGAPORE"]` | `["ROTTERDAM"]` | Only Singapore → Rotterdam route |
| Multiple routes | `["SINGAPORE", "HK"]` | `["ROTTERDAM", "DUBAI"]` | SG→RTM, SG→DXB, HK→RTM, HK→DXB |

**Example: Destination Change Rule with Filters**

```json
{
  "id": "rule-dest-sg-rtm",
  "clientId": "client-123",
  "typeId": "destination_change",
  "name": "Singapore to Rotterdam Route Watch",
  "condition": {
    "field": "AISDestination",
    "from": ["SINGAPORE", "SG SIN", "SGSIN"],
    "to": ["ROTTERDAM", "NL RTM", "NLRTM"]
  },
  "filters": {
    "vesselTypes": ["Tanker"]
  },
  "settings": {
    "priority": "high"
  },
  "isActive": true
}
```

**Dynamic Preference UI Rendering:**

The UI reads `preferencesUISchema` from the notification type definition and renders the appropriate form controls:

```typescript
// Pseudo-code for rendering preferences UI
function renderPreferencesUI(typeDefinition: NotificationTypeDefinition) {
  const { preferencesUISchema } = typeDefinition;

  return preferencesUISchema.sections.map(section => {
    switch (section.type) {
      case 'multiselect':
        const options = section.optionsSource
          ? fetchOptionsFromSource(section.optionsSource)  // e.g., fetch destinations
          : section.options;
        return <MultiSelect
          key={section.key}
          label={section.label}
          options={options}
          placeholder={section.placeholder}
          helpText={section.helpText}
        />;
      case 'number':
        return <NumberInput key={section.key} label={section.label} />;
      case 'toggle':
        return <Toggle key={section.key} label={section.label} />;
      // ... other types
    }
  });
}
```

**Options Sources:**

| Source | Description | Example Values |
|--------|-------------|----------------|
| `destinations` | Known AIS destinations | SINGAPORE, ROTTERDAM, DUBAI, HOUSTON, ... |
| `vesselTypes` | Vessel type classifications | Tanker, Container, Dry, LNG, LPG |
| `ports` | Port database | Port IDs or names |
| `areas` | Geographic areas | Singapore Strait, Suez Canal, ... |
| `operators` | Commercial operators | Operator IDs or names |

#### 5.3.4 Condition Evaluators

Evaluators are pluggable functions that implement a common interface:

```typescript
interface ConditionEvaluator {
  id: string;

  // Evaluate the condition against incoming data
  evaluate(
    data: Record<string, any>,           // Incoming event data
    condition: Record<string, any>,       // Rule condition parameters
    previousState?: Record<string, any>   // Previous state (for transitions)
  ): EvaluationResult;
}

interface EvaluationResult {
  triggered: boolean;
  transition?: 'enter' | 'exit' | 'change' | null;
  context?: Record<string, any>;  // Additional data for notification
}
```

**Built-in Evaluators:**

| Evaluator | Purpose | Example Condition |
|-----------|---------|-------------------|
| `geofence` | Point-in-polygon check | `{ "polygonId": "...", "triggerOn": "enter" }` |
| `compare` | Field comparison | `{ "field": "Speed", "operator": "gt", "value": 15 }` |
| `change` | Detect value changes | `{ "field": "VesselStatus", "from": ["A"], "to": ["B"] }` |
| `range` | Value within range | `{ "field": "Draught", "min": 10, "max": 15 }` |
| `composite` | Combine conditions | `{ "operator": "AND", "conditions": [...] }` |
| `regex` | Pattern matching | `{ "field": "AISDestination", "pattern": "^SG.*" }` |

**Adding a New Evaluator (No Schema Changes):**

```typescript
// evaluators/proximity.ts - New evaluator for vessel proximity
const proximityEvaluator: ConditionEvaluator = {
  id: 'proximity',

  evaluate(data, condition, previousState) {
    const { targetImo, distanceNm } = condition;
    const targetVessel = getVesselPosition(targetImo);
    const distance = calculateDistance(
      data.Latitude, data.Longitude,
      targetVessel.lat, targetVessel.lng
    );

    const wasClose = previousState?.isClose ?? false;
    const isClose = distance <= distanceNm;

    return {
      triggered: isClose !== wasClose,
      transition: isClose ? 'enter' : 'exit',
      context: { distance, targetImo }
    };
  }
};

// Register the evaluator
evaluatorRegistry.register(proximityEvaluator);
```

Then add a notification type definition (via API, no code deploy):

```json
{
  "typeId": "proximity_alert",
  "name": "Vessel Proximity Alert",
  "dataSource": "vessel.state",
  "conditionSchema": {
    "evaluator": "proximity",
    "parameters": {
      "properties": {
        "targetImo": { "type": "number" },
        "distanceNm": { "type": "number" }
      }
    }
  }
}
```

#### 5.3.5 Rules Engine Flow

```typescript
async function processEvent(event: DataEvent): Promise<void> {
  // 1. Get all active rules for this data source
  const rules = await ruleRepository.findActive({
    dataSource: event.source,  // e.g., "vessel.state"
  });

  // 2. Process each rule
  for (const rule of rules) {
    // 2a. Apply entity filters
    if (!matchesFilters(event.data, rule.filters)) {
      continue;
    }

    // 2b. Get the notification type definition
    const typeDef = await typeRegistry.get(rule.typeId);

    // 2c. Get the evaluator
    const evaluator = evaluatorRegistry.get(typeDef.conditionSchema.evaluator);

    // 2d. Get previous state if state tracking is enabled
    const previousState = typeDef.stateTracking?.enabled
      ? await stateStore.get(rule.id, event.data.IMO)
      : undefined;

    // 2e. Evaluate the condition
    const result = evaluator.evaluate(event.data, rule.condition, previousState);

    // 2f. Update state
    if (typeDef.stateTracking?.enabled) {
      await stateStore.set(rule.id, event.data.IMO, {
        ...result.context,
        lastEvaluated: new Date()
      });
    }

    // 2g. Generate notification if triggered
    if (result.triggered) {
      const notification = buildNotification(rule, typeDef, event.data, result);
      await notificationService.send(notification);
    }
  }
}
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

### 11.1 Extensible Schema Design

The schema is designed so that new notification types can be added without schema changes.
All type-specific configuration is stored in JSONB columns.

### 11.2 PostgreSQL Schema

```sql
-- ============================================================================
-- CORE TABLES (rarely change)
-- ============================================================================

-- Clients table
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    api_key VARCHAR(255) UNIQUE NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- EXTENSIBLE NOTIFICATION TYPE SYSTEM (no schema changes needed for new types)
-- ============================================================================

-- Notification type definitions (admin-managed, defines what types exist)
-- Adding a new notification type = INSERT, not schema change
CREATE TABLE notification_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_id VARCHAR(100) UNIQUE NOT NULL,           -- e.g., "geofence_alert", "speed_alert"
    name VARCHAR(255) NOT NULL,
    description TEXT,
    data_source VARCHAR(100) NOT NULL,              -- e.g., "vessel.state", "fixture"

    -- JSON Schema defining valid condition parameters for this type
    condition_schema JSONB NOT NULL,

    -- JSON Schema defining valid filter options
    filter_schema JSONB DEFAULT '{}',

    -- Default notification template (supports {{variable}} syntax)
    default_template JSONB NOT NULL,
    -- Example: {"title": "Vessel {{action}} {{geofenceName}}", "message": "..."}

    -- State tracking configuration
    state_tracking JSONB DEFAULT '{"enabled": false}',
    -- Example: {"enabled": true, "transitionEvents": ["enter", "exit"]}

    -- UI hints for rule builder
    ui_schema JSONB DEFAULT '{}',

    is_system BOOLEAN DEFAULT false,                -- true = cannot be deleted
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notification_types_type_id ON notification_types(type_id);
CREATE INDEX idx_notification_types_data_source ON notification_types(data_source);

-- Client rules (generic structure, works with any notification type)
CREATE TABLE client_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    type_id VARCHAR(100) NOT NULL REFERENCES notification_types(type_id),
    name VARCHAR(255) NOT NULL,

    -- Condition parameters (validated against notification_types.condition_schema)
    condition JSONB NOT NULL,
    -- Example: {"polygonId": "abc", "triggerOn": "enter"}
    -- Example: {"field": "Speed", "operator": "gt", "value": 15}

    -- Entity filters (which vessels/entities this rule applies to)
    filters JSONB DEFAULT '{}',
    -- Example: {"vesselTypes": ["Tanker"], "imos": [123, 456]}

    -- Client-specific settings
    settings JSONB DEFAULT '{}',
    -- Example: {"cooldownMinutes": 30, "priority": "high", "channels": ["web"]}

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_client_rules_client ON client_rules(client_id);
CREATE INDEX idx_client_rules_type ON client_rules(type_id);
CREATE INDEX idx_client_rules_active ON client_rules(is_active) WHERE is_active = true;

-- ============================================================================
-- GEOFENCES (special case - needs geometry support)
-- ============================================================================

-- Geofences table (with PostGIS for spatial queries)
CREATE TABLE geofences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Geometry type and data
    geofence_type VARCHAR(20) NOT NULL CHECK (geofence_type IN ('polygon', 'circle')),
    geometry GEOMETRY(GEOMETRY, 4326) NOT NULL,

    -- For circles: store center and radius separately for easy access
    center_lat DOUBLE PRECISION,
    center_lng DOUBLE PRECISION,
    radius_km DOUBLE PRECISION,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_geofences_client ON geofences(client_id);
CREATE INDEX idx_geofences_geometry ON geofences USING GIST(geometry);

-- ============================================================================
-- STATE TRACKING (for enter/exit detection)
-- ============================================================================

-- Rule state tracking (for detecting transitions)
CREATE TABLE rule_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES client_rules(id) ON DELETE CASCADE,
    entity_id VARCHAR(100) NOT NULL,                -- e.g., IMO number

    -- Current state (flexible JSONB for any evaluator)
    state JSONB NOT NULL,
    -- Example for geofence: {"isInside": true, "enteredAt": "..."}
    -- Example for change: {"previousValue": "Loading", "currentValue": "Discharging"}

    last_evaluated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(rule_id, entity_id)
);

CREATE INDEX idx_rule_state_rule ON rule_state(rule_id);
CREATE INDEX idx_rule_state_entity ON rule_state(entity_id);

-- ============================================================================
-- NOTIFICATIONS (generic, works with any type)
-- ============================================================================

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES client_rules(id) ON DELETE SET NULL,
    type_id VARCHAR(100) NOT NULL,

    -- Notification content
    title VARCHAR(500) NOT NULL,
    message TEXT NOT NULL,

    -- All contextual data (flexible JSONB)
    payload JSONB NOT NULL,
    -- Example: {"vesselName": "...", "imo": 123, "geofenceName": "...", "action": "entered"}

    -- Delivery tracking
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(20) DEFAULT 'pending',
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX idx_notifications_client_status ON notifications(client_id, status);
CREATE INDEX idx_notifications_type ON notifications(type_id);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- ============================================================================
-- SEED DATA: Built-in notification types
-- ============================================================================

INSERT INTO notification_types (type_id, name, description, data_source, condition_schema, default_template, state_tracking, is_system) VALUES
(
    'geofence_alert',
    'Geofence Alert',
    'Triggered when a vessel enters or exits a defined geographic area',
    'vessel.state',
    '{
        "evaluator": "geofence",
        "parameters": {
            "type": "object",
            "properties": {
                "geofenceId": {"type": "string"},
                "triggerOn": {"enum": ["enter", "exit", "both"]}
            },
            "required": ["geofenceId", "triggerOn"]
        }
    }',
    '{
        "title": "Vessel {{action}} {{geofenceName}}",
        "message": "{{vesselName}} (IMO: {{imo}}) has {{action}} the geofence \"{{geofenceName}}\" at {{timestamp}}"
    }',
    '{"enabled": true, "transitionEvents": ["enter", "exit"]}',
    true
),
(
    'speed_alert',
    'Speed Alert',
    'Triggered when vessel speed crosses a threshold',
    'vessel.state',
    '{
        "evaluator": "compare",
        "parameters": {
            "type": "object",
            "properties": {
                "field": {"const": "Speed"},
                "operator": {"enum": ["gt", "lt", "gte", "lte", "eq"]},
                "value": {"type": "number", "minimum": 0}
            },
            "required": ["field", "operator", "value"]
        }
    }',
    '{
        "title": "Speed Alert: {{vesselName}}",
        "message": "{{vesselName}} (IMO: {{imo}}) speed is {{currentValue}} knots (threshold: {{operator}} {{threshold}})"
    }',
    '{"enabled": false}',
    true
),
(
    'status_change',
    'Vessel Status Change',
    'Triggered when a vessel status changes',
    'vessel.state',
    '{
        "evaluator": "change",
        "parameters": {
            "type": "object",
            "properties": {
                "field": {"type": "string"},
                "from": {"type": "array", "items": {"type": "string"}},
                "to": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["field"]
        }
    }',
    '{
        "title": "Status Change: {{vesselName}}",
        "message": "{{vesselName}} (IMO: {{imo}}) {{field}} changed from \"{{previousValue}}\" to \"{{currentValue}}\""
    }',
    '{"enabled": true, "transitionEvents": ["change"]}',
    true
),
(
    'area_change',
    'Area Change Alert',
    'Triggered when a vessel moves to a different area',
    'vessel.state',
    '{
        "evaluator": "change",
        "parameters": {
            "type": "object",
            "properties": {
                "field": {"enum": ["AreaName", "AreaNameLevel1", "AreaNameLevel2"]},
                "to": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["field"]
        }
    }',
    '{
        "title": "Area Change: {{vesselName}}",
        "message": "{{vesselName}} (IMO: {{imo}}) has entered {{currentValue}}"
    }',
    '{"enabled": true, "transitionEvents": ["change"]}',
    true
),
(
    'destination_change',
    'Destination Change Alert',
    'Triggered when a vessel changes its reported destination (AIS destination)',
    'vessel.state',
    '{
        "evaluator": "change",
        "parameters": {
            "type": "object",
            "properties": {
                "field": {"enum": ["AISDestination", "AISDestinationPortID"]},
                "to": {"type": "array", "items": {"type": "string"}, "description": "Optional: specific destinations. Empty = any change"}
            },
            "required": ["field"]
        }
    }',
    '{
        "title": "Destination Changed: {{vesselName}}",
        "message": "{{vesselName}} (IMO: {{imo}}) destination changed from \"{{previousValue}}\" to \"{{currentValue}}\""
    }',
    '{"enabled": true, "transitionEvents": ["change"]}',
    true
);
```

### 11.3 Schema Extensibility Examples

**Adding a new notification type (no code deployment needed):**

```sql
-- Example: Add a "Draught Alert" notification type via API or admin UI
INSERT INTO notification_types (type_id, name, description, data_source, condition_schema, default_template)
VALUES (
    'draught_alert',
    'Draught Alert',
    'Triggered when vessel draught exceeds threshold',
    'vessel.state',
    '{
        "evaluator": "compare",
        "parameters": {
            "type": "object",
            "properties": {
                "field": {"const": "Draught"},
                "operator": {"enum": ["gt", "lt"]},
                "value": {"type": "number"}
            }
        }
    }',
    '{
        "title": "Draught Alert: {{vesselName}}",
        "message": "{{vesselName}} draught is {{currentValue}}m"
    }'
);

-- Now clients can immediately create rules using this new type!
```

**Client creating a rule for the new type:**

```sql
INSERT INTO client_rules (client_id, type_id, name, condition, filters)
VALUES (
    'client-123',
    'draught_alert',
    'Deep Draught Tankers',
    '{"field": "Draught", "operator": "gt", "value": 15}',
    '{"vesselTypes": ["Tanker"]}'
);
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

## 17. MVP AWS Deployment (Simplest)

### 17.1 Deployment Strategy

For the 1-day prototype, use a **single EC2 instance running Docker Compose** - identical to local development with minimal changes.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AWS MVP DEPLOYMENT                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                           ┌─────────────────┐                               │
│                           │   Route 53      │                               │
│                           │ (Optional DNS)  │                               │
│                           └────────┬────────┘                               │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     EC2 Instance (t3.medium)                          │  │
│  │                                                                        │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │  │
│  │  │                    Docker Compose                                │ │  │
│  │  │                                                                   │ │  │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │ │  │
│  │  │  │   Kafka     │  │  Next.js    │  │   Mock Producer         │ │ │  │
│  │  │  │   (KRaft)   │  │  App:3000   │  │   (Node.js)             │ │ │  │
│  │  │  │   :9092     │  │  + Socket.io│  │                         │ │ │  │
│  │  │  └─────────────┘  └─────────────┘  └─────────────────────────┘ │ │  │
│  │  │                                                                   │ │  │
│  │  │  ┌─────────────────────────────────────────────────────────────┐ │ │  │
│  │  │  │              SQLite (file in Docker volume)                  │ │ │  │
│  │  │  └─────────────────────────────────────────────────────────────┘ │ │  │
│  │  └─────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                        │  │
│  │  Security Group: Inbound 80, 443, 22                                  │  │
│  │  Elastic IP: For stable public address                                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 17.2 Code Changes Required for AWS

**Minimal changes - all via environment variables:**

```bash
# .env.production (AWS)
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-domain.com      # Or http://ec2-ip:3000
NEXT_PUBLIC_WS_URL=wss://your-domain.com         # WebSocket URL
DATABASE_URL=file:./data/prod.db                 # SQLite path
KAFKA_BROKERS=kafka:9092                         # Internal Docker network
```

**Changes to implement during prototype:**

1. **Environment-based configuration** (already best practice)
```typescript
// lib/config.ts
export const config = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  wsUrl: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000',
  kafkaBrokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
};
```

2. **CORS configuration** for production domain
```typescript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: process.env.ALLOWED_ORIGIN || '*' },
        ],
      },
    ];
  },
};
```

3. **Socket.io CORS**
```typescript
// lib/socket.ts
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});
```

### 17.3 AWS Deployment Steps

```bash
# 1. Launch EC2 instance
#    - AMI: Amazon Linux 2023 or Ubuntu 22.04
#    - Instance type: t3.medium (2 vCPU, 4GB RAM)
#    - Storage: 30GB gp3
#    - Security Group: Allow 22 (SSH), 80 (HTTP), 443 (HTTPS)

# 2. SSH into instance
ssh -i your-key.pem ec2-user@your-ec2-ip

# 3. Install Docker and Docker Compose
sudo yum update -y
sudo yum install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ec2-user

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 4. Clone repository
git clone https://github.com/fanwu/maritime-notification.git
cd maritime-notification

# 5. Create production environment file
cat > .env.production << EOF
NODE_ENV=production
NEXT_PUBLIC_APP_URL=http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):3000
NEXT_PUBLIC_WS_URL=ws://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):3000
EOF

# 6. Start services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 7. View logs
docker-compose logs -f
```

### 17.4 Docker Compose Production Override

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  web:
    environment:
      - NODE_ENV=production
    restart: always

  kafka:
    restart: always

  mock-producer:
    restart: always
```

### 17.5 Optional: Add HTTPS with Caddy

For production with HTTPS, add Caddy as reverse proxy:

```yaml
# docker-compose.prod.yml (with HTTPS)
services:
  caddy:
    image: caddy:2
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on:
      - web

  web:
    ports: []  # Remove public port, only expose internally
    expose:
      - "3000"

volumes:
  caddy_data:
```

```
# Caddyfile
your-domain.com {
    reverse_proxy web:3000
}
```

### 17.6 MVP AWS Cost Estimate

| Resource | Specification | Monthly Cost |
|----------|---------------|--------------|
| EC2 | t3.medium (on-demand) | ~$30 |
| EBS | 30GB gp3 | ~$3 |
| Elastic IP | 1 IP | ~$4 |
| Data Transfer | ~10GB | ~$1 |
| **Total** | | **~$38/month** |

*Use Reserved Instance or Spot for further savings.*

### 17.7 Scaling Beyond MVP

When ready to scale, migrate to:

| Component | MVP | Production |
|-----------|-----|------------|
| Compute | Single EC2 | ECS Fargate / EKS |
| Database | SQLite | RDS PostgreSQL |
| Kafka | Docker | Amazon MSK |
| Cache | In-memory | ElastiCache Redis |
| Load Balancer | None | ALB |

The code changes for this migration are minimal because:
- Prisma abstracts database (change connection string)
- KafkaJS works with MSK (change broker URLs)
- Socket.io works behind ALB with sticky sessions

---

## 18. Cost Estimates (Production Deployment)

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

## 19. External Notification Channels

Beyond the web application, notifications can be pushed to external channels for broader reach and integration with existing workflows.

### 19.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Notification Service                              │
│                                                                      │
│  ┌──────────────┐    ┌─────────────────────────────────────────┐   │
│  │ Notification │    │        Channel Dispatcher                │   │
│  │   Created    │───▶│                                         │   │
│  └──────────────┘    │  ┌─────────┐ ┌─────────┐ ┌──────────┐  │   │
│                      │  │  Web    │ │ Mobile  │ │  Slack   │  │   │
│                      │  │Socket.io│ │  Push   │ │ Webhook  │  │   │
│                      │  └────┬────┘ └────┬────┘ └────┬─────┘  │   │
│                      │       │           │           │         │   │
│                      │  ┌────┴────┐ ┌────┴────┐ ┌────┴─────┐  │   │
│                      │  │  Email  │ │   SMS   │ │ Webhook  │  │   │
│                      │  │  SMTP   │ │ Twilio  │ │  Custom  │  │   │
│                      │  └─────────┘ └─────────┘ └──────────┘  │   │
│                      └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 19.2 Channel Configuration Model

```typescript
interface NotificationChannel {
  id: string;
  clientId: string;
  type: 'email' | 'sms' | 'slack' | 'mobile_push' | 'webhook' | 'teams';
  name: string;
  config: ChannelConfig;
  enabled: boolean;

  // Filter which notifications go to this channel
  notificationTypes: string[];  // ['geofence_alert', 'destination_change']
  severityFilter?: ('info' | 'warning' | 'critical')[];
}

type ChannelConfig =
  | EmailConfig
  | SMSConfig
  | SlackConfig
  | MobilePushConfig
  | WebhookConfig
  | TeamsConfig;
```

### 19.3 Email Integration

**Provider Options:** SendGrid, AWS SES, Mailgun, Postmark

```typescript
interface EmailConfig {
  provider: 'sendgrid' | 'ses' | 'mailgun' | 'smtp';
  recipients: string[];
  fromAddress: string;
  templateId?: string;  // Provider-specific template

  // SMTP config (if provider = 'smtp')
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
  };
}

// Example: SendGrid Integration
import sgMail from '@sendgrid/mail';

async function sendEmailNotification(
  notification: Notification,
  config: EmailConfig
) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  await sgMail.send({
    to: config.recipients,
    from: config.fromAddress,
    subject: notification.title,
    html: renderEmailTemplate(notification),
    // Dynamic template (optional)
    templateId: config.templateId,
    dynamicTemplateData: {
      vesselName: notification.data.vesselName,
      eventType: notification.typeId,
      timestamp: notification.createdAt,
      details: notification.message,
    },
  });
}
```

### 19.4 SMS Integration (Twilio)

**Provider Options:** Twilio, AWS SNS, Vonage

```typescript
interface SMSConfig {
  provider: 'twilio' | 'sns' | 'vonage';
  recipients: string[];  // E.164 format: +1234567890

  // Twilio config
  twilio?: {
    accountSid: string;
    authToken: string;
    fromNumber: string;
  };
}

// Example: Twilio Integration
import twilio from 'twilio';

async function sendSMSNotification(
  notification: Notification,
  config: SMSConfig
) {
  const client = twilio(
    config.twilio.accountSid,
    config.twilio.authToken
  );

  const message = `[${notification.typeId}] ${notification.title}: ${notification.message}`;

  await Promise.all(
    config.recipients.map(to =>
      client.messages.create({
        body: message.substring(0, 160), // SMS limit
        from: config.twilio.fromNumber,
        to,
      })
    )
  );
}
```

### 19.5 Slack Integration

**Method:** Incoming Webhooks or Slack App with Bot Token

```typescript
interface SlackConfig {
  webhookUrl?: string;           // Simple: Incoming Webhook
  botToken?: string;             // Advanced: Bot with OAuth
  channel: string;               // #channel-name or channel ID
  mentionUsers?: string[];       // ['U123ABC', 'U456DEF']
  mentionGroups?: string[];      // ['@oncall', '@shipping-team']
}

// Example: Slack Webhook Integration
async function sendSlackNotification(
  notification: Notification,
  config: SlackConfig
) {
  const emoji = {
    geofence_alert: '📍',
    destination_change: '🔄',
    speed_alert: '⚡',
  }[notification.typeId] || '🔔';

  const payload = {
    channel: config.channel,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} ${notification.title}`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Vessel:*\n${notification.data.vesselName}`,
          },
          {
            type: 'mrkdwn',
            text: `*IMO:*\n${notification.data.imo}`,
          },
          {
            type: 'mrkdwn',
            text: `*Event:*\n${notification.message}`,
          },
          {
            type: 'mrkdwn',
            text: `*Time:*\n${new Date(notification.createdAt).toISOString()}`,
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View on Map' },
            url: `${process.env.APP_URL}?vessel=${notification.data.imo}`,
          },
        ],
      },
    ],
  };

  // Add mentions if configured
  if (config.mentionUsers?.length) {
    payload.blocks.unshift({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: config.mentionUsers.map(u => `<@${u}>`).join(' '),
      },
    });
  }

  await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
```

### 19.6 Microsoft Teams Integration

```typescript
interface TeamsConfig {
  webhookUrl: string;  // Teams Incoming Webhook URL
}

async function sendTeamsNotification(
  notification: Notification,
  config: TeamsConfig
) {
  const payload = {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: notification.typeId === 'geofence_alert' ? '0076D7' : 'FFA500',
    summary: notification.title,
    sections: [{
      activityTitle: notification.title,
      facts: [
        { name: 'Vessel', value: notification.data.vesselName },
        { name: 'IMO', value: notification.data.imo },
        { name: 'Event', value: notification.message },
        { name: 'Time', value: new Date(notification.createdAt).toISOString() },
      ],
      markdown: true,
    }],
    potentialAction: [{
      '@type': 'OpenUri',
      name: 'View on Map',
      targets: [{ os: 'default', uri: `${process.env.APP_URL}?vessel=${notification.data.imo}` }],
    }],
  };

  await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
```

### 19.7 Mobile Push Notifications

**Provider Options:** Firebase Cloud Messaging (FCM), Apple Push Notification Service (APNs), OneSignal, Expo

```typescript
interface MobilePushConfig {
  provider: 'fcm' | 'apns' | 'onesignal' | 'expo';

  // FCM config
  fcm?: {
    serverKey: string;
    projectId: string;
  };

  // Device tokens stored per user
  // Retrieved from UserDevice table
}

// Example: Firebase Cloud Messaging
import admin from 'firebase-admin';

async function sendMobilePushNotification(
  notification: Notification,
  userDevices: UserDevice[]
) {
  const tokens = userDevices
    .filter(d => d.platform === 'android' || d.platform === 'ios')
    .map(d => d.pushToken);

  if (tokens.length === 0) return;

  const message = {
    notification: {
      title: notification.title,
      body: notification.message,
    },
    data: {
      notificationId: notification.id,
      typeId: notification.typeId,
      vesselImo: String(notification.data.imo),
      click_action: 'OPEN_NOTIFICATION',
    },
    tokens,
  };

  const response = await admin.messaging().sendEachForMulticast(message);

  // Handle failed tokens (remove invalid ones)
  response.responses.forEach((resp, idx) => {
    if (!resp.success && resp.error?.code === 'messaging/invalid-registration-token') {
      // Remove invalid token from database
      removeDeviceToken(tokens[idx]);
    }
  });
}
```

### 19.8 Custom Webhook Integration

For integrating with any external system:

```typescript
interface WebhookConfig {
  url: string;
  method: 'POST' | 'PUT';
  headers?: Record<string, string>;
  authType?: 'none' | 'basic' | 'bearer' | 'api_key';
  authConfig?: {
    username?: string;
    password?: string;
    token?: string;
    apiKey?: string;
    apiKeyHeader?: string;
  };

  // Transform notification to custom payload
  payloadTemplate?: string;  // Handlebars template

  // Retry configuration
  retryAttempts?: number;
  retryDelayMs?: number;
}

async function sendWebhookNotification(
  notification: Notification,
  config: WebhookConfig
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.headers,
  };

  // Add authentication
  if (config.authType === 'bearer') {
    headers['Authorization'] = `Bearer ${config.authConfig.token}`;
  } else if (config.authType === 'api_key') {
    headers[config.authConfig.apiKeyHeader || 'X-API-Key'] = config.authConfig.apiKey;
  }

  // Build payload
  const payload = config.payloadTemplate
    ? renderTemplate(config.payloadTemplate, notification)
    : {
        id: notification.id,
        type: notification.typeId,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        timestamp: notification.createdAt,
      };

  // Send with retry
  await sendWithRetry(
    () => fetch(config.url, {
      method: config.method,
      headers,
      body: JSON.stringify(payload),
    }),
    config.retryAttempts || 3,
    config.retryDelayMs || 1000
  );
}
```

### 19.9 Channel Dispatcher Service

Central service that routes notifications to appropriate channels:

```typescript
class ChannelDispatcher {
  private channels: Map<string, NotificationChannel[]> = new Map();

  async dispatch(notification: Notification) {
    const clientChannels = await this.getClientChannels(notification.clientId);

    const applicableChannels = clientChannels.filter(channel =>
      channel.enabled &&
      channel.notificationTypes.includes(notification.typeId)
    );

    const results = await Promise.allSettled(
      applicableChannels.map(channel =>
        this.sendToChannel(notification, channel)
      )
    );

    // Log delivery status
    results.forEach((result, idx) => {
      const channel = applicableChannels[idx];
      if (result.status === 'fulfilled') {
        logger.info(`Notification ${notification.id} sent to ${channel.type}`);
      } else {
        logger.error(`Failed to send to ${channel.type}:`, result.reason);
      }
    });
  }

  private async sendToChannel(
    notification: Notification,
    channel: NotificationChannel
  ) {
    switch (channel.type) {
      case 'email':
        return sendEmailNotification(notification, channel.config as EmailConfig);
      case 'sms':
        return sendSMSNotification(notification, channel.config as SMSConfig);
      case 'slack':
        return sendSlackNotification(notification, channel.config as SlackConfig);
      case 'teams':
        return sendTeamsNotification(notification, channel.config as TeamsConfig);
      case 'mobile_push':
        return sendMobilePushNotification(notification, await this.getUserDevices(notification.clientId));
      case 'webhook':
        return sendWebhookNotification(notification, channel.config as WebhookConfig);
    }
  }
}
```

### 19.10 Database Schema for Channels

```prisma
model NotificationChannel {
  id               String   @id @default(uuid())
  clientId         String
  type             String   // email, sms, slack, mobile_push, webhook, teams
  name             String
  config           Json     // Channel-specific configuration
  enabled          Boolean  @default(true)
  notificationTypes String[] // Which notification types to send
  severityFilter   String[] // Optional: filter by severity
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  // Delivery tracking
  deliveries       ChannelDelivery[]

  @@index([clientId, enabled])
}

model ChannelDelivery {
  id               String   @id @default(uuid())
  channelId        String
  notificationId   String
  status           String   // pending, sent, failed, bounced
  attempts         Int      @default(0)
  lastAttemptAt    DateTime?
  errorMessage     String?
  externalId       String?  // Provider's message ID
  createdAt        DateTime @default(now())

  channel          NotificationChannel @relation(fields: [channelId], references: [id])
  notification     Notification @relation(fields: [notificationId], references: [id])

  @@index([channelId, status])
  @@index([notificationId])
}

model UserDevice {
  id               String   @id @default(uuid())
  userId           String
  platform         String   // ios, android, web
  pushToken        String   @unique
  deviceName       String?
  lastActiveAt     DateTime
  createdAt        DateTime @default(now())

  @@index([userId])
}
```

### 19.11 Rate Limiting & Throttling

Prevent notification spam on external channels:

```typescript
interface ChannelRateLimits {
  email: { maxPerHour: 100, maxPerDay: 500 };
  sms: { maxPerHour: 20, maxPerDay: 100 };
  slack: { maxPerMinute: 10, maxPerHour: 100 };
  mobile_push: { maxPerHour: 50, maxPerDay: 200 };
}

class RateLimiter {
  async canSend(clientId: string, channelType: string): Promise<boolean> {
    const limits = ChannelRateLimits[channelType];
    const counts = await this.getRecentCounts(clientId, channelType);

    return counts.lastHour < limits.maxPerHour &&
           counts.lastDay < limits.maxPerDay;
  }

  async throttle(clientId: string, channelType: string) {
    if (!await this.canSend(clientId, channelType)) {
      throw new RateLimitExceeded(channelType);
    }
  }
}
```

### 19.12 User Preferences UI

Allow users to configure their notification channels:

```typescript
// API endpoints
GET  /api/channels              // List user's configured channels
POST /api/channels              // Add new channel
PUT  /api/channels/:id          // Update channel config
DELETE /api/channels/:id        // Remove channel

GET  /api/channels/:id/test     // Send test notification

// Example UI sections:
// 1. Email Notifications
//    - Add email addresses
//    - Select notification types
//    - Set quiet hours
//
// 2. Slack Integration
//    - Connect Slack workspace (OAuth)
//    - Select channel
//    - Configure mentions
//
// 3. Mobile Push
//    - Download mobile app
//    - Enable/disable per notification type
//
// 4. SMS Alerts (Premium)
//    - Add phone numbers
//    - Critical alerts only
```

### 19.13 Implementation Phases

| Phase | Channels | Effort |
|-------|----------|--------|
| Phase 1 | Email (SendGrid), Webhook | 1-2 weeks |
| Phase 2 | Slack, Microsoft Teams | 1 week |
| Phase 3 | Mobile Push (FCM) | 2-3 weeks |
| Phase 4 | SMS (Twilio) | 1 week |

**Phase 1 Priority:** Email and Webhook cover most enterprise use cases and integrate with existing systems.

---

## 20. Open Questions & Future Considerations

1. **Multi-region deployment** - Needed for global clients?
2. **Analytics** - Track notification engagement metrics?
3. **Webhooks** - Allow clients to receive notifications via HTTP callbacks?
4. **API rate limits** - Should we implement client-specific rate limits?
5. **Mobile app scope** - Native features beyond push notifications?

---

## 21. Appendix

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
