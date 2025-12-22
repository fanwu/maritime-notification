import { NextResponse } from 'next/server';

// Available fields for dynamic rules with their metadata
const AVAILABLE_FIELDS = [
  {
    name: 'IMO',
    type: 'number',
    label: 'IMO Number',
    description: 'Vessel IMO identifier',
    operators: ['eq', 'neq', 'in', 'not_in'],
  },
  {
    name: 'Speed',
    type: 'number',
    label: 'Speed (knots)',
    description: 'Vessel speed in knots (0 = stopped)',
    operators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'crossed_above', 'crossed_below', 'changed', 'changed_by'],
  },
  {
    name: 'VesselVoyageStatus',
    type: 'string',
    label: 'Voyage Status',
    description: 'Current voyage status (Discharging, Loading, Waiting, etc.)',
    operators: ['eq', 'neq', 'in', 'not_in', 'changed', 'changed_to', 'changed_from'],
    discoveredValuesKey: 'voyageStatuses',
  },
  {
    name: 'VesselStatus',
    type: 'string',
    label: 'Vessel Status',
    description: 'Overall vessel status (Voyage, Repair, etc.)',
    operators: ['eq', 'neq', 'in', 'not_in', 'changed', 'changed_to', 'changed_from'],
  },
  {
    name: 'AISDestination',
    type: 'string',
    label: 'AIS Destination',
    description: 'Destination reported by AIS',
    operators: ['eq', 'neq', 'in', 'not_in', 'contains', 'starts_with', 'changed', 'changed_to', 'changed_from'],
    discoveredValuesKey: 'destinations',
  },
  {
    name: 'AreaName',
    type: 'string',
    label: 'Area',
    description: 'Current geographic area',
    operators: ['eq', 'neq', 'in', 'not_in', 'changed', 'changed_to', 'changed_from'],
    discoveredValuesKey: 'areas',
  },
  {
    name: 'AreaNameLevel1',
    type: 'string',
    label: 'Region',
    description: 'Current geographic region (level 1)',
    operators: ['eq', 'neq', 'in', 'not_in', 'changed', 'changed_to'],
    discoveredValuesKey: 'areas:level1',
  },
  {
    name: 'Heading',
    type: 'number',
    label: 'Heading (degrees)',
    description: 'Vessel heading in degrees (0-360)',
    operators: ['eq', 'neq', 'gt', 'lt', 'crossed_above', 'crossed_below', 'changed', 'changed_by'],
  },
  {
    name: 'Draught',
    type: 'number',
    label: 'Draught (meters)',
    description: 'Vessel draught in meters',
    operators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'crossed_above', 'crossed_below', 'changed', 'changed_by'],
  },
  {
    name: 'Course',
    type: 'number',
    label: 'Course (degrees)',
    description: 'Vessel course over ground in degrees (0-360)',
    operators: ['eq', 'neq', 'crossed_above', 'crossed_below', 'changed', 'changed_by'],
  },
  {
    name: 'IsSeagoing',
    type: 'boolean',
    label: 'Is Seagoing',
    description: 'Whether vessel is currently on a voyage (false = stopped)',
    operators: ['eq', 'changed', 'changed_to', 'changed_from'],
  },
];

// Operator metadata for UI
const OPERATORS = {
  eq: { label: 'Equals', description: 'Value equals', requiresValue: true },
  neq: { label: 'Not Equals', description: 'Value does not equal', requiresValue: true },
  gt: { label: 'Greater Than', description: 'Value is greater than (every message)', requiresValue: true },
  gte: { label: 'Greater or Equal', description: 'Value is greater than or equal to (every message)', requiresValue: true },
  lt: { label: 'Less Than', description: 'Value is less than (every message)', requiresValue: true },
  lte: { label: 'Less or Equal', description: 'Value is less than or equal to (every message)', requiresValue: true },
  crossed_above: { label: 'Crossed Above', description: 'Value crossed above threshold (triggers once)', requiresValue: true },
  crossed_below: { label: 'Crossed Below', description: 'Value crossed below threshold (triggers once)', requiresValue: true },
  in: { label: 'In List', description: 'Value is one of', requiresValues: true },
  not_in: { label: 'Not In List', description: 'Value is not one of', requiresValues: true },
  contains: { label: 'Contains', description: 'Text contains', requiresValue: true },
  starts_with: { label: 'Starts With', description: 'Text starts with', requiresValue: true },
  changed: { label: 'Changed', description: 'Value changed from previous', requiresValue: false },
  changed_to: { label: 'Changed To', description: 'Value changed to one of', requiresValues: true },
  changed_from: { label: 'Changed From', description: 'Value changed from one of', requiresValues: true },
  changed_by: { label: 'Changed By', description: 'Numeric value changed by at least', requiresTolerance: true },
};

export async function GET() {
  return NextResponse.json({
    fields: AVAILABLE_FIELDS,
    operators: OPERATORS,
  });
}
