#!/bin/bash
# Run processor one-time task from beginning of Kafka topic

aws ecs run-task \
  --cluster maritime-notification \
  --task-definition maritime-notification-processor \
  --launch-type FARGATE \
  --network-configuration 'awsvpcConfiguration={subnets=[subnet-022d08fb0d169f9c1],securityGroups=[sg-0f5acd5e3f8d5ed1a],assignPublicIp=DISABLED}' \
  --overrides '{"containerOverrides":[{"name":"processor","environment":[{"name":"KAFKA_FROM_BEGINNING","value":"true"},{"name":"KAFKA_TOPIC","value":"vessel.state.changed"}]}]}' \
  --region us-east-1

echo ""
echo "Task started. Monitor with:"
echo "  aws logs tail /ecs/maritime-notification/processor --follow"
