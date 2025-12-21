# ElastiCache Redis Configuration

# ElastiCache Subnet Group using private subnets
resource "aws_elasticache_subnet_group" "main" {
  name        = "${var.project_name}-redis-subnet-group"
  description = "Redis subnet group for ${var.project_name}"
  subnet_ids  = data.aws_subnets.private.ids

  tags = {
    Name = "${var.project_name}-redis-subnet-group"
  }
}

# ElastiCache Redis Cluster
resource "aws_elasticache_cluster" "main" {
  cluster_id = "${var.project_name}-redis"

  # Engine
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.main.name

  # Network
  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  # Maintenance
  maintenance_window = "sun:05:00-sun:06:00"

  # Backup
  snapshot_retention_limit = 1
  snapshot_window          = "02:00-03:00"

  # Notifications (optional - requires SNS topic)
  # notification_topic_arn = aws_sns_topic.alerts.arn

  tags = {
    Name = "${var.project_name}-redis"
  }
}

# Redis Parameter Group
resource "aws_elasticache_parameter_group" "main" {
  name   = "${var.project_name}-redis7"
  family = "redis7"

  # Optimize for pub/sub and caching use case
  parameter {
    name  = "maxmemory-policy"
    value = "volatile-lru"
  }

  parameter {
    name  = "notify-keyspace-events"
    value = "Ex"  # Enable expired key notifications
  }

  tags = {
    Name = "${var.project_name}-redis7"
  }
}
