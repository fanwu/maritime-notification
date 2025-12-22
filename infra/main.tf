# Maritime Notification System - AWS Infrastructure
# Terraform configuration for ECS, RDS, ElastiCache, ALB

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment to use S3 backend for state storage
  # backend "s3" {
  #   bucket         = "maritime-terraform-state"
  #   key            = "notification/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "maritime-terraform-locks"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "maritime-notification"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Get current AWS account ID
data "aws_caller_identity" "current" {}

# Get current region
data "aws_region" "current" {}
