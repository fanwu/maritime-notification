import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const notificationTypes = [
  {
    typeId: 'geofence_alert',
    name: 'Geofence Alert',
    description: 'Triggered when a vessel enters or exits a defined geographic area',
    dataSource: 'vessel.state',
    conditionSchema: JSON.stringify({
      evaluator: 'geofence',
      parameters: {
        type: 'object',
        properties: {
          geofenceId: { type: 'string' },
          triggerOn: { enum: ['enter', 'exit', 'both'] },
        },
        required: ['geofenceId', 'triggerOn'],
      },
    }),
    defaultTemplate: JSON.stringify({
      title: 'Vessel {{action}} {{geofenceName}}',
      message: '{{vesselName}} (IMO: {{imo}}) has {{action}} the geofence "{{geofenceName}}"',
    }),
    stateTracking: JSON.stringify({ enabled: true, transitionEvents: ['enter', 'exit'] }),
    isSystem: true,
  },
  {
    typeId: 'speed_alert',
    name: 'Speed Alert',
    description: 'Triggered when vessel speed crosses a threshold',
    dataSource: 'vessel.state',
    conditionSchema: JSON.stringify({
      evaluator: 'compare',
      parameters: {
        type: 'object',
        properties: {
          field: { const: 'Speed' },
          operator: { enum: ['gt', 'lt', 'gte', 'lte', 'eq'] },
          value: { type: 'number', minimum: 0 },
        },
        required: ['field', 'operator', 'value'],
      },
    }),
    defaultTemplate: JSON.stringify({
      title: 'Speed Alert: {{vesselName}}',
      message: '{{vesselName}} (IMO: {{imo}}) speed is {{currentValue}} knots',
    }),
    stateTracking: JSON.stringify({ enabled: false }),
    isSystem: true,
  },
  {
    typeId: 'destination_change',
    name: 'Destination Change Alert',
    description: 'Triggered when a vessel changes its reported destination',
    dataSource: 'vessel.state',
    conditionSchema: JSON.stringify({
      evaluator: 'change',
      parameters: {
        type: 'object',
        properties: {
          field: { enum: ['AISDestination', 'AISDestinationPortID'] },
          to: { type: 'array', items: { type: 'string' } },
        },
        required: ['field'],
      },
    }),
    defaultTemplate: JSON.stringify({
      title: 'Destination Changed: {{vesselName}}',
      message: '{{vesselName}} (IMO: {{imo}}) destination changed from "{{previousValue}}" to "{{currentValue}}"',
    }),
    stateTracking: JSON.stringify({ enabled: true, transitionEvents: ['change'] }),
    isSystem: true,
  },
  {
    typeId: 'status_change',
    name: 'Vessel Status Change',
    description: 'Triggered when a vessel voyage status changes',
    dataSource: 'vessel.state',
    conditionSchema: JSON.stringify({
      evaluator: 'change',
      parameters: {
        type: 'object',
        properties: {
          field: { type: 'string' },
          from: { type: 'array', items: { type: 'string' } },
          to: { type: 'array', items: { type: 'string' } },
        },
        required: ['field'],
      },
    }),
    defaultTemplate: JSON.stringify({
      title: 'Status Change: {{vesselName}}',
      message: '{{vesselName}} (IMO: {{imo}}) status changed from "{{previousValue}}" to "{{currentValue}}"',
    }),
    stateTracking: JSON.stringify({ enabled: true, transitionEvents: ['change'] }),
    isSystem: true,
  },
  {
    typeId: 'area_change',
    name: 'Area Change Alert',
    description: 'Triggered when a vessel moves to a different area',
    dataSource: 'vessel.state',
    conditionSchema: JSON.stringify({
      evaluator: 'change',
      parameters: {
        type: 'object',
        properties: {
          field: { enum: ['AreaName', 'AreaNameLevel1', 'AreaNameLevel2'] },
          to: { type: 'array', items: { type: 'string' } },
        },
        required: ['field'],
      },
    }),
    defaultTemplate: JSON.stringify({
      title: 'Area Change: {{vesselName}}',
      message: '{{vesselName}} (IMO: {{imo}}) has entered {{currentValue}}',
    }),
    stateTracking: JSON.stringify({ enabled: true, transitionEvents: ['change'] }),
    isSystem: true,
  },
  // Dynamic Rule - allows users to create custom rules without code changes
  {
    typeId: 'dynamic_rule',
    name: 'Dynamic Rule',
    description: 'User-defined notification rule with custom conditions. Supports any combination of field conditions with AND/OR logic.',
    dataSource: 'vessel.state',
    conditionSchema: JSON.stringify({
      evaluator: 'dynamic',
      supportsComposite: true,
      parameters: {
        type: 'object',
        properties: {
          logic: { enum: ['AND', 'OR'], description: 'How to combine conditions' },
          conditions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                field: { type: 'string', description: 'VesselState field name' },
                operator: {
                  enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in',
                         'contains', 'starts_with', 'changed', 'changed_to',
                         'changed_from', 'changed_by']
                },
                value: { description: 'Value for comparison operators' },
                values: { type: 'array', description: 'Values for in/changed_to/changed_from' },
                tolerance: { type: 'number', description: 'Tolerance for changed_by' },
              },
              required: ['id', 'field', 'operator'],
            },
          },
        },
        required: ['logic', 'conditions'],
      },
    }),
    defaultTemplate: JSON.stringify({
      title: 'Alert: {{vesselName}}',
      message: 'Dynamic rule triggered for {{vesselName}} (IMO: {{imo}})',
    }),
    stateTracking: JSON.stringify({ enabled: true, trackAllFields: true }),
    uiSchema: JSON.stringify({
      availableFields: [
        { name: 'IMO', type: 'number', label: 'IMO Number' },
        { name: 'Speed', type: 'number', label: 'Speed (knots)' },
        { name: 'VesselVoyageStatus', type: 'string', label: 'Voyage Status' },
        { name: 'VesselStatus', type: 'string', label: 'Vessel Status' },
        { name: 'AISDestination', type: 'string', label: 'AIS Destination' },
        { name: 'AreaName', type: 'string', label: 'Area' },
        { name: 'AreaNameLevel1', type: 'string', label: 'Region' },
        { name: 'Heading', type: 'number', label: 'Heading (degrees)' },
        { name: 'Draught', type: 'number', label: 'Draught (meters)' },
        { name: 'Course', type: 'number', label: 'Course (degrees)' },
        { name: 'IsSeagoing', type: 'boolean', label: 'Is Seagoing' },
      ],
    }),
    isSystem: true,
  },
];

