#!/bin/bash
set -e

# MSK Provisioned Cluster Setup with Public Access
# 3x kafka.m5.large brokers, 2TB storage, IAM authentication

CLUSTER_NAME="${1:-maritime-kafka}"
REGION="${2:-us-east-1}"

echo "============================================"
echo "AWS MSK Provisioned Setup"
echo "============================================"
echo "Cluster Name: $CLUSTER_NAME"
echo "Region: $REGION"
echo "Broker Type: kafka.m5.large"
echo "Broker Count: 3"
echo "Storage: 2TB per broker"
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI not installed"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "AWS Account: $ACCOUNT_ID"
echo ""

# Get available AZs
echo "Getting available AZs..."
AZS=($(aws ec2 describe-availability-zones --region $REGION --query 'AvailabilityZones[?State==`available`].ZoneName' --output text | head -3 | tr '\t' ' '))
if [ ${#AZS[@]} -lt 3 ]; then
    echo "Error: Need at least 3 AZs, found ${#AZS[@]}"
    exit 1
fi
echo "Using AZs: ${AZS[0]}, ${AZS[1]}, ${AZS[2]}"
echo ""

# Step 1: Create VPC
echo "Step 1: Creating VPC and Subnets..."
VPC_ID=$(aws ec2 create-vpc \
    --cidr-block 10.0.0.0/16 \
    --region $REGION \
    --query 'Vpc.VpcId' \
    --output text)
echo "  Created VPC: $VPC_ID"

aws ec2 create-tags --resources $VPC_ID --tags Key=Name,Value=${CLUSTER_NAME}-vpc --region $REGION
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-hostnames '{"Value":true}' --region $REGION
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-support '{"Value":true}' --region $REGION

# Create 3 public subnets (for NAT gateways and bastion)
PUBLIC_SUBNET_1=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.1.0/24 --availability-zone ${AZS[0]} --region $REGION --query 'Subnet.SubnetId' --output text)
PUBLIC_SUBNET_2=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.2.0/24 --availability-zone ${AZS[1]} --region $REGION --query 'Subnet.SubnetId' --output text)
PUBLIC_SUBNET_3=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.3.0/24 --availability-zone ${AZS[2]} --region $REGION --query 'Subnet.SubnetId' --output text)
echo "  Created Public Subnets: $PUBLIC_SUBNET_1, $PUBLIC_SUBNET_2, $PUBLIC_SUBNET_3"

aws ec2 create-tags --resources $PUBLIC_SUBNET_1 --tags Key=Name,Value=${CLUSTER_NAME}-public-1 --region $REGION
aws ec2 create-tags --resources $PUBLIC_SUBNET_2 --tags Key=Name,Value=${CLUSTER_NAME}-public-2 --region $REGION
aws ec2 create-tags --resources $PUBLIC_SUBNET_3 --tags Key=Name,Value=${CLUSTER_NAME}-public-3 --region $REGION

# Create 3 private subnets (for Kafka brokers)
PRIVATE_SUBNET_1=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.11.0/24 --availability-zone ${AZS[0]} --region $REGION --query 'Subnet.SubnetId' --output text)
PRIVATE_SUBNET_2=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.12.0/24 --availability-zone ${AZS[1]} --region $REGION --query 'Subnet.SubnetId' --output text)
PRIVATE_SUBNET_3=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.13.0/24 --availability-zone ${AZS[2]} --region $REGION --query 'Subnet.SubnetId' --output text)
echo "  Created Private Subnets: $PRIVATE_SUBNET_1, $PRIVATE_SUBNET_2, $PRIVATE_SUBNET_3"

aws ec2 create-tags --resources $PRIVATE_SUBNET_1 --tags Key=Name,Value=${CLUSTER_NAME}-private-1 --region $REGION
aws ec2 create-tags --resources $PRIVATE_SUBNET_2 --tags Key=Name,Value=${CLUSTER_NAME}-private-2 --region $REGION
aws ec2 create-tags --resources $PRIVATE_SUBNET_3 --tags Key=Name,Value=${CLUSTER_NAME}-private-3 --region $REGION

# Step 2: Create Internet Gateway
echo ""
echo "Step 2: Creating Internet Gateway..."
IGW_ID=$(aws ec2 create-internet-gateway --region $REGION --query 'InternetGateway.InternetGatewayId' --output text)
aws ec2 attach-internet-gateway --internet-gateway-id $IGW_ID --vpc-id $VPC_ID --region $REGION
aws ec2 create-tags --resources $IGW_ID --tags Key=Name,Value=${CLUSTER_NAME}-igw --region $REGION
echo "  Created Internet Gateway: $IGW_ID"

