import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId') || 'demo-client';

  const geofences = await prisma.geofence.findMany({
    where: { clientId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(
    geofences.map((g) => ({
      id: g.id,
      clientId: g.clientId,
      name: g.name,
      description: g.description,
      geofenceType: g.geofenceType,
      coordinates: JSON.parse(g.coordinates),
      centerLat: g.centerLat,
      centerLng: g.centerLng,
      radiusKm: g.radiusKm,
      isActive: g.isActive,
    }))
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const geofence = await prisma.geofence.create({
    data: {
      clientId: body.clientId || 'demo-client',
      name: body.name,
      description: body.description,
      geofenceType: body.geofenceType,
      coordinates: JSON.stringify(body.coordinates),
      centerLat: body.centerLat,
      centerLng: body.centerLng,
      radiusKm: body.radiusKm,
    },
  });

  // Create a rule for this geofence
  await prisma.clientRule.create({
    data: {
      clientId: body.clientId || 'demo-client',
      typeId: 'geofence_alert',
      name: `${body.name} Alert`,
      condition: JSON.stringify({
        geofenceId: geofence.id,
        triggerOn: body.triggerOn || 'both',
      }),
      geofenceId: geofence.id,
      isActive: true,
    },
  });

  return NextResponse.json({
    id: geofence.id,
    clientId: geofence.clientId,
    name: geofence.name,
    description: geofence.description,
    geofenceType: geofence.geofenceType,
    coordinates: JSON.parse(geofence.coordinates),
    centerLat: geofence.centerLat,
    centerLng: geofence.centerLng,
    radiusKm: geofence.radiusKm,
    isActive: geofence.isActive,
  });
}
