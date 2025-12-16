export const config = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  wsUrl: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000',
  kafkaBrokers: (process.env.KAFKA_BROKERS || 'localhost:29092').split(','),
  mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '',
  clientId: 'demo-client', // For MVP, single client
};
