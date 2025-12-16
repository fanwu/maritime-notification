import { NextResponse } from 'next/server';
import { getConsumer, TOPICS } from '@/lib/kafka';
import { processVesselState } from '@/lib/rules-engine';
import type { VesselState } from '@/types';

let isConsuming = false;

export async function POST() {
  if (isConsuming) {
    return NextResponse.json({ message: 'Already consuming' });
  }

  try {
    isConsuming = true;
    const consumer = await getConsumer('notification-processor');

    await consumer.subscribe({ topic: TOPICS.VESSEL_STATE_CHANGED, fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ message }) => {
        try {
          if (message.value) {
            const vessel: VesselState = JSON.parse(message.value.toString());
            await processVesselState(vessel);
          }
        } catch (error) {
          console.error('Error processing message:', error);
        }
      },
    });

    return NextResponse.json({ message: 'Consumer started' });
  } catch (error) {
    isConsuming = false;
    console.error('Failed to start consumer:', error);
    return NextResponse.json({ error: 'Failed to start consumer' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ isConsuming });
}
