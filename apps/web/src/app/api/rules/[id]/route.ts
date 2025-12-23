import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Get a specific rule by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const rule = await prisma.clientRule.findUnique({
    where: { id },
    include: {
      type: true,
      geofence: true,
    },
  });

  if (!rule) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }

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
    geofence: rule.geofence
      ? {
          id: rule.geofence.id,
          name: rule.geofence.name,
        }
      : null,
  });
}

// Update a rule
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  // Check if rule exists
  const existing = await prisma.clientRule.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }

  // Build update data
  const updateData: {
    name?: string;
    condition?: string;
    filters?: string;
    settings?: string;
    isActive?: boolean;
  } = {};

  if (body.name !== undefined) {
    updateData.name = body.name;
  }

  if (body.condition !== undefined) {
    // Validate conditions for dynamic rules
    if (existing.typeId === 'dynamic_rule') {
      if (!body.condition.logic || !body.condition.conditions) {
        return NextResponse.json(
          { error: 'Condition must have logic (AND/OR) and conditions array' },
          { status: 400 }
        );
      }
      for (const cond of body.condition.conditions) {
        if (!cond.id || !cond.field || !cond.operator) {
          return NextResponse.json(
            { error: 'Each condition must have id, field, and operator' },
            { status: 400 }
          );
        }
      }
    }
    updateData.condition = JSON.stringify(body.condition);
  }

  if (body.filters !== undefined) {
    updateData.filters = JSON.stringify(body.filters);
  }

  if (body.settings !== undefined) {
    updateData.settings = JSON.stringify(body.settings);
  }

  if (body.isActive !== undefined) {
    updateData.isActive = body.isActive;
  }

  const rule = await prisma.clientRule.update({
    where: { id },
    data: updateData,
    include: {
      type: true,
      geofence: true,
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
    geofence: rule.geofence
      ? {
          id: rule.geofence.id,
          name: rule.geofence.name,
        }
      : null,
  });
}

// Delete a rule
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Check if rule exists
  const existing = await prisma.clientRule.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }

  // Delete the rule (cascades to RuleState)
  await prisma.clientRule.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
