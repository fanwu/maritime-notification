import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId') || 'demo-client';
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');
  const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0');

  const notifications = await prisma.notification.findMany({
    where: {
      clientId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });

  return NextResponse.json(
    notifications.map((n) => ({
      id: n.id,
      clientId: n.clientId,
      ruleId: n.ruleId,
      typeId: n.typeId,
      title: n.title,
      message: n.message,
      payload: JSON.parse(n.payload),
      priority: n.priority,
      status: n.status,
      createdAt: n.createdAt.toISOString(),
    }))
  );
}
