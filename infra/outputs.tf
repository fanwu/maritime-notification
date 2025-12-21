# Terraform Outputs

# ============================================
# Application Access
# ============================================

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "application_url" {
  description = "URL to access the application"
  value       = "http://${aws_lb.main.dns_name}"
}

# ============================================
# Database
# ============================================

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = aws_db_instance.main.endpoint
}

output "rds_database_name" {
  description = "RDS database name"
  value       = aws_db_instance.main.db_name
}

output "rds_username" {
  description = "RDS master username"
  value       = aws_db_instance.main.username
}

# ============================================
# Redis
# ============================================

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = aws_elasticache_cluster.main.cache_nodes[0].address
}

output "redis_port" {
  description = "ElastiCache Redis port"
  value       = aws_elasticache_cluster.main.cache_nodes[0].port
}

# ============================================
# ECR Repositories
# ============================================

output "ecr_web_repository_url" {
  description = "ECR repository URL for web application"
  value       = aws_ecr_repository.web.repository_url
}

output "ecr_processor_repository_url" {
  description = "ECR repository URL for processor"
  value       = aws_ecr_repository.processor.repository_url
}

# ============================================
# ECS
# ============================================

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = aws_ecs_cluster.main.arn
}

output "ecs_web_service_name" {
  description = "Name of the ECS web service"
  value       = aws_ecs_service.web.name
}

output "ecs_processor_service_name" {
  description = "Name of the ECS processor service"
  value       = aws_ecs_service.processor.name
}

# ============================================
# Networking
# ============================================

output "vpc_id" {
  description = "VPC ID"
  value       = data.aws_vpc.main.id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = data.aws_subnets.private.ids
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = data.aws_subnets.public.ids
}

# ============================================
# Security Groups
# ============================================

output "security_group_alb_id" {
  description = "Security group ID for ALB"
  value       = aws_security_group.alb.id
}

output "security_group_ecs_web_id" {
  description = "Security group ID for ECS web tasks"
  value       = aws_security_group.ecs_web.id
}

output "security_group_ecs_processor_id" {
  description = "Security group ID for ECS processor tasks"
  value       = aws_security_group.ecs_processor.id
}

# ============================================
# Secrets
# ============================================

output "secrets_db_password_arn" {
  description = "ARN of the database password secret"
  value       = aws_secretsmanager_secret.db_password.arn
}

output "secrets_db_url_arn" {
  description = "ARN of the database URL secret"
  value       = aws_secretsmanager_secret.db_url.arn
}

output "secrets_mapbox_token_arn" {
  description = "ARN of the Mapbox token secret"
  value       = aws_secretsmanager_secret.mapbox_token.arn
}

# ============================================
# CloudWatch
# ============================================

output "cloudwatch_log_group_web" {
  description = "CloudWatch log group for web service"
  value       = aws_cloudwatch_log_group.web.name
}

output "cloudwatch_log_group_processor" {
  description = "CloudWatch log group for processor service"
  value       = aws_cloudwatch_log_group.processor.name
}

output "cloudwatch_dashboard_url" {
  description = "URL to the CloudWatch dashboard"
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${var.project_name}"
}

output "sns_alerts_topic_arn" {
  description = "ARN of the SNS topic for alerts"
  value       = aws_sns_topic.alerts.arn
}

# ============================================
# Useful Commands
# ============================================

output "docker_login_command" {
  description = "Command to authenticate Docker with ECR"
  value       = "aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
}

output "ecs_web_logs_command" {
  description = "Command to tail web service logs"
  value       = "aws logs tail ${aws_cloudwatch_log_group.web.name} --follow"
}

output "ecs_processor_logs_command" {
  description = "Command to tail processor service logs"
  value       = "aws logs tail ${aws_cloudwatch_log_group.processor.name} --follow"
}
