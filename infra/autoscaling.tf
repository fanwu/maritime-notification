# ECS Auto Scaling Configuration

# ============================================
# Web Service Auto Scaling
# ============================================

resource "aws_appautoscaling_target" "web" {
  max_capacity       = var.web_max_count
  min_capacity       = var.web_min_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.web.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# Scale based on CPU utilization
resource "aws_appautoscaling_policy" "web_cpu" {
  name               = "${var.project_name}-web-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.web.resource_id
  scalable_dimension = aws_appautoscaling_target.web.scalable_dimension
  service_namespace  = aws_appautoscaling_target.web.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300  # 5 minutes
    scale_out_cooldown = 60   # 1 minute
  }
}

# Scale based on memory utilization
resource "aws_appautoscaling_policy" "web_memory" {
  name               = "${var.project_name}-web-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.web.resource_id
  scalable_dimension = aws_appautoscaling_target.web.scalable_dimension
  service_namespace  = aws_appautoscaling_target.web.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 75.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Scale based on ALB request count per target
resource "aws_appautoscaling_policy" "web_requests" {
  name               = "${var.project_name}-web-requests-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.web.resource_id
  scalable_dimension = aws_appautoscaling_target.web.scalable_dimension
  service_namespace  = aws_appautoscaling_target.web.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${aws_lb.main.arn_suffix}/${aws_lb_target_group.web.arn_suffix}"
    }
    target_value       = 1000.0  # Scale when > 1000 requests per target per minute
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# ============================================
# Processor Service Auto Scaling
# ============================================

resource "aws_appautoscaling_target" "processor" {
  max_capacity       = var.processor_max_count
  min_capacity       = var.processor_min_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.processor.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# Scale based on CPU utilization
resource "aws_appautoscaling_policy" "processor_cpu" {
  name               = "${var.project_name}-processor-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.processor.resource_id
  scalable_dimension = aws_appautoscaling_target.processor.scalable_dimension
  service_namespace  = aws_appautoscaling_target.processor.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 600  # 10 minutes (more conservative for Kafka consumers)
    scale_out_cooldown = 120  # 2 minutes
  }
}

# Scale based on Kafka consumer lag (custom metric)
# Note: Requires the processor service to publish ConsumerLag metric to CloudWatch
resource "aws_appautoscaling_policy" "processor_kafka_lag" {
  name               = "${var.project_name}-processor-kafka-lag-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.processor.resource_id
  scalable_dimension = aws_appautoscaling_target.processor.scalable_dimension
  service_namespace  = aws_appautoscaling_target.processor.service_namespace

  target_tracking_scaling_policy_configuration {
    customized_metric_specification {
      metric_name = "ConsumerLag"
      namespace   = "Maritime/Kafka"
      statistic   = "Average"

      dimensions {
        name  = "ConsumerGroup"
        value = "notification-processor"
      }
    }
    target_value       = 1000.0  # Scale up when lag > 1000 messages
    scale_in_cooldown  = 600     # 10 minutes (conservative scale-in)
    scale_out_cooldown = 120     # 2 minutes
  }
}

# ============================================
# Scheduled Scaling (Optional - for predictable patterns)
# ============================================

# Scale up during business hours (example - uncomment if needed)
# resource "aws_appautoscaling_scheduled_action" "web_scale_up" {
#   name               = "${var.project_name}-web-scale-up-weekday"
#   service_namespace  = aws_appautoscaling_target.web.service_namespace
#   resource_id        = aws_appautoscaling_target.web.resource_id
#   scalable_dimension = aws_appautoscaling_target.web.scalable_dimension
#   schedule           = "cron(0 8 ? * MON-FRI *)"  # 8 AM UTC, Mon-Fri
#
#   scalable_target_action {
#     min_capacity = 3
#     max_capacity = var.web_max_count
#   }
# }

# Scale down during off-hours (example - uncomment if needed)
# resource "aws_appautoscaling_scheduled_action" "web_scale_down" {
#   name               = "${var.project_name}-web-scale-down-night"
#   service_namespace  = aws_appautoscaling_target.web.service_namespace
#   resource_id        = aws_appautoscaling_target.web.resource_id
#   scalable_dimension = aws_appautoscaling_target.web.scalable_dimension
#   schedule           = "cron(0 22 ? * * *)"  # 10 PM UTC, every day
#
#   scalable_target_action {
#     min_capacity = var.web_min_count
#     max_capacity = var.web_max_count
#   }
# }
