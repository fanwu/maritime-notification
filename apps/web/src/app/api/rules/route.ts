import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Get all dynamic rules for a client
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId') || 'demo-client';
  const typeId = request.nextUrl.searchParams.get('typeId');

  const where: { clientId: string; typeId?: string; isActive?: boolean } = { clientId };
  if (typeId) {
    where.typeId = typeId;
  }

  const rules = await prisma.clientRule.findMany({
    where,
    include: {
      type: true,
      geofence: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(
    rules.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      typeId: r.typeId,
      name: r.name,
      condition: JSON.parse(r.condition),
      filters: JSON.parse(r.filters),
      settings: JSON.parse(r.settings),
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      type: {
        typeId: r.type.typeId,
        name: r.type.name,
        description: r.type.description,
      },
      geofence: r.geofence
        ? {
            id: r.geofence.id,
            name: r.geofence.name,
          }
        : null,
    }))
  );
}

// Create a new dynamic rule
export async function POST(request: NextRequest) {
  const body = await request.json();

  // Validate required fields
  if (!body.name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  if (!body.condition || !body.condition.logic || !body.condition.conditions) {
    return NextResponse.json(
      { error: 'Condition must have logic (AND/OR) and conditions array' },
      { status: 400 }
    );
  }

  // Validate conditions
  for (const cond of body.condition.conditions) {
    if (!cond.id || !cond.field || !cond.operator) {
      return NextResponse.json(
        { error: 'Each condition must have id, field, and operator' },
        { status: 400 }
      );
    }
  }

  const rule = await prisma.clientRule.create({
    data: {
      clientId: body.clientId || 'demo-client',
      typeId: 'dynamic_rule',
      name: body.name,
      condition: JSON.stringify(body.condition),
      filters: JSON.stringify(body.filters || {}),
      settings: JSON.stringify(body.settings || {}),
      isActive: body.isActive !== false,
    },
    include: {
      type: true,
    },
  });

  return NextResponse.json({
    id: rule.id,
    clientId: rule.clientId,
    typeId: rule.typeId,
    name: rule.name,
    condition: JSON.parse(rule.condition),
    filters: JSON.parse(rule.filters),
    settings: JSON.parse(rule.settings),
    isActive: rule.isActive,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
    type: {
      typeId: rule.type.typeId,
      name: rule.type.name,
      description: rule.type.description,
    },
  });
}
