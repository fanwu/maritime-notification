# Input variables for Maritime Notification Infrastructure

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (e.g., production, staging)"
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "maritime-notification"
}

# MSK Configuration
variable "msk_bootstrap_servers" {
  description = "MSK broker endpoints (private)"
  type        = string
  default     = "b-2.maritimekafka.wgye9s.c5.kafka.us-east-1.amazonaws.com:9098,b-1.maritimekafka.wgye9s.c5.kafka.us-east-1.amazonaws.com:9098,b-3.maritimekafka.wgye9s.c5.kafka.us-east-1.amazonaws.com:9098"
}

variable "kafka_topic" {
  description = "Kafka topic for vessel state changes"
  type        = string
  default     = "vessel.state.changed"
}

# Database Configuration
variable "db_password" {
  description = "PostgreSQL database password"
  type        = string
  sensitive   = true
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 20
}

# Redis Configuration
variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.micro"
}

# ECS Configuration
variable "web_cpu" {
  description = "CPU units for web service (256 = 0.25 vCPU)"
  type        = number
  default     = 256
}

variable "web_memory" {
  description = "Memory for web service in MB"
  type        = number
  default     = 512
}

variable "web_desired_count" {
  description = "Desired number of web tasks"
  type        = number
  default     = 2
}

variable "processor_cpu" {
  description = "CPU units for processor service (512 = 0.5 vCPU)"
  type        = number
  default     = 512
}

variable "processor_memory" {
  description = "Memory for processor service in MB"
  type        = number
  default     = 1024
}

variable "processor_desired_count" {
  description = "Desired number of processor tasks"
  type        = number
  default     = 1
}

# Auto Scaling Configuration
variable "web_min_count" {
  description = "Minimum number of web tasks"
  type        = number
  default     = 2
}

variable "web_max_count" {
  description = "Maximum number of web tasks"
  type        = number
  default     = 4
}

variable "processor_min_count" {
  description = "Minimum number of processor tasks"
  type        = number
  default     = 1
}

variable "processor_max_count" {
  description = "Maximum number of processor tasks"
  type        = number
  default     = 3
}

# Application Configuration
variable "mapbox_token" {
  description = "Mapbox API token for map display"
  type        = string
  sensitive   = true
}

# VPC Configuration (references existing MSK VPC)
variable "vpc_name" {
  description = "Name tag of existing VPC created by MSK setup"
  type        = string
  default     = "maritime-kafka-vpc"
}

variable "msk_security_group_name" {
  description = "Name tag of existing MSK security group"
  type        = string
  default     = "maritime-kafka-sg"
}
