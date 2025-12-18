#!/bin/bash
set -e

# Maritime Notification System - Deployment Script
# Usage: ./deploy.sh [--with-mock]

WITH_MOCK=""
if [ "$1" == "--with-mock" ]; then
    WITH_MOCK="--profile demo"
fi

echo "=== Maritime Notification System - Deployment ==="

# Check for required files
if [ ! -f ".env" ]; then
    echo "ERROR: .env file not found!"
    echo "Create .env file with at least NEXT_PUBLIC_MAPBOX_TOKEN"
    echo ""
    echo "Example .env:"
    echo "NEXT_PUBLIC_MAPBOX_TOKEN=your-mapbox-token-here"
    echo "NEXT_PUBLIC_APP_URL=http://your-ec2-ip:3000"
    echo "NEXT_PUBLIC_WS_URL=ws://your-ec2-ip:3000"
    exit 1
fi

# Check for Mapbox token
if ! grep -q "NEXT_PUBLIC_MAPBOX_TOKEN" .env; then
    echo "ERROR: NEXT_PUBLIC_MAPBOX_TOKEN not found in .env"
    exit 1
fi

echo "Building and starting services..."

# Build and start
docker compose -f docker-compose.prod.yml $WITH_MOCK up -d --build

echo ""
echo "=== Deployment complete ==="
echo ""

# Wait for services to be ready
echo "Waiting for services to start..."
sleep 10

# Check service status
echo ""
echo "Service status:"
docker compose -f docker-compose.prod.yml ps

echo ""
echo "To view logs: docker compose -f docker-compose.prod.yml logs -f"
echo "To stop: docker compose -f docker-compose.prod.yml down"

# Initialize database
echo ""
echo "Initializing database..."
docker exec maritime-web npx prisma db push --accept-data-loss 2>/dev/null || true
docker exec maritime-web npx tsx prisma/seed.ts 2>/dev/null || echo "Seeding skipped (may already be seeded)"

echo ""
echo "Application running at: http://$(curl -s ifconfig.me):3000"
