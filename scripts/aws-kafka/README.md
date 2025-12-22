# AWS MSK Provisioned Setup

Scripts to create and manage an AWS MSK (Managed Streaming for Apache Kafka) Provisioned cluster with **public internet access**.

## Cluster Specifications

| Component | Value |
|-----------|-------|
| Broker Type | kafka.m5.large |
| Broker Count | 3 (one per AZ) |
| Storage | 2 TB per broker (6 TB total) |
| Kafka Version | 3.6.0 |
| Authentication | IAM (SASL_SSL) |
| Public Access | Enabled |

## Estimated Monthly Cost

| Item | Cost |
|------|------|
| 3× kafka.m5.large ($0.21/hr) | ~$460 |
| 6 TB storage ($0.10/GB) | ~$600 |
| NAT Gateway ($0.045/hr + data) | ~$35 |
| **Total** | **~$1,100/month** |

> Note: Data transfer costs may add to this depending on usage.

## Prerequisites

1. AWS CLI installed and configured
2. IAM user with permissions:
   - `kafka:*` (MSK management)
   - `ec2:*` (VPC, subnets, security groups)
   - `iam:CreatePolicy`, `iam:DeletePolicy`

## Usage

### 1. Setup Cluster

```bash
cd scripts/aws-kafka
chmod +x *.sh

# Create cluster (takes 15-30 minutes)
./setup-msk-provisioned.sh

# Or with custom name and region
./setup-msk-provisioned.sh my-cluster us-west-2
```

This creates:
- VPC with 3 public + 3 private subnets
- Internet Gateway + NAT Gateway
- Security group with Kafka ports open
- MSK Configuration
- MSK Provisioned cluster with public access
- IAM policy for client authentication

### 2. Test Cluster

```bash
./test-msk-producer.sh
```

This will:
- Download Kafka CLI tools
- Download AWS MSK IAM Auth library
- Create `vessel.state.changed` topic
- Send and receive test messages

### 3. Cleanup

```bash
./cleanup-msk-provisioned.sh
```

Deletes all resources (cluster, VPC, subnets, NAT, IAM policy, etc.)

## Configuration Output

After setup, a config file `msk-config-maritime-kafka.env` is created:

```bash
# Load configuration
source msk-config-maritime-kafka.env

# Public endpoint (use from internet)
echo $BOOTSTRAP_SERVERS_PUBLIC

# Private endpoint (use from within VPC)
echo $BOOTSTRAP_SERVERS_PRIVATE
```

## Using with Node.js

### Install Dependencies

```bash
npm install kafkajs @aws-sdk/credential-providers
```

### Producer Example

```typescript
import { Kafka } from 'kafkajs';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

const kafka = new Kafka({
  clientId: 'maritime-producer',
  brokers: process.env.KAFKA_BROKERS!.split(','),
  ssl: true,
  sasl: {
    mechanism: 'aws',
    authorizationIdentity: process.env.AWS_ACCOUNT_ID!,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  },
});

const producer = kafka.producer();
await producer.connect();

await producer.send({
  topic: 'vessel.state.changed',
  messages: [
    { key: '9876543', value: JSON.stringify({ IMO: 9876543, ... }) },
  ],
});
```

### Using with aws-msk-iam-sasl-signer

For automatic credential handling:

```bash
npm install @aws-sdk/client-kafka-node
```

```typescript
import { Kafka } from 'kafkajs';
import { generateAuthToken } from 'aws-msk-iam-sasl-signer-js';

const kafka = new Kafka({
  clientId: 'maritime-consumer',
  brokers: process.env.KAFKA_BROKERS!.split(','),
  ssl: true,
  sasl: {
    mechanism: 'oauthbearer',
    oauthBearerProvider: async () => {
      const token = await generateAuthToken({
        region: 'us-east-1',
      });
      return {
        value: token.token,
      };
    },
  },
});
```

## Ports

| Port | Protocol | Use |
|------|----------|-----|
| 9094 | TLS | Private TLS access |
| 9098 | SASL_SSL | Private IAM access |
| 9198 | SASL_SSL | **Public IAM access** |

## Node.js Test Scripts

