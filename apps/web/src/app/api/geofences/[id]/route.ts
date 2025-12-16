import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  // Delete associated rules first
  await prisma.clientRule.deleteMany({
    where: { geofenceId: id },
  });

  // Delete the geofence
  await prisma.geofence.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await request.json();

  const geofence = await prisma.geofence.update({
    where: { id },
    data: {
      name: body.name,
      description: body.description,
      coordinates: body.coordinates ? JSON.stringify(body.coordinates) : undefined,
      isActive: body.isActive,
    },
  });

  return NextResponse.json({
    id: geofence.id,
    clientId: geofence.clientId,
    name: geofence.name,
    description: geofence.description,
    geofenceType: geofence.geofenceType,
    coordinates: JSON.parse(geofence.coordinates),
    isActive: geofence.isActive,
  });
}