async function main() {
  console.log('Seeding notification types...');

  for (const type of notificationTypes) {
    await prisma.notificationType.upsert({
      where: { typeId: type.typeId },
      update: type,
      create: type,
    });
    console.log(`  Created/updated: ${type.typeId}`);
  }

  // Create a demo client geofence (Singapore Strait)
  const singaporeGeofence = await prisma.geofence.upsert({
    where: { id: 'demo-singapore-strait' },
    update: {},
    create: {
      id: 'demo-singapore-strait',
      clientId: 'demo-client',
      name: 'Singapore Strait',
      description: 'Major shipping lane through Singapore',
      geofenceType: 'polygon',
      coordinates: JSON.stringify([
        [103.6, 1.15],
        [104.2, 1.15],
        [104.2, 1.35],
        [103.6, 1.35],
        [103.6, 1.15],
      ]),
    },
  });
  console.log(`  Created geofence: ${singaporeGeofence.name}`);

  // Create a demo rule
  await prisma.clientRule.upsert({
    where: { id: 'demo-rule-geofence' },
    update: {},
    create: {
      id: 'demo-rule-geofence',
      clientId: 'demo-client',
      typeId: 'geofence_alert',
      name: 'Singapore Strait Watch',
      condition: JSON.stringify({
        geofenceId: 'demo-singapore-strait',
        triggerOn: 'both',
      }),
      filters: JSON.stringify({}),
      geofenceId: 'demo-singapore-strait',
      isActive: true,
    },
  });
  console.log('  Created demo rule: Singapore Strait Watch');

  // Create demo dynamic rules
  // Demo 1: Vessel Stopped (IsSeagoing changed from true)
  await prisma.clientRule.upsert({
    where: { id: 'demo-rule-vessel-stopped' },
    update: {
      condition: JSON.stringify({
        logic: 'AND',
        conditions: [
          {
            id: 'seagoing-changed',
            field: 'IsSeagoing',
            operator: 'changed_from',
            values: [true],
          },
        ],
      }),
      settings: JSON.stringify({
        template: {
          title: 'Voyage Ended: {{vesselName}}',
          message: '{{vesselName}} (IMO: {{imo}}) has stopped its voyage at {{AreaName}}. Speed: {{Speed}} knots.',
        },
      }),
    },
    create: {
      id: 'demo-rule-vessel-stopped',
      clientId: 'demo-client',
      typeId: 'dynamic_rule',
      name: 'Vessel Stopped Voyage',
      condition: JSON.stringify({
        logic: 'AND',
        conditions: [
          {
            id: 'seagoing-changed',
            field: 'IsSeagoing',
            operator: 'changed_from',
            values: [true],
          },
        ],
      }),
      filters: JSON.stringify({}),
      settings: JSON.stringify({
        template: {
          title: 'Voyage Ended: {{vesselName}}',
          message: '{{vesselName}} (IMO: {{imo}}) has stopped its voyage at {{AreaName}}. Speed: {{Speed}} knots.',
        },
      }),
      isActive: true,
    },
  });
  console.log('  Created demo rule: Vessel Stopped Voyage');

  // Demo 2: Voyage Status Changed to Discharging
  await prisma.clientRule.upsert({
    where: { id: 'demo-rule-status-discharging' },
    update: {
      condition: JSON.stringify({
        logic: 'AND',
        conditions: [
          {
            id: 'status-to-discharging',
            field: 'VesselVoyageStatus',
            operator: 'changed_to',
            values: ['Discharging'],
          },
        ],
      }),
      settings: JSON.stringify({
        template: {
          title: 'Now Discharging: {{vesselName}}',
          message: '{{vesselName}} (IMO: {{imo}}) has started discharging at {{AreaName}}.',
        },
      }),
    },
    create: {
      id: 'demo-rule-status-discharging',
      clientId: 'demo-client',
      typeId: 'dynamic_rule',
      name: 'Vessel Started Discharging',
      condition: JSON.stringify({
        logic: 'AND',
        conditions: [
          {
            id: 'status-to-discharging',
            field: 'VesselVoyageStatus',
            operator: 'changed_to',
            values: ['Discharging'],
          },
        ],
      }),
      filters: JSON.stringify({}),
      settings: JSON.stringify({
        template: {
          title: 'Now Discharging: {{vesselName}}',
          message: '{{vesselName}} (IMO: {{imo}}) has started discharging at {{AreaName}}.',
        },
      }),
      isActive: true,
    },
  });
  console.log('  Created demo rule: Vessel Started Discharging');

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
