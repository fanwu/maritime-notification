# Secrets Manager Configuration

# Database Password Secret
resource "aws_secretsmanager_secret" "db_password" {
  name        = "${var.project_name}/db-password"
  description = "PostgreSQL database password for ${var.project_name}"

  tags = {
    Name = "${var.project_name}-db-password"
  }
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = var.db_password
}

# Mapbox Token Secret
resource "aws_secretsmanager_secret" "mapbox_token" {
  name        = "${var.project_name}/mapbox-token"
  description = "Mapbox API token for ${var.project_name}"

  tags = {
    Name = "${var.project_name}-mapbox-token"
  }
}

resource "aws_secretsmanager_secret_version" "mapbox_token" {
  secret_id     = aws_secretsmanager_secret.mapbox_token.id
  secret_string = var.mapbox_token
}

# ============================================
# SSM Parameters for Processor Configuration
# ============================================

resource "aws_ssm_parameter" "kafka_reset" {
  name        = "/${var.project_name}/processor/kafka-reset"
  description = "Reset consumer offsets and start from beginning (true/false)"
  type        = "String"
  value       = "false"

  tags = {
    Name = "${var.project_name}-kafka-reset"
  }
}
