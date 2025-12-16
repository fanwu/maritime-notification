import { Kafka, Producer, Consumer, logLevel } from 'kafkajs';
import { config } from './config';

const kafka = new Kafka({
  clientId: 'maritime-notification',
  brokers: config.kafkaBrokers,
  logLevel: logLevel.ERROR,
});

let producer: Producer | null = null;
let consumer: Consumer | null = null;

export async function getProducer(): Promise<Producer> {
  if (!producer) {
    producer = kafka.producer();
    await producer.connect();
    console.log('Kafka producer connected');
  }
  return producer;
}

export async function getConsumer(groupId: string): Promise<Consumer> {
  if (!consumer) {
    consumer = kafka.consumer({ groupId });
    await consumer.connect();
    console.log('Kafka consumer connected');
  }
  return consumer;
}

export async function publishVesselState(vessel: unknown): Promise<void> {
  const prod = await getProducer();
  await prod.send({
    topic: 'vessel.state.changed',
    messages: [
      {
        key: String((vessel as { IMO: number }).IMO),
        value: JSON.stringify(vessel),
      },
    ],
  });
}

export const TOPICS = {
  VESSEL_STATE_CHANGED: 'vessel.state.changed',
  NOTIFICATIONS: 'notifications',
};

export { kafka };
