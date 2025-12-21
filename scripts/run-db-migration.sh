#!/bin/bash
# Run Prisma database migration on RDS

aws ecs run-task \
  --cluster maritime-notification \
  --task-definition maritime-notification-web \
  --launch-type FARGATE \
  --network-configuration 'awsvpcConfiguration={subnets=[subnet-022d08fb0d169f9c1],securityGroups=[sg-072c87c001273e3f5],assignPublicIp=DISABLED}' \
  --overrides '{"containerOverrides":[{"name":"web","command":["npx","prisma","db","push"]}]}' \
  --region us-east-1

echo ""
echo "Migration task started. Monitor with:"
echo "  aws logs tail /ecs/maritime-notification/web --follow"
