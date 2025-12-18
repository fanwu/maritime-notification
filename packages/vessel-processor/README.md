# Vessel Processor

Kafka consumer service that processes vessel state updates from AWS MSK and generates notifications.

## Features

- Consumes vessel state messages from AWS MSK (with IAM authentication)
- Evaluates notification rules (geofence, destination change, speed alerts)
- Publishes notifications to Redis for real-time delivery
- Discovers unique values (destinations, areas, vessel types) for UI dropdowns
- Supports Snappy compression for MSK messages

## Prerequisites

- Docker (for PostgreSQL and Redis)
- AWS credentials configured (for MSK IAM authentication)
- Node.js 18+

## Quick Start

### 1. Start PostgreSQL and Redis

```bash
# From project root
docker-compose up -d postgres redis
```

### 2. Initialize Database

```bash
# Connect to PostgreSQL and run schema
docker exec -i postgres psql -U notification -d notification < sql/schema.sql
```

### 3. Install Dependencies

```bash
cd packages/vessel-processor
pnpm install
```

### 4. Run the Service

```bash
# Normal mode - continue from last offset
pnpm dev

# Reset mode - clear all state and reprocess from beginning
pnpm dev:reset

# From beginning - process from start without clearing state
pnpm dev:from-beginning

# Info only - show topic info and exit
pnpm info
```

## Configuration

Environment variables (or defaults to AWS MSK):

| Variable | Default | Description |
|----------|---------|-------------|
| `KAFKA_BROKERS` | MSK public endpoints | Comma-separated broker list |
| `USE_MSK_IAM` | `true` | Enable MSK IAM authentication |
| `AWS_REGION` | `us-east-1` | AWS region for MSK |
| `KAFKA_TOPIC` | `vessel.state.changed` | Kafka topic to consume |
| `KAFKA_GROUP_ID` | `notification-processor` | Consumer group ID |
| `POSTGRES_HOST` | `localhost` | PostgreSQL host |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_DB` | `notification` | Database name |
| `POSTGRES_USER` | `notification` | Database user |
| `POSTGRES_PASSWORD` | `notification` | Database password |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |

## CLI Options

| Option | Description |
|--------|-------------|
| `--reset`, `-r` | Reset consumer offsets and clear Redis state, then start from beginning |
| `--from-beginning`, `-b` | Start consuming from beginning of topic |
| `--info`, `-i` | Show topic info (partitions, message count) and exit |

## Architecture

```
AWS MSK (Kafka)
     │
     ▼
┌─────────────────────────────────────┐
│         Vessel Processor            │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Kafka Consumer             │   │
│  │  - MSK IAM Auth             │   │
│  │  - Snappy Decompression     │   │
│  └─────────────────────────────┘   │
│              │                      │
│              ▼                      │
│  ┌─────────────────────────────┐   │
│  │  Discovery                  │   │──► Redis Sets
│  │  - Track destinations       │   │    (discovered:*)
│  │  - Track areas, types       │   │
│  └─────────────────────────────┘   │
│              │                      │
│              ▼                      │
│  ┌─────────────────────────────┐   │
│  │  Processor                  │   │
│  │  - Evaluate rules           │   │
│  │  - Geofence detection       │   │
│  │  - Change detection         │   │
│  └─────────────────────────────┘   │
│              │                      │
│              ▼                      │
│  ┌─────────────────────────────┐   │
│  │  Notifications              │   │
│  │  - Save to PostgreSQL       │   │──► PostgreSQL
│  │  - Publish to Redis         │   │──► Redis Pub/Sub
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

## Redis Keys

| Key Pattern | Type | Description |
|-------------|------|-------------|
| `discovered:destinations` | Set | Unique AIS destinations |
| `discovered:areas` | Set | Unique area names |
| `discovered:vesselTypes` | Set | Unique vessel types |
| `discovered:vesselClasses` | Set | Unique vessel classes |
| `vessel:{imo}:geofence:{id}` | String | Geofence inside/outside state |
| `vessel:{imo}:destination` | String | Last known destination |
| `notifications` | Pub/Sub | Notification channel |
| `vessel-updates` | Pub/Sub | Vessel update channel |

## Development

```bash
# Type check
pnpm typecheck

# Build
pnpm build
```
