#!/bin/bash
# Deploy to AWS ECS
# Usage: ./scripts/deploy-aws.sh [web|processor|all]

set -e

# Configuration
AWS_REGION="us-east-1"
AWS_ACCOUNT_ID="719651972941"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ECS_CLUSTER="maritime-notification"

# Image names
WEB_IMAGE="maritime-notification-web"
PROCESSOR_IMAGE="maritime-notification-processor"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Get project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Parse arguments
TARGET="${1:-all}"

if [[ "$TARGET" != "web" && "$TARGET" != "processor" && "$TARGET" != "all" ]]; then
    echo "Usage: $0 [web|processor|all]"
    echo "  web       - Deploy web application only"
    echo "  processor - Deploy processor only"
    echo "  all       - Deploy both (default)"
    exit 1
fi

# Step 1: Login to ECR
log "Logging in to ECR..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}

# Step 2: Build and push images
deploy_web() {
    log "Building web application..."

    # Load NEXT_PUBLIC_* variables from .env file for build-time
    if [ -f .env ]; then
        export $(grep "^NEXT_PUBLIC_" .env | xargs)
    fi

    docker build \
        --build-arg NEXT_PUBLIC_MAPBOX_TOKEN="${NEXT_PUBLIC_MAPBOX_TOKEN}" \
        -t ${WEB_IMAGE} -f apps/web/Dockerfile .

    log "Tagging web image..."
    docker tag ${WEB_IMAGE}:latest ${ECR_REGISTRY}/${WEB_IMAGE}:latest

    log "Pushing web image to ECR..."
    docker push ${ECR_REGISTRY}/${WEB_IMAGE}:latest

    log "Forcing ECS web service deployment..."
    aws ecs update-service \
        --cluster ${ECS_CLUSTER} \
        --service ${ECS_CLUSTER}-web \
        --force-new-deployment \
        --region ${AWS_REGION} \
        --no-cli-pager
}

deploy_processor() {
    log "Building processor..."
    docker build -t ${PROCESSOR_IMAGE} -f packages/vessel-processor/Dockerfile .

    log "Tagging processor image..."
    docker tag ${PROCESSOR_IMAGE}:latest ${ECR_REGISTRY}/${PROCESSOR_IMAGE}:latest

    log "Pushing processor image to ECR..."
    docker push ${ECR_REGISTRY}/${PROCESSOR_IMAGE}:latest

    log "Forcing ECS processor service deployment..."
    aws ecs update-service \
        --cluster ${ECS_CLUSTER} \
        --service ${ECS_CLUSTER}-processor \
        --force-new-deployment \
        --region ${AWS_REGION} \
        --no-cli-pager
}

case "$TARGET" in
    web)
        deploy_web
        ;;
    processor)
        deploy_processor
        ;;
    all)
        deploy_web
        deploy_processor
        ;;
esac

log "Deployment initiated!"
echo ""
echo "Monitor deployment:"
echo "  aws logs tail /ecs/maritime-notification/web --follow"
echo "  aws logs tail /ecs/maritime-notification/processor --follow"
echo ""
echo "Application URL:"
echo "  http://maritime-notification-alb-1066105827.us-east-1.elb.amazonaws.com"
echo ""
echo "CloudWatch Dashboard:"
echo "  https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=maritime-notification"
