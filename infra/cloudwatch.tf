# CloudWatch Logging and Monitoring Configuration

# ============================================
# Log Groups
# ============================================

resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/${var.project_name}/web"
  retention_in_days = 30

  tags = {
    Name = "${var.project_name}-web-logs"
  }
}

resource "aws_cloudwatch_log_group" "processor" {
  name              = "/ecs/${var.project_name}/processor"
  retention_in_days = 30

  tags = {
    Name = "${var.project_name}-processor-logs"
  }
}

# ============================================
# SNS Topic for Alarms (Optional)
# ============================================

resource "aws_sns_topic" "alerts" {
  name = "${var.project_name}-alerts"

  tags = {
    Name = "${var.project_name}-alerts"
  }
}

# ============================================
# RDS Alarms
# ============================================

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${var.project_name}-rds-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "RDS CPU utilization is above 80%"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.identifier
  }

  tags = {
    Name = "${var.project_name}-rds-cpu-alarm"
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_storage" {
  alarm_name          = "${var.project_name}-rds-storage-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 2147483648  # 2 GB in bytes
  alarm_description   = "RDS free storage is below 2 GB"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.identifier
  }

  tags = {
    Name = "${var.project_name}-rds-storage-alarm"
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "${var.project_name}-rds-connections-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 50  # db.t3.micro has ~60 max connections
  alarm_description   = "RDS connection count is high"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.identifier
  }

  tags = {
    Name = "${var.project_name}-rds-connections-alarm"
  }
}

# ============================================
# ElastiCache Alarms
# ============================================

resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  alarm_name          = "${var.project_name}-redis-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Redis memory usage is above 80%"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    CacheClusterId = aws_elasticache_cluster.main.cluster_id
  }

  tags = {
    Name = "${var.project_name}-redis-memory-alarm"
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "${var.project_name}-redis-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Redis CPU utilization is above 80%"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    CacheClusterId = aws_elasticache_cluster.main.cluster_id
  }

  tags = {
    Name = "${var.project_name}-redis-cpu-alarm"
  }
}

# ============================================
# ECS Service Alarms
# ============================================

resource "aws_cloudwatch_metric_alarm" "ecs_web_cpu" {
  alarm_name          = "${var.project_name}-ecs-web-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 85
  alarm_description   = "ECS Web service CPU is critically high"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.web.name
  }

  tags = {
    Name = "${var.project_name}-ecs-web-cpu-alarm"
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_web_memory" {
  alarm_name          = "${var.project_name}-ecs-web-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 85
  alarm_description   = "ECS Web service memory is critically high"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.web.name
  }

  tags = {
    Name = "${var.project_name}-ecs-web-memory-alarm"
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_processor_cpu" {
  alarm_name          = "${var.project_name}-ecs-processor-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 85
  alarm_description   = "ECS Processor service CPU is critically high"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.processor.name
  }

  tags = {
    Name = "${var.project_name}-ecs-processor-cpu-alarm"
  }
}

# ============================================
# ALB Alarms
# ============================================

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${var.project_name}-alb-5xx-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_ELB_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "ALB is returning too many 5xx errors"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  tags = {
    Name = "${var.project_name}-alb-5xx-alarm"
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_target_5xx" {
  alarm_name          = "${var.project_name}-alb-target-5xx-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "Target group is returning too many 5xx errors"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.web.arn_suffix
  }

  tags = {
    Name = "${var.project_name}-alb-target-5xx-alarm"
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_unhealthy_hosts" {
  alarm_name          = "${var.project_name}-alb-unhealthy-hosts"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Average"
  threshold           = 0
  alarm_description   = "ALB has unhealthy hosts"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.web.arn_suffix
  }

  tags = {
    Name = "${var.project_name}-alb-unhealthy-alarm"
  }
}

# ============================================
# Kafka Consumer Lag Alarm (for processor scaling)
# ============================================

resource "aws_cloudwatch_metric_alarm" "kafka_consumer_lag" {
  alarm_name          = "${var.project_name}-kafka-consumer-lag-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "ConsumerLag"
  namespace           = "Maritime/Kafka"
  period              = 60
  statistic           = "Average"
  threshold           = 5000
  alarm_description   = "Kafka consumer lag is critically high"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    ConsumerGroup = "notification-processor"
  }

  tags = {
    Name = "${var.project_name}-kafka-lag-alarm"
  }
}

# ============================================
# CloudWatch Dashboard
# ============================================

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = var.project_name

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "text"
        x      = 0
        y      = 0
        width  = 24
        height = 1
        properties = {
          markdown = "# ${var.project_name} Dashboard"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 1
        width  = 12
        height = 6
        properties = {
          title  = "ECS Web Service CPU & Memory"
          region = var.aws_region
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", aws_ecs_service.web.name, { label = "CPU %" }],
            [".", "MemoryUtilization", ".", ".", ".", ".", { label = "Memory %" }]
          ]
          period = 60
          stat   = "Average"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 1
        width  = 12
        height = 6
        properties = {
          title  = "ECS Processor Service CPU & Memory"
          region = var.aws_region
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", aws_ecs_service.processor.name, { label = "CPU %" }],
            [".", "MemoryUtilization", ".", ".", ".", ".", { label = "Memory %" }]
          ]
          period = 60
          stat   = "Average"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 7
        width  = 8
        height = 6
        properties = {
          title  = "RDS Performance"
          region = var.aws_region
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.main.identifier, { label = "CPU %" }],
            [".", "DatabaseConnections", ".", ".", { label = "Connections", yAxis = "right" }]
          ]
          period = 60
          stat   = "Average"
        }
      },
      {
        type   = "metric"
        x      = 8
        y      = 7
        width  = 8
        height = 6
        properties = {
          title  = "Redis Performance"
          region = var.aws_region
          metrics = [
            ["AWS/ElastiCache", "CPUUtilization", "CacheClusterId", aws_elasticache_cluster.main.cluster_id, { label = "CPU %" }],
            [".", "DatabaseMemoryUsagePercentage", ".", ".", { label = "Memory %" }]
          ]
          period = 60
          stat   = "Average"
        }
      },
      {
        type   = "metric"
        x      = 16
        y      = 7
        width  = 8
        height = 6
        properties = {
          title  = "Kafka Consumer Lag"
          region = var.aws_region
          metrics = [
            ["Maritime/Kafka", "ConsumerLag", "ConsumerGroup", "notification-processor"]
          ]
          period = 60
          stat   = "Average"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 13
        width  = 12
        height = 6
        properties = {
          title  = "ALB Request Count"
          region = var.aws_region
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.main.arn_suffix]
          ]
          period = 60
          stat   = "Sum"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 13
        width  = 12
        height = 6
        properties = {
          title  = "ALB Response Codes"
          region = var.aws_region
          metrics = [
            ["AWS/ApplicationELB", "HTTPCode_Target_2XX_Count", "LoadBalancer", aws_lb.main.arn_suffix, { label = "2xx", color = "#2ca02c" }],
            [".", "HTTPCode_Target_4XX_Count", ".", ".", { label = "4xx", color = "#ff7f0e" }],
            [".", "HTTPCode_Target_5XX_Count", ".", ".", { label = "5xx", color = "#d62728" }]
          ]
          period = 60
          stat   = "Sum"
        }
      }
    ]
  })
}
