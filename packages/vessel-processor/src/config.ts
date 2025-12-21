// Configuration for vessel-processor service

// Default MSK public endpoints
const DEFAULT_MSK_BROKERS = [
  'b-1-public.maritimekafka.wgye9s.c5.kafka.us-east-1.amazonaws.com:9198',
  'b-2-public.maritimekafka.wgye9s.c5.kafka.us-east-1.amazonaws.com:9198',
  'b-3-public.maritimekafka.wgye9s.c5.kafka.us-east-1.amazonaws.com:9198',
].join(',');

export const config = {
  // Kafka / MSK configuration
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || DEFAULT_MSK_BROKERS).split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'vessel-processor',
    groupId: process.env.KAFKA_GROUP_ID || 'notification-processor',
    topic: process.env.KAFKA_TOPIC || 'vessel.state.changed',
    // MSK IAM authentication - enabled by default for remote MSK
    useMskIam: process.env.USE_MSK_IAM !== 'false',
    awsRegion: process.env.AWS_REGION || 'us-east-1',
  },

  // PostgreSQL configuration
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'notification',
    user: process.env.POSTGRES_USER || 'notification',
    password: process.env.POSTGRES_PASSWORD || 'notification',
    // Connection pool settings
    maxConnections: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || '10', 10),
    // SSL - auto-detect: disabled for localhost, enabled for remote (AWS RDS)
    // Can be overridden with POSTGRES_SSL=true or POSTGRES_SSL=false
    ssl: process.env.POSTGRES_SSL === 'true' ? true
      : process.env.POSTGRES_SSL === 'false' ? false
      : (process.env.POSTGRES_HOST || 'localhost') !== 'localhost',
  },

  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    // Channel names
    notificationChannel: 'notifications',
    vesselUpdateChannel: 'vessel-updates',
    discoveryStatsChannel: 'discovery-stats',
  },

  // Processing settings
  processing: {
    // Batch size for Kafka consumer
    batchSize: parseInt(process.env.BATCH_SIZE || '100', 10),
    // How long to keep vessel state in Redis (seconds)
    vesselStateTtl: parseInt(process.env.VESSEL_STATE_TTL || '3600', 10),
    // How long to cache geofences (seconds)
    geofenceCacheTtl: parseInt(process.env.GEOFENCE_CACHE_TTL || '60', 10),
    // Notification expiry (days)
    notificationExpiryDays: parseInt(process.env.NOTIFICATION_EXPIRY_DAYS || '7', 10),
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
};

export function printConfig(): void {
  console.log('Vessel Processor Configuration');
  console.log('==============================');
  console.log(`Kafka Brokers: ${config.kafka.brokers.join(', ')}`);
  console.log(`Kafka Topic: ${config.kafka.topic}`);
  console.log(`Kafka Group ID: ${config.kafka.groupId}`);
  console.log(`MSK IAM Auth: ${config.kafka.useMskIam}`);
  console.log(`PostgreSQL: ${config.postgres.host}:${config.postgres.port}/${config.postgres.database} (SSL: ${config.postgres.ssl})`);
  console.log(`Redis: ${config.redis.host}:${config.redis.port}`);
  console.log('');
}
