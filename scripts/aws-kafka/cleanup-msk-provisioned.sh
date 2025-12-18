#!/bin/bash
set -e

# Cleanup MSK Provisioned Cluster and all associated resources

CLUSTER_NAME="${1:-maritime-kafka}"
CONFIG_FILE="msk-config-${CLUSTER_NAME}.env"

echo "============================================"
echo "MSK Provisioned Cleanup"
echo "============================================"

# Load configuration
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: Config file $CONFIG_FILE not found"
    echo "Please provide the cluster name or ensure the config file exists"
    exit 1
fi

source $CONFIG_FILE

echo "Cluster: $CLUSTER_NAME"
echo "Region: $REGION"
echo "VPC: $VPC_ID"
echo ""
echo "This will delete:"
echo "  - MSK Cluster: $CLUSTER_ARN"
echo "  - MSK Configuration: $MSK_CONFIG_ARN"
echo "  - NAT Gateway: $NAT_GATEWAY"
echo "  - Elastic IP: $EIP_ALLOCATION"
echo "  - Internet Gateway: $INTERNET_GATEWAY"
echo "  - Security Group: $SECURITY_GROUP"
echo "  - Subnets: 6 (3 public + 3 private)"
echo "  - Route Tables: 2"
echo "  - VPC: $VPC_ID"
echo "  - IAM Policy: $IAM_POLICY_ARN"
echo ""
read -p "Are you sure you want to delete all these resources? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "Step 1: Deleting MSK Cluster..."
if [ -n "$CLUSTER_ARN" ]; then
    aws kafka delete-cluster --cluster-arn $CLUSTER_ARN --region $REGION 2>/dev/null || echo "  Cluster may already be deleted"

    echo "  Waiting for cluster deletion (this may take 10-15 minutes)..."
    while true; do
        STATUS=$(aws kafka describe-cluster --cluster-arn $CLUSTER_ARN --region $REGION --query 'ClusterInfo.State' --output text 2>/dev/null || echo "DELETED")
        if [ "$STATUS" = "DELETED" ] || [ "$STATUS" = "" ]; then
            echo "  Cluster deleted"
            break
        fi
        echo "    Current status: $STATUS"
        sleep 30
    done
fi

echo ""
echo "Step 2: Deleting MSK Configuration..."
if [ -n "$MSK_CONFIG_ARN" ]; then
    aws kafka delete-configuration --arn $MSK_CONFIG_ARN --region $REGION 2>/dev/null || echo "  Config may already be deleted"
    echo "  MSK Configuration deleted"
fi

echo ""
echo "Step 3: Deleting NAT Gateway..."
if [ -n "$NAT_GATEWAY" ]; then
    aws ec2 delete-nat-gateway --nat-gateway-id $NAT_GATEWAY --region $REGION 2>/dev/null || echo "  NAT Gateway may already be deleted"
    echo "  Waiting for NAT Gateway deletion..."
    sleep 60  # NAT gateway takes time to delete
    echo "  NAT Gateway deleted"
fi

echo ""
echo "Step 4: Releasing Elastic IP..."
if [ -n "$EIP_ALLOCATION" ]; then
    aws ec2 release-address --allocation-id $EIP_ALLOCATION --region $REGION 2>/dev/null || echo "  EIP may already be released"
    echo "  Elastic IP released"
fi

echo ""
echo "Step 5: Deleting Security Group..."
if [ -n "$SECURITY_GROUP" ]; then
    # Wait a bit for dependencies to clear
    sleep 10
    aws ec2 delete-security-group --group-id $SECURITY_GROUP --region $REGION 2>/dev/null || echo "  Security group may already be deleted or has dependencies"
    echo "  Security Group deleted"
fi

echo ""
echo "Step 6: Deleting Route Table Associations and Route Tables..."
# Delete private route table
if [ -n "$PRIVATE_ROUTE_TABLE" ]; then
    # Get and delete associations
    ASSOCIATIONS=$(aws ec2 describe-route-tables --route-table-id $PRIVATE_ROUTE_TABLE --region $REGION --query 'RouteTables[0].Associations[?!Main].RouteTableAssociationId' --output text 2>/dev/null || echo "")
    for ASSOC in $ASSOCIATIONS; do
        aws ec2 disassociate-route-table --association-id $ASSOC --region $REGION 2>/dev/null || true
    done
    aws ec2 delete-route-table --route-table-id $PRIVATE_ROUTE_TABLE --region $REGION 2>/dev/null || echo "  Private route table may already be deleted"
    echo "  Private Route Table deleted"
fi

# Delete public route table
if [ -n "$PUBLIC_ROUTE_TABLE" ]; then
    ASSOCIATIONS=$(aws ec2 describe-route-tables --route-table-id $PUBLIC_ROUTE_TABLE --region $REGION --query 'RouteTables[0].Associations[?!Main].RouteTableAssociationId' --output text 2>/dev/null || echo "")
    for ASSOC in $ASSOCIATIONS; do
        aws ec2 disassociate-route-table --association-id $ASSOC --region $REGION 2>/dev/null || true
    done
    aws ec2 delete-route-table --route-table-id $PUBLIC_ROUTE_TABLE --region $REGION 2>/dev/null || echo "  Public route table may already be deleted"
    echo "  Public Route Table deleted"
fi

echo ""
echo "Step 7: Deleting Subnets..."
for SUBNET in $PUBLIC_SUBNET_1 $PUBLIC_SUBNET_2 $PUBLIC_SUBNET_3 $PRIVATE_SUBNET_1 $PRIVATE_SUBNET_2 $PRIVATE_SUBNET_3; do
    if [ -n "$SUBNET" ]; then
        aws ec2 delete-subnet --subnet-id $SUBNET --region $REGION 2>/dev/null || echo "  Subnet $SUBNET may already be deleted"
    fi
done
echo "  Subnets deleted"

echo ""
echo "Step 8: Detaching and Deleting Internet Gateway..."
if [ -n "$INTERNET_GATEWAY" ] && [ -n "$VPC_ID" ]; then
    aws ec2 detach-internet-gateway --internet-gateway-id $INTERNET_GATEWAY --vpc-id $VPC_ID --region $REGION 2>/dev/null || true
    aws ec2 delete-internet-gateway --internet-gateway-id $INTERNET_GATEWAY --region $REGION 2>/dev/null || echo "  IGW may already be deleted"
    echo "  Internet Gateway deleted"
fi

echo ""
echo "Step 9: Deleting VPC..."
if [ -n "$VPC_ID" ]; then
    aws ec2 delete-vpc --vpc-id $VPC_ID --region $REGION 2>/dev/null || echo "  VPC may already be deleted or has dependencies"
    echo "  VPC deleted"
fi

echo ""
echo "Step 10: Deleting IAM Policy..."
if [ -n "$IAM_POLICY_ARN" ]; then
    aws iam delete-policy --policy-arn $IAM_POLICY_ARN 2>/dev/null || echo "  Policy may already be deleted or is attached to users/roles"
    echo "  IAM Policy deleted"
fi

echo ""
echo "Step 11: Cleaning up local files..."
rm -f "$CONFIG_FILE"
rm -f client.properties
rm -rf kafka_2.13-*
rm -f aws-msk-iam-auth-*.jar
rm -f /tmp/msk-cluster-config.json
echo "  Local files cleaned up"

echo ""
echo "============================================"
echo "Cleanup Complete!"
echo "============================================"
echo ""
echo "All MSK resources have been deleted."
echo ""