# Create public route table
PUBLIC_RTB=$(aws ec2 create-route-table --vpc-id $VPC_ID --region $REGION --query 'RouteTable.RouteTableId' --output text)
aws ec2 create-route --route-table-id $PUBLIC_RTB --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID --region $REGION > /dev/null
aws ec2 associate-route-table --route-table-id $PUBLIC_RTB --subnet-id $PUBLIC_SUBNET_1 --region $REGION > /dev/null
aws ec2 associate-route-table --route-table-id $PUBLIC_RTB --subnet-id $PUBLIC_SUBNET_2 --region $REGION > /dev/null
aws ec2 associate-route-table --route-table-id $PUBLIC_RTB --subnet-id $PUBLIC_SUBNET_3 --region $REGION > /dev/null
aws ec2 create-tags --resources $PUBLIC_RTB --tags Key=Name,Value=${CLUSTER_NAME}-public-rtb --region $REGION
echo "  Created Public Route Table: $PUBLIC_RTB"

# Step 3: Create NAT Gateway (single NAT for cost savings, use 3 for production HA)
echo ""
echo "Step 3: Creating NAT Gateway (this may take 2-3 minutes)..."
EIP_ALLOC=$(aws ec2 allocate-address --domain vpc --region $REGION --query 'AllocationId' --output text)
NAT_GW=$(aws ec2 create-nat-gateway --subnet-id $PUBLIC_SUBNET_1 --allocation-id $EIP_ALLOC --region $REGION --query 'NatGateway.NatGatewayId' --output text)
aws ec2 create-tags --resources $NAT_GW --tags Key=Name,Value=${CLUSTER_NAME}-nat --region $REGION
aws ec2 create-tags --resources $EIP_ALLOC --tags Key=Name,Value=${CLUSTER_NAME}-eip --region $REGION
echo "  Created NAT Gateway: $NAT_GW"
echo "  Waiting for NAT Gateway to become available..."

aws ec2 wait nat-gateway-available --nat-gateway-ids $NAT_GW --region $REGION
echo "  NAT Gateway is available"

# Create private route table
PRIVATE_RTB=$(aws ec2 create-route-table --vpc-id $VPC_ID --region $REGION --query 'RouteTable.RouteTableId' --output text)
aws ec2 create-route --route-table-id $PRIVATE_RTB --destination-cidr-block 0.0.0.0/0 --nat-gateway-id $NAT_GW --region $REGION > /dev/null
aws ec2 associate-route-table --route-table-id $PRIVATE_RTB --subnet-id $PRIVATE_SUBNET_1 --region $REGION > /dev/null
aws ec2 associate-route-table --route-table-id $PRIVATE_RTB --subnet-id $PRIVATE_SUBNET_2 --region $REGION > /dev/null
aws ec2 associate-route-table --route-table-id $PRIVATE_RTB --subnet-id $PRIVATE_SUBNET_3 --region $REGION > /dev/null
aws ec2 create-tags --resources $PRIVATE_RTB --tags Key=Name,Value=${CLUSTER_NAME}-private-rtb --region $REGION
echo "  Created Private Route Table: $PRIVATE_RTB"

# Step 4: Create Security Group
echo ""
echo "Step 4: Creating Security Group..."
SG_ID=$(aws ec2 create-security-group \
    --group-name ${CLUSTER_NAME}-sg \
    --description "Security group for MSK cluster ${CLUSTER_NAME}" \
    --vpc-id $VPC_ID \
    --region $REGION \
    --query 'GroupId' \
    --output text)
echo "  Created Security Group: $SG_ID"

# Allow all traffic within the security group (for broker communication)
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol -1 --source-group $SG_ID --region $REGION > /dev/null

# Allow Kafka ports from anywhere (for public access)
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 9092 --cidr 0.0.0.0/0 --region $REGION > /dev/null  # Plaintext
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 9094 --cidr 0.0.0.0/0 --region $REGION > /dev/null  # TLS
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 9096 --cidr 0.0.0.0/0 --region $REGION > /dev/null  # SASL_SSL
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 9098 --cidr 0.0.0.0/0 --region $REGION > /dev/null  # IAM
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 9196 --cidr 0.0.0.0/0 --region $REGION > /dev/null  # Public IAM
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 443 --cidr 0.0.0.0/0 --region $REGION > /dev/null   # HTTPS
echo "  Configured security group rules"

aws ec2 create-tags --resources $SG_ID --tags Key=Name,Value=${CLUSTER_NAME}-sg --region $REGION

