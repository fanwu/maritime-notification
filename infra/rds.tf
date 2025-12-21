# RDS PostgreSQL Configuration

# DB Subnet Group using private subnets
resource "aws_db_subnet_group" "main" {
  name        = "${var.project_name}-db-subnet-group"
  description = "Database subnet group for ${var.project_name}"
  subnet_ids  = data.aws_subnets.private.ids

  tags = {
    Name = "${var.project_name}-db-subnet-group"
  }
}

# RDS PostgreSQL Instance
resource "aws_db_instance" "main" {
  identifier = "${var.project_name}-db"

  # Engine
  engine               = "postgres"
  engine_version       = "16.3"
  instance_class       = var.db_instance_class
  allocated_storage    = var.db_allocated_storage
  max_allocated_storage = 100  # Enable storage autoscaling up to 100GB
  storage_type         = "gp3"
  storage_encrypted    = true

  # Database
  db_name  = "notification"
  username = "notification"
  password = var.db_password

  # Network
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  port                   = 5432

  # Backup
  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "Mon:04:00-Mon:05:00"
  copy_tags_to_snapshot  = true

  # Performance Insights (free for db.t3.micro)
  performance_insights_enabled = true
  performance_insights_retention_period = 7

  # Monitoring
  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_monitoring.arn

  # Protection
  deletion_protection = false  # Set to true for production
  skip_final_snapshot = true   # Set to false for production
  final_snapshot_identifier = "${var.project_name}-final-snapshot"

  # Parameter group for PostgreSQL tuning
  parameter_group_name = aws_db_parameter_group.main.name

  tags = {
    Name = "${var.project_name}-db"
  }
}

# PostgreSQL Parameter Group
resource "aws_db_parameter_group" "main" {
  name   = "${var.project_name}-pg16"
  family = "postgres16"

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"  # Log queries taking more than 1 second
  }

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  tags = {
    Name = "${var.project_name}-pg16"
  }
}

# IAM Role for RDS Enhanced Monitoring
resource "aws_iam_role" "rds_monitoring" {
  name = "${var.project_name}-rds-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}