Ready-to-run producer and consumer test scripts using LatestVesselState format.

### Setup

```bash
cd scripts/aws-kafka
npm install
```

### Run Producer (sends test vessel messages)

```bash
npm run producer
```

Output:
```
MSK Producer Test
=================
Brokers: b-1-public.maritimekafka...
Connected to MSK!

[2024-12-18T03:00:00.000Z] Publishing vessel updates...
  Sent 3 messages (total: 3)
  >>> Pacific Voyager changing destination: SINGAPORE -> ROTTERDAM
```

### Run Consumer (receives messages)

```bash
npm run consumer
```

Output:
```
MSK Consumer Test
=================
Connected to MSK!
Subscribed to topic: vessel.state.changed

[2024-12-18T03:00:00.000Z] Message #1
  IMO: 9876543
  Vessel: Pacific Voyager
  Position: 1.2644, 103.8198
  Speed: 12.5 knots
  Destination: SINGAPORE
```

### Test in Two Terminals

1. **Terminal 1** - Start consumer:
   ```bash
   npm run consumer
   ```

2. **Terminal 2** - Start producer:
   ```bash
   npm run producer
   ```

The consumer will display messages as the producer sends them.

### LatestVesselState Message Format

```json
{
  "LatestVesselStateId": "9876543.1702864800000",
  "GroupId": 1,
  "IMO": 9876543,
  "VesselName": "Pacific Voyager",
  "VesselClass": "Capesize",
  "VesselType": "Bulk Carrier",
  "Latitude": 1.2644,
  "Longitude": 103.8198,
  "Speed": 12.5,
  "Heading": 245,
  "Course": 243,
  "Draught": 12.3,
  "VesselStatus": "Voyage",
  "VesselVoyageStatus": "Sailing",
  "AISDestination": "SINGAPORE",
  "AISDestinationETA": "2024-12-25T10:30:00.000Z",
  "AreaName": "Singapore Strait",
  "LastMovementDateTimeUTC": "2024-12-18T03:00:00.000Z",
  "ModifiedOn": "2024-12-18T03:00:00.000Z"
}
```

## Troubleshooting

### "DNS resolution failed"
- You're trying to use private bootstrap servers from outside VPC
- Use `BOOTSTRAP_SERVERS_PUBLIC` instead

### "Access Denied" when creating cluster
- Your IAM user needs `kafka:CreateCluster` permission
- Attach `AmazonMSKFullAccess` managed policy

### "Failed to authenticate"
- Check AWS credentials are configured: `aws sts get-caller-identity`
- Ensure IAM policy allows `kafka-cluster:Connect`

### Connection timeout
- Check security group allows inbound on port 9198
- Verify public access is enabled on cluster
- Test connectivity: `nc -zv <broker-host> 9198`

## Architecture

```
Internet
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ VPC (10.0.0.0/16)                                           │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Public      │  │ Public      │  │ Public      │         │
│  │ Subnet 1    │  │ Subnet 2    │  │ Subnet 3    │         │
│  │ 10.0.1.0/24 │  │ 10.0.2.0/24 │  │ 10.0.3.0/24 │         │
│  │             │  │             │  │             │         │
│  │  [NAT GW]   │  │             │  │             │         │
│  └──────┬──────┘  └─────────────┘  └─────────────┘         │
│         │                                                   │
│  ┌──────▼──────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Private     │  │ Private     │  │ Private     │         │
│  │ Subnet 1    │  │ Subnet 2    │  │ Subnet 3    │         │
│  │ 10.0.11.0/24│  │ 10.0.12.0/24│  │ 10.0.13.0/24│         │
│  │             │  │             │  │             │         │
│  │ [Broker 1]  │  │ [Broker 2]  │  │ [Broker 3]  │         │
│  │ m5.large    │  │ m5.large    │  │ m5.large    │         │
│  │ 2TB EBS     │  │ 2TB EBS     │  │ 2TB EBS     │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  Public Access: SERVICE_PROVIDED_EIPS                       │
│  Authentication: IAM (SASL_SSL)                             │
│  Port 9198 (public), Port 9098 (private)                    │
└─────────────────────────────────────────────────────────────┘
```