# Step 5: Create MSK Configuration
echo ""
echo "Step 5: Creating MSK Configuration..."
CONFIG_CONTENT=$(echo -e "auto.create.topics.enable=true\ndefault.replication.factor=3\nmin.insync.replicas=2\nnum.partitions=6\nlog.retention.hours=168" | base64)

MSK_CONFIG_ARN=$(aws kafka create-configuration \
    --name "${CLUSTER_NAME}-config" \
    --description "Configuration for ${CLUSTER_NAME}" \
    --kafka-versions "3.6.0" \
    --server-properties "$CONFIG_CONTENT" \
    --region $REGION \
    --query 'Arn' \
    --output text)
echo "  Created MSK Configuration: $MSK_CONFIG_ARN"

MSK_CONFIG_REVISION=$(aws kafka describe-configuration \
    --arn $MSK_CONFIG_ARN \
    --region $REGION \
    --query 'LatestRevision.Revision' \
    --output text)

# Step 6: Create IAM Policy for clients
echo ""
echo "Step 6: Creating IAM Policy for Kafka clients..."
POLICY_DOC=$(cat <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "kafka-cluster:Connect",
                "kafka-cluster:AlterCluster",
                "kafka-cluster:DescribeCluster"
            ],
            "Resource": "arn:aws:kafka:${REGION}:${ACCOUNT_ID}:cluster/${CLUSTER_NAME}/*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "kafka-cluster:*Topic*",
                "kafka-cluster:WriteData",
                "kafka-cluster:ReadData"
            ],
            "Resource": "arn:aws:kafka:${REGION}:${ACCOUNT_ID}:topic/${CLUSTER_NAME}/*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "kafka-cluster:AlterGroup",
                "kafka-cluster:DescribeGroup"
            ],
            "Resource": "arn:aws:kafka:${REGION}:${ACCOUNT_ID}:group/${CLUSTER_NAME}/*"
        }
    ]
}
EOF
)

POLICY_ARN=$(aws iam create-policy \
    --policy-name ${CLUSTER_NAME}-client-policy \
    --policy-document "$POLICY_DOC" \
    --query 'Policy.Arn' \
    --output text 2>/dev/null || \
    echo "arn:aws:iam::${ACCOUNT_ID}:policy/${CLUSTER_NAME}-client-policy")
echo "  Policy ARN: $POLICY_ARN"

# Step 7: Create MSK Cluster
echo ""
echo "Step 7: Creating MSK Provisioned Cluster..."
echo "  This will take 15-30 minutes..."

CLUSTER_CONFIG=$(cat <<EOF
{
    "BrokerNodeGroupInfo": {
        "BrokerAZDistribution": "DEFAULT",
        "InstanceType": "kafka.m5.large",
        "ClientSubnets": [
            "${PUBLIC_SUBNET_1}",
            "${PUBLIC_SUBNET_2}",
            "${PUBLIC_SUBNET_3}"
        ],
        "SecurityGroups": ["${SG_ID}"],
        "StorageInfo": {
            "EbsStorageInfo": {
                "VolumeSize": 2000
            }
        }
    },
    "ClusterName": "${CLUSTER_NAME}",
    "KafkaVersion": "3.6.0",
    "NumberOfBrokerNodes": 3,
    "EncryptionInfo": {
        "EncryptionInTransit": {
            "ClientBroker": "TLS",
            "InCluster": true
        }
    },
    "ClientAuthentication": {
        "Sasl": {
            "Iam": {
                "Enabled": true
            }
        },
        "Unauthenticated": {
            "Enabled": false
        }
    },
    "ConfigurationInfo": {
        "Arn": "${MSK_CONFIG_ARN}",
        "Revision": ${MSK_CONFIG_REVISION}
    },
    "LoggingInfo": {
        "BrokerLogs": {
            "CloudWatchLogs": {
                "Enabled": false
            },
            "Firehose": {
                "Enabled": false
            },
            "S3": {
                "Enabled": false
            }
        }
    },
    "Tags": {
        "Name": "${CLUSTER_NAME}",
        "Environment": "production"
    }
}
EOF
)

# Write config to file for debugging
echo "$CLUSTER_CONFIG" > /tmp/msk-cluster-config.json
echo "  Cluster config written to /tmp/msk-cluster-config.json"

CLUSTER_ARN=$(aws kafka create-cluster \
    --cli-input-json file:///tmp/msk-cluster-config.json \
    --region $REGION \
    --query 'ClusterArn' \
    --output text)

echo "  Cluster ARN: $CLUSTER_ARN"
echo ""
echo "  Waiting for cluster to be ACTIVE (this may take 15-30 minutes)..."

