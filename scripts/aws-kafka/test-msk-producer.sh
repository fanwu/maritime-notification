#!/bin/bash
set -e

# Test MSK Provisioned Cluster with Public Access

CLUSTER_NAME="${1:-maritime-kafka}"
CONFIG_FILE="msk-config-${CLUSTER_NAME}.env"

echo "============================================"
echo "MSK Provisioned Producer Test"
echo "============================================"

# Load configuration
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: Config file $CONFIG_FILE not found"
    echo "Run setup-msk-provisioned.sh first"
    exit 1
fi

source $CONFIG_FILE

echo "Cluster: $CLUSTER_NAME"
echo "Public Bootstrap: $BOOTSTRAP_SERVERS_PUBLIC"
echo "Region: $REGION"
echo ""

# Check if bootstrap servers exist
if [ -z "$BOOTSTRAP_SERVERS_PUBLIC" ] || [ "$BOOTSTRAP_SERVERS_PUBLIC" = "None" ]; then
    echo "Error: Public bootstrap servers not available"
    echo "Make sure public access is enabled on your cluster"
    exit 1
fi

# Step 1: Download Kafka CLI tools
KAFKA_VERSION="3.6.0"
KAFKA_DIR="kafka_2.13-${KAFKA_VERSION}"

echo "Step 1: Downloading Kafka CLI tools..."
if [ ! -d "$KAFKA_DIR" ]; then
    curl -sL "https://archive.apache.org/dist/kafka/${KAFKA_VERSION}/kafka_2.13-${KAFKA_VERSION}.tgz" | tar xz
    echo "  Downloaded Kafka ${KAFKA_VERSION}"
else
    echo "  Kafka CLI already downloaded"
fi

# Step 2: Download AWS MSK IAM Auth library
echo ""
echo "Step 2: Downloading AWS MSK IAM Auth library..."
IAM_AUTH_JAR="aws-msk-iam-auth-2.0.3-all.jar"
if [ ! -f "$IAM_AUTH_JAR" ]; then
    curl -sL "https://github.com/aws/aws-msk-iam-auth/releases/download/v2.0.3/${IAM_AUTH_JAR}" -o "$IAM_AUTH_JAR"
    echo "  Downloaded IAM Auth library"
else
    echo "  IAM Auth library already downloaded"
fi

# Copy JAR to Kafka libs
cp "$IAM_AUTH_JAR" "$KAFKA_DIR/libs/"

# Step 3: Create client configuration
echo ""
echo "Step 3: Creating client configuration..."
cat > client.properties <<EOF
security.protocol=SASL_SSL
sasl.mechanism=AWS_MSK_IAM
sasl.jaas.config=software.amazon.msk.auth.iam.IAMLoginModule required;
sasl.client.callback.handler.class=software.amazon.msk.auth.iam.IAMClientCallbackHandler
EOF
echo "  Created client.properties"

# Step 4: Create topic
echo ""
echo "Step 4: Creating topic 'vessel.state.changed'..."
$KAFKA_DIR/bin/kafka-topics.sh \
    --bootstrap-server "$BOOTSTRAP_SERVERS_PUBLIC" \
    --command-config client.properties \
    --create \
    --topic vessel.state.changed \
    --partitions 6 \
    --replication-factor 3 \
    --if-not-exists 2>/dev/null || echo "  Topic may already exist (OK)"

# Step 5: List topics
echo ""
echo "Step 5: Listing topics..."
$KAFKA_DIR/bin/kafka-topics.sh \
    --bootstrap-server "$BOOTSTRAP_SERVERS_PUBLIC" \
    --command-config client.properties \
    --list

# Step 6: Produce test message
echo ""
echo "Step 6: Producing test message..."
TEST_MESSAGE=$(cat <<EOF
{
  "LatestVesselStateId": "9876543.1",
  "IMO": 9876543,
  "VesselName": "Test Vessel",
  "Latitude": 1.2644,
  "Longitude": 103.8198,
  "Speed": 12.5,
  "Heading": 245,
  "AISDestination": "SINGAPORE",
  "ModifiedOn": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
)

echo "$TEST_MESSAGE" | $KAFKA_DIR/bin/kafka-console-producer.sh \
    --bootstrap-server "$BOOTSTRAP_SERVERS_PUBLIC" \
    --producer.config client.properties \
    --topic vessel.state.changed

echo "  Message sent!"

# Step 7: Consume messages
echo ""
echo "Step 7: Consuming messages (timeout 10s)..."
timeout 10 $KAFKA_DIR/bin/kafka-console-consumer.sh \
    --bootstrap-server "$BOOTSTRAP_SERVERS_PUBLIC" \
    --consumer.config client.properties \
    --topic vessel.state.changed \
    --from-beginning \
    --max-messages 5 2>/dev/null || true

echo ""
echo "============================================"
echo "Test Complete!"
echo "============================================"
echo ""
echo "Your MSK cluster is working with public access."
echo ""
echo "To use in your application, set:"
echo "  KAFKA_BROKERS=$BOOTSTRAP_SERVERS_PUBLIC"
echo ""
echo "For Node.js with kafkajs and IAM auth, install:"
echo "  npm install kafkajs @aws-sdk/client-kafka @aws-sdk/credential-providers"
echo ""
