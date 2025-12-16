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
   pnpm --filter web db:seed
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
│  Mock Producer  │────▶│      Kafka      │────▶│   Next.js App   │
│  (Vessel Data)  │     │    (KRaft)      │     │  + Socket.io    │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
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
│   └── mock-producer/       # Simulated vessel data
└── docker-compose.yml       # Kafka setup
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox API token | Required |
| `KAFKA_BROKERS` | Kafka broker addresses | `localhost:29092` |
| `DATABASE_URL` | SQLite database path | `file:./dev.db` |

## Demo Scenarios

1. **Geofence Alert**: Draw a geofence around Singapore Strait, watch vessels enter/exit
2. **Destination Change**: Vessels randomly change destinations, triggering alerts
3. **Real-time Tracking**: See vessel positions update every 5 seconds

## AWS Deployment

See `DESIGN.md` section 17 for AWS deployment instructions.

## License

MIT
