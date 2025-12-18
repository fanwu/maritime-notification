# AWS EC2 Deployment Guide

## Prerequisites

- AWS account with EC2 access
- Mapbox API token (get one at https://mapbox.com)
- SSH access to EC2 instance

## Quick Start

### 1. Launch EC2 Instance

Launch an Ubuntu 22.04 EC2 instance with:
- Instance type: t3.medium or larger (Kafka needs ~2GB RAM)
- Storage: 20GB minimum
- Security group: Open ports 22 (SSH), 3000 (web app), 8080 (Kafka UI - optional)

### 2. Setup EC2 Instance

SSH into your instance and run the setup script:

```bash
# Download and run setup script
curl -fsSL https://raw.githubusercontent.com/YOUR_REPO/main/deploy/setup-ec2.sh | bash

# Log out and back in for docker group changes
exit
# SSH back in
```

### 3. Clone and Configure

```bash
# Clone the repository
git clone https://github.com/YOUR_REPO/maritime-notification.git
cd maritime-notification

# Create environment file
cp .env.production.example .env

# Edit .env with your values
nano .env
```

Required environment variables:
```
NEXT_PUBLIC_MAPBOX_TOKEN=your-mapbox-token
NEXT_PUBLIC_APP_URL=http://YOUR_EC2_PUBLIC_IP:3000
NEXT_PUBLIC_WS_URL=ws://YOUR_EC2_PUBLIC_IP:3000
```

### 4. Deploy

```bash
# Production deployment (no mock data)
./deploy/deploy.sh

# With mock vessel data producer
./deploy/deploy.sh --with-mock
```

## Manual Deployment

If you prefer manual steps:

```bash
# Build and start services
docker compose -f docker-compose.prod.yml up -d --build

# With mock producer
docker compose -f docker-compose.prod.yml --profile demo up -d --build

# Initialize database
docker exec maritime-web npx prisma db push
docker exec maritime-web npx prisma db seed
```

## Operations

### View logs
```bash
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.prod.yml logs -f kafka
```

### Stop services
```bash
docker compose -f docker-compose.prod.yml down
```

### Restart services
```bash
docker compose -f docker-compose.prod.yml restart
```

### Access Kafka UI
Open `http://YOUR_EC2_IP:8080` in browser (if port 8080 is open in security group)

### Database operations
```bash
# View database
docker exec -it maritime-web npx prisma studio

# Reset database
docker exec maritime-web npx prisma db push --force-reset
docker exec maritime-web npx prisma db seed
```

## Architecture

```
                                 ┌─────────────────┐
                                 │   EC2 Instance  │
                                 │                 │
┌─────────────┐                  │  ┌───────────┐  │
│ Mock        │──────Kafka───────│▶ │   Web     │  │◀──── Browser
│ Producer    │  (port 9092)     │  │ (port 3000│  │
└─────────────┘                  │  └───────────┘  │
                                 │        │        │
                                 │        ▼        │
                                 │  ┌───────────┐  │
                                 │  │  SQLite   │  │
                                 │  └───────────┘  │
                                 └─────────────────┘
```

## Troubleshooting

### Container won't start
```bash
# Check logs
docker compose -f docker-compose.prod.yml logs web

# Common issues:
# - Missing NEXT_PUBLIC_MAPBOX_TOKEN
# - Kafka not healthy yet (wait 30 seconds)
```

### No notifications
```bash
# Check Kafka is receiving messages
docker exec kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic vessel.state.changed \
  --from-beginning

# Check web app is connected to Kafka
docker compose -f docker-compose.prod.yml logs -f web | grep Kafka
```

### Vessels not showing on map
- Verify Mapbox token is correct
- Check browser console for errors
- Verify vessels are on water (Singapore Strait area)

## Resource Requirements

| Component | CPU | Memory |
|-----------|-----|--------|
| Kafka | 0.5 | 1.5GB |
| Web | 0.5 | 512MB |
| Mock Producer | 0.1 | 128MB |

Minimum recommended: t3.medium (2 vCPU, 4GB RAM)