while true; do
    STATUS=$(aws kafka describe-cluster --cluster-arn $CLUSTER_ARN --region $REGION --query 'ClusterInfo.State' --output text)
    echo "    Current status: $STATUS"
    if [ "$STATUS" = "ACTIVE" ]; then
        break
    elif [ "$STATUS" = "FAILED" ]; then
        echo "Error: Cluster creation failed"
        exit 1
    fi
    sleep 60
done

echo ""
echo "  Cluster is ACTIVE!"

# Step 8: Enable Public Access
echo ""
echo "Step 8: Enabling Public Access..."
echo "  This requires updating connectivity settings..."

# Get current cluster version for update
CLUSTER_VERSION=$(aws kafka describe-cluster --cluster-arn $CLUSTER_ARN --region $REGION --query 'ClusterInfo.CurrentVersion' --output text)

aws kafka update-connectivity \
    --cluster-arn $CLUSTER_ARN \
    --current-version $CLUSTER_VERSION \
    --connectivity-info '{"PublicAccess":{"Type":"SERVICE_PROVIDED_EIPS"}}' \
    --region $REGION > /dev/null

echo "  Public access update initiated"
echo "  Waiting for cluster to be ACTIVE again (5-10 minutes)..."

while true; do
    STATUS=$(aws kafka describe-cluster --cluster-arn $CLUSTER_ARN --region $REGION --query 'ClusterInfo.State' --output text)
    echo "    Current status: $STATUS"
    if [ "$STATUS" = "ACTIVE" ]; then
        break
    fi
    sleep 30
done

echo "  Public access enabled!"

# Step 9: Get Bootstrap Servers
echo ""
echo "Step 9: Getting Bootstrap Servers..."
BOOTSTRAP_PRIVATE=$(aws kafka get-bootstrap-brokers --cluster-arn $CLUSTER_ARN --region $REGION --query 'BootstrapBrokerStringSaslIam' --output text)
BOOTSTRAP_PUBLIC=$(aws kafka get-bootstrap-brokers --cluster-arn $CLUSTER_ARN --region $REGION --query 'BootstrapBrokerStringPublicSaslIam' --output text)

echo "  Private Bootstrap Servers: $BOOTSTRAP_PRIVATE"
echo "  Public Bootstrap Servers: $BOOTSTRAP_PUBLIC"

# Save configuration
CONFIG_FILE="msk-config-${CLUSTER_NAME}.env"
cat > $CONFIG_FILE <<EOF
# MSK Provisioned Cluster Configuration
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

CLUSTER_NAME=${CLUSTER_NAME}
CLUSTER_ARN=${CLUSTER_ARN}
KAFKA_VERSION=3.6.0
BROKER_TYPE=kafka.m5.large
BROKER_COUNT=3
STORAGE_GB=2000

# Bootstrap Servers
BOOTSTRAP_SERVERS_PRIVATE=${BOOTSTRAP_PRIVATE}
BOOTSTRAP_SERVERS_PUBLIC=${BOOTSTRAP_PUBLIC}

# Network
REGION=${REGION}
VPC_ID=${VPC_ID}
PUBLIC_SUBNET_1=${PUBLIC_SUBNET_1}
PUBLIC_SUBNET_2=${PUBLIC_SUBNET_2}
PUBLIC_SUBNET_3=${PUBLIC_SUBNET_3}
PRIVATE_SUBNET_1=${PRIVATE_SUBNET_1}
PRIVATE_SUBNET_2=${PRIVATE_SUBNET_2}
PRIVATE_SUBNET_3=${PRIVATE_SUBNET_3}
SECURITY_GROUP=${SG_ID}
NAT_GATEWAY=${NAT_GW}
INTERNET_GATEWAY=${IGW_ID}
EIP_ALLOCATION=${EIP_ALLOC}

# IAM
IAM_POLICY_ARN=${POLICY_ARN}
MSK_CONFIG_ARN=${MSK_CONFIG_ARN}

# Route Tables
PUBLIC_ROUTE_TABLE=${PUBLIC_RTB}
PRIVATE_ROUTE_TABLE=${PRIVATE_RTB}
EOF

echo ""
echo "============================================"
echo "MSK Provisioned Cluster Setup Complete!"
echo "============================================"
echo ""
echo "Configuration saved to: $CONFIG_FILE"
echo ""
echo "Public Bootstrap Servers (use from internet):"
echo "  $BOOTSTRAP_PUBLIC"
echo ""
echo "Private Bootstrap Servers (use from VPC):"
echo "  $BOOTSTRAP_PRIVATE"
echo ""
echo "To test the cluster, run:"
echo "  ./test-msk-producer.sh"
echo ""
echo "To clean up all resources, run:"
echo "  ./cleanup-msk-provisioned.sh"
echo ""
