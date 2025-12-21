# VPC Configuration - Import existing MSK VPC and create new security groups

# Reference existing VPC created by MSK setup script
data "aws_vpc" "main" {
  filter {
    name   = "tag:Name"
    values = [var.vpc_name]
  }
}

# Get public subnets (for ALB)
data "aws_subnets" "public" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.main.id]
  }

  filter {
    name   = "tag:Name"
    values = ["maritime-kafka-public-*"]
  }
}

# Get private subnets (for ECS, RDS, Redis)
data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.main.id]
  }

  filter {
    name   = "tag:Name"
    values = ["maritime-kafka-private-*"]
  }
}

# Reference existing MSK security group
data "aws_security_group" "msk" {
  filter {
    name   = "tag:Name"
    values = [var.msk_security_group_name]
  }

  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.main.id]
  }
}

# Security Group for ALB
resource "aws_security_group" "alb" {
  name        = "${var.project_name}-alb-sg"
  description = "Security group for Application Load Balancer"
  vpc_id      = data.aws_vpc.main.id

  ingress {
    description = "HTTP from internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-alb-sg"
  }
}

# Security Group for ECS Web Service
resource "aws_security_group" "ecs_web" {
  name        = "${var.project_name}-ecs-web-sg"
  description = "Security group for ECS web service"
  vpc_id      = data.aws_vpc.main.id

  ingress {
    description     = "HTTP from ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-ecs-web-sg"
  }
}

# Security Group for ECS Processor Service
resource "aws_security_group" "ecs_processor" {
  name        = "${var.project_name}-ecs-processor-sg"
  description = "Security group for ECS processor service"
  vpc_id      = data.aws_vpc.main.id

  # No inbound rules - processor only makes outbound connections

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-ecs-processor-sg"
  }
}

# Security Group for RDS PostgreSQL
resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = data.aws_vpc.main.id

  ingress {
    description     = "PostgreSQL from ECS web"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_web.id]
  }

  ingress {
    description     = "PostgreSQL from ECS processor"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_processor.id]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-rds-sg"
  }
}

# Security Group for ElastiCache Redis
resource "aws_security_group" "redis" {
  name        = "${var.project_name}-redis-sg"
  description = "Security group for ElastiCache Redis"
  vpc_id      = data.aws_vpc.main.id

  ingress {
    description     = "Redis from ECS web"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_web.id]
  }

  ingress {
    description     = "Redis from ECS processor"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_processor.id]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-redis-sg"
  }
}

# Add rule to MSK security group to allow ECS processor access
resource "aws_security_group_rule" "msk_from_processor" {
  type                     = "ingress"
  from_port                = 9098
  to_port                  = 9098
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.ecs_processor.id
  security_group_id        = data.aws_security_group.msk.id
  description              = "Kafka IAM from ECS processor"
}
