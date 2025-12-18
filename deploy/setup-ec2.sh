#!/bin/bash
set -e

# Maritime Notification System - EC2 Setup Script
# Run this on a fresh Ubuntu 22.04 EC2 instance

echo "=== Maritime Notification System - EC2 Setup ==="

# Update system
echo "Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Docker
echo "Installing Docker..."
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add current user to docker group
sudo usermod -aG docker $USER

# Install Git
echo "Installing Git..."
sudo apt-get install -y git

echo "=== Docker installed successfully ==="
echo "Please log out and back in for docker group changes to take effect."
echo ""
echo "Next steps:"
echo "1. Log out and back in"
echo "2. Clone your repository"
echo "3. Create .env file with NEXT_PUBLIC_MAPBOX_TOKEN"
echo "4. Run: docker compose -f docker-compose.prod.yml up -d --build"
echo ""
echo "To include mock data producer:"
echo "docker compose -f docker-compose.prod.yml --profile demo up -d --build"
