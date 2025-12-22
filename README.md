# Maritime Notification System

Real-time vessel tracking and notification system for Signal Ocean.

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Docker and Docker Compose
- Mapbox account (for map display)

### Setup

1. **Clone and install dependencies**
   ```bash
   git clone https://github.com/fanwu/maritime-notification.git
   cd maritime-notification
   pnpm install
   ```

2. **Start Kafka**
   ```bash
   docker compose up -d
   ```

3. **Configure environment**
   ```bash
   cp apps/web/.env.example apps/web/.env
   # Edit .env and add your Mapbox token
   ```

4. **Initialize database**
   ```bash
   pnpm db:push
   pnpm db:seed
   ```

5. **Start the application**
   ```bash
   # Terminal 1: Start the web app
   pnpm dev

   # Terminal 2: Start the mock data producer
   pnpm mock:start
   ```

6. **Open the app**
   - Web UI: http://localhost:3000
   - Kafka UI: http://localhost:8080

## Features

- **Real-time vessel tracking** on interactive map
- **Geofencing** - Draw polygons to define alert zones
- **Instant notifications** when vessels enter/exit geofences
- **Extensible rule system** - Add new notification types without code changes
- **Kafka-powered** message processing

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Mock Producer  │────▶│      Kafka      │────▶│Vessel Processor │
│  (Vessel Data)  │     │    (KRaft)      │     │ (Rule Engine)   │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                        ┌─────────────────┐              │
                        │     Redis       │◀─────────────┤
                        │  (Cache/PubSub) │              │
                        └────────┬────────┘              │
                                 │                       │
                                 ▼                       ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │   Next.js App   │────▶│   PostgreSQL    │
                        │  + Socket.io    │     │  (Persistence)  │
                        └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │   Web Browser   │
                        │   (Mapbox GL)   │
                        └─────────────────┘
```

## Project Structure

```
maritime-notification/
├── apps/
│   └── web/                 # Next.js application
│       ├── src/
│       │   ├── app/         # App router pages & API routes
│       │   ├── components/  # React components
│       │   ├── lib/         # Utilities (Kafka, Prisma, etc.)
│       │   └── types/       # TypeScript types
│       └── prisma/          # Database schema
├── packages/
│   ├── mock-producer/       # Simulated vessel data
│   └── vessel-processor/    # Kafka consumer & rule evaluation
└── docker-compose.yml       # Kafka, Redis, PostgreSQL
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox API token | Required |
| `KAFKA_BROKERS` | Kafka broker addresses | `localhost:29092` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://...` |
| `REDIS_HOST` | Redis server host | `localhost` |
| `REDIS_PORT` | Redis server port | `6379` |

## Demo Scenarios

1. **Geofence Alert**: Draw a geofence around Singapore Strait, watch vessels enter/exit
2. **Destination Change**: Vessels randomly change destinations, triggering alerts
3. **Real-time Tracking**: See vessel positions update every 5 seconds

## Reset Everything

If you need to start fresh, here's how to reset all data:

### Quick Reset (All-in-One)

```bash
# Stop all running services first (Ctrl+C in terminals running dev servers)

# 1. Clear Redis (vessel positions, destinations, discovered values, geofence states)
pnpm redis:clear

# 2. Reset PostgreSQL (drop all tables, recreate schema, seed data)
pnpm db:push -- --force-reset
pnpm db:seed

# 3. Restart services
pnpm dev                        # Terminal 1: Web server
pnpm dev:processor -- --reset   # Terminal 2: Vessel processor (from beginning of Kafka topic)
```

### Step-by-Step Reset

#### Reset Redis Only
```bash
# Clear current Redis database
pnpm redis:clear

# Or clear ALL Redis databases (if using multiple)
docker exec redis redis-cli FLUSHALL

# Or clear specific data:
docker exec redis redis-cli DEL vessels:positions                    # Vessel positions
docker exec redis redis-cli KEYS "vessel:*" | xargs docker exec -i redis redis-cli DEL  # Vessel states
docker exec redis redis-cli KEYS "discovered:*" | xargs docker exec -i redis redis-cli DEL  # Discovered values
```

#### Reset PostgreSQL Only
```bash
# Push schema and reset data
pnpm db:push -- --force-reset
pnpm db:seed
```

#### Reset Kafka Consumer Offset
```bash
# Start processor from beginning of topic (reprocess all messages)
pnpm dev:processor -- --reset

# Or just start from beginning without clearing Redis state
pnpm dev:processor -- --from-beginning
```

### Verify Reset

```bash
# Check Redis is empty
docker exec redis redis-cli DBSIZE
# Should return: (integer) 0

# Check PostgreSQL tables exist and are seeded
docker exec postgres psql -U notification -d notification -c 'SELECT COUNT(*) FROM "NotificationType";'
# Should return: 5 (the seeded notification types)

docker exec postgres psql -U notification -d notification -c 'SELECT COUNT(*) FROM "Notification";'
# Should return: 0 (no notifications yet)
```

### Database Commands Reference

```bash
# Push schema to database
pnpm db:push

# Seed database with initial data
pnpm db:seed

# Open Prisma Studio (GUI for database)
pnpm db:studio
```

## AWS Deployment

See `DESIGN.md` section 17 for AWS deployment instructions.

## License

MIT
