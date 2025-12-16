import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/preferences?clientId=xxx
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId') || 'demo-client';

  // Find existing rules for this client
  const rules = await prisma.clientRule.findMany({
    where: { clientId },
  });

  // Parse preferences from rules
  const destinationChangeRule = rules.find((r) => r.typeId === 'destination_change');
  const geofenceAlertRule = rules.find((r) => r.typeId === 'geofence_alert');

  const preferences = {
    destinationChange: {
      enabled: destinationChangeRule?.isActive ?? true,
      fromDestinations: [] as string[],
      toDestinations: [] as string[],
    },
    geofenceAlert: {
      enabled: geofenceAlertRule?.isActive ?? true,
      geofenceIds: [] as string[],
    },
  };

  if (destinationChangeRule) {
    try {
      const condition = JSON.parse(destinationChangeRule.condition);
      preferences.destinationChange.fromDestinations = condition.from || [];
      preferences.destinationChange.toDestinations = condition.to || [];
    } catch (e) {
      // Invalid JSON, use defaults
    }
  }

  if (geofenceAlertRule) {
    try {
      const condition = JSON.parse(geofenceAlertRule.condition);
      preferences.geofenceAlert.geofenceIds = condition.geofenceIds || [];
    } catch (e) {
      // Invalid JSON, use defaults
    }
  }

  return NextResponse.json(preferences);
}

// PUT /api/preferences
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { clientId, destinationChange, geofenceAlert } = body;

  // Upsert destination change rule
  if (destinationChange) {
    const existingRule = await prisma.clientRule.findFirst({
      where: { clientId, typeId: 'destination_change' },
    });

    const condition = JSON.stringify({
      field: 'AISDestination',
      from: destinationChange.fromDestinations || [],
      to: destinationChange.toDestinations || [],
    });

    if (existingRule) {
      await prisma.clientRule.update({
        where: { id: existingRule.id },
        data: {
          condition,
          isActive: destinationChange.enabled,
          updatedAt: new Date(),
        },
      });
    } else {
      // Need to ensure notification type exists first
      const notificationType = await prisma.notificationType.findUnique({
        where: { typeId: 'destination_change' },
      });

      if (!notificationType) {
        // Create the notification type if it doesn't exist
        await prisma.notificationType.create({
          data: {
            typeId: 'destination_change',
            name: 'Destination Change Alert',
            dataSource: 'vessel.state',
            conditionSchema: JSON.stringify({
              evaluator: 'change',
              parameters: {
                type: 'object',
                properties: {
                  field: { enum: ['AISDestination'] },
                  from: { type: 'array', items: { type: 'string' } },
                  to: { type: 'array', items: { type: 'string' } },
                },
              },
            }),
            defaultTemplate: JSON.stringify({
              title: 'Destination Changed: {{vesselName}}',
              message: '{{vesselName}} destination changed from "{{previousValue}}" to "{{currentValue}}"',
            }),
            stateTracking: JSON.stringify({ enabled: true, transitionEvents: ['change'] }),
          },
        });
      }

      await prisma.clientRule.create({
        data: {
          clientId,
          typeId: 'destination_change',
          name: 'Destination Change Preferences',
          condition,
          isActive: destinationChange.enabled,
        },
      });
    }
  }

  // Upsert geofence alert rule
  if (geofenceAlert !== undefined) {
    const existingRule = await prisma.clientRule.findFirst({
      where: { clientId, typeId: 'geofence_alert' },
    });

    const condition = JSON.stringify({
      geofenceIds: geofenceAlert.geofenceIds || [],
    });

    if (existingRule) {
      await prisma.clientRule.update({
        where: { id: existingRule.id },
        data: {
          condition,
          isActive: geofenceAlert.enabled,
          updatedAt: new Date(),
        },
      });
    } else {
      // Need to ensure notification type exists first
      const notificationType = await prisma.notificationType.findUnique({
        where: { typeId: 'geofence_alert' },
      });

      if (!notificationType) {
        await prisma.notificationType.create({
          data: {
            typeId: 'geofence_alert',
            name: 'Geofence Alert',
            dataSource: 'vessel.state',
            conditionSchema: JSON.stringify({
              evaluator: 'geofence',
              parameters: {
                type: 'object',
                properties: {
                  geofenceIds: { type: 'array', items: { type: 'string' } },
                },
              },
            }),
            defaultTemplate: JSON.stringify({
              title: 'Vessel {{action}} {{geofenceName}}',
              message: '{{vesselName}} has {{action}} the {{geofenceName}} geofence',
            }),
            stateTracking: JSON.stringify({ enabled: true, transitionEvents: ['enter', 'exit'] }),
          },
        });
      }

      await prisma.clientRule.create({
        data: {
          clientId,
          typeId: 'geofence_alert',
          name: 'Geofence Alert Preferences',
          condition,
          isActive: geofenceAlert.enabled,
        },
      });
    }
  }

  return NextResponse.json({ success: true });
}
