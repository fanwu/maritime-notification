import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  const notification = await prisma.notification.update({
    where: { id },
    data: {
      status: 'read',
      readAt: new Date(),
    },
  });

  return NextResponse.json({
    id: notification.id,
    status: notification.status,
    readAt: notification.readAt?.toISOString(),
  });
}
