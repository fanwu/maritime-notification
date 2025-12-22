// Dynamic Rule Evaluator - Generic condition evaluation engine
// Allows users to create custom notification rules without code changes

import type { VesselState } from './types.js';

// Supported operators for conditions
export type ConditionOperator =
  | 'eq'           // equals
  | 'neq'          // not equals
  | 'gt'           // greater than
  | 'gte'          // greater than or equal
  | 'lt'           // less than
  | 'lte'          // less than or equal
  | 'in'           // value in array
  | 'not_in'       // value not in array
  | 'contains'     // string contains
  | 'starts_with'  // string starts with
  | 'changed'      // value changed from previous state
  | 'changed_to'   // changed to specific value(s)
  | 'changed_from' // changed from specific value(s)
  | 'changed_by'   // numeric value changed by at least X
  | 'crossed_above' // value crossed above threshold (was <= X, now > X)
  | 'crossed_below'; // value crossed below threshold (was >= X, now < X)

// A single condition that can be evaluated
export interface Condition {
  id: string;                    // Unique identifier for this condition
  field: string;                 // VesselState field name (e.g., "Speed", "VesselVoyageStatus")
  operator: ConditionOperator;   // Type of comparison
  value?: unknown;               // Static value for comparison
  values?: unknown[];            // Multiple values for "in" / "changed_to" / "changed_from" operators
  tolerance?: number;            // For "changed_by" operator - minimum change amount
}

// A dynamic rule combines conditions with AND/OR logic
export interface DynamicCondition {
  logic: 'AND' | 'OR';           // How to combine conditions
  conditions: Condition[];
}

// Context for evaluating conditions (current + previous state)
export interface EvaluationContext {
  currentState: VesselState;
  previousState: Partial<VesselState> | null;
}

// Result of evaluating a single condition
export interface ConditionResult {
  triggered: boolean;
  details: Record<string, unknown>;
}

// Result of evaluating a full dynamic rule
export interface DynamicEvaluationResult {
  triggered: boolean;
  conditionResults: Record<string, ConditionResult>;
  context: Record<string, unknown>;
}

// Fields that can be tracked for change detection
export const TRACKABLE_FIELDS = [
  'IMO',
  'Speed',
  'VesselVoyageStatus',
  'VesselStatus',
  'AISDestination',
  'AreaName',
  'AreaNameLevel1',
  'Heading',
  'Draught',
  'Course',
  'IsSeagoing',
] as const;

export type TrackableField = typeof TRACKABLE_FIELDS[number];

// Field metadata for UI
export interface FieldMetadata {
  name: string;
  type: 'number' | 'string' | 'boolean';
  description: string;
  operators: ConditionOperator[];
}

export const FIELD_METADATA: Record<TrackableField, FieldMetadata> = {
  IMO: {
    name: 'IMO Number',
    type: 'number',
    description: 'Vessel IMO identifier',
    operators: ['eq', 'neq', 'in', 'not_in'],
  },
  Speed: {
    name: 'Speed',
    type: 'number',
    description: 'Vessel speed in knots (0 = stopped)',
    operators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'crossed_above', 'crossed_below', 'changed', 'changed_by'],
  },
  VesselVoyageStatus: {
    name: 'Voyage Status',
    type: 'string',
    description: 'Current voyage status (Discharging, Loading, Waiting, etc.)',
    operators: ['eq', 'neq', 'in', 'not_in', 'changed', 'changed_to', 'changed_from'],
  },
  VesselStatus: {
    name: 'Vessel Status',
    type: 'string',
    description: 'Overall vessel status (Voyage, Repair, etc.)',
    operators: ['eq', 'neq', 'in', 'not_in', 'changed', 'changed_to', 'changed_from'],
  },
  AISDestination: {
    name: 'AIS Destination',
    type: 'string',
    description: 'Destination reported by AIS',
    operators: ['eq', 'neq', 'in', 'not_in', 'contains', 'starts_with', 'changed', 'changed_to', 'changed_from'],
  },
  AreaName: {
    name: 'Area',
    type: 'string',
    description: 'Current geographic area',
    operators: ['eq', 'neq', 'in', 'not_in', 'changed', 'changed_to', 'changed_from'],
  },
  AreaNameLevel1: {
    name: 'Region',
    type: 'string',
    description: 'Current geographic region (level 1)',
    operators: ['eq', 'neq', 'in', 'not_in', 'changed', 'changed_to'],
  },
  Heading: {
    name: 'Heading',
    type: 'number',
    description: 'Vessel heading in degrees',
    operators: ['eq', 'neq', 'gt', 'lt', 'crossed_above', 'crossed_below', 'changed', 'changed_by'],
  },
  Draught: {
    name: 'Draught',
    type: 'number',
    description: 'Vessel draught in meters',
    operators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'crossed_above', 'crossed_below', 'changed', 'changed_by'],
  },
  Course: {
    name: 'Course',
    type: 'number',
    description: 'Vessel course over ground in degrees',
    operators: ['eq', 'neq', 'crossed_above', 'crossed_below', 'changed', 'changed_by'],
  },
  IsSeagoing: {
    name: 'Is Seagoing',
    type: 'boolean',
    description: 'Whether vessel is currently on a voyage (false = stopped)',
    operators: ['eq', 'changed', 'changed_to', 'changed_from'],
  },
};

/**
 * Evaluate a single condition against current and previous vessel state
 */
export function evaluateCondition(
  condition: Condition,
  ctx: EvaluationContext
): ConditionResult {
  const currentValue = ctx.currentState[condition.field as keyof VesselState];
  const previousValue = ctx.previousState?.[condition.field as keyof VesselState];

  const details: Record<string, unknown> = {
    field: condition.field,
    operator: condition.operator,
    currentValue,
    previousValue,
  };

  switch (condition.operator) {
    case 'eq': {
      const triggered = currentValue === condition.value;
      return { triggered, details: { ...details, expectedValue: condition.value } };
    }

    case 'neq': {
      const triggered = currentValue !== condition.value;
      return { triggered, details: { ...details, expectedValue: condition.value } };
    }

    case 'gt': {
      const triggered = Number(currentValue) > Number(condition.value);
      return { triggered, details: { ...details, threshold: condition.value } };
    }

    case 'gte': {
      const triggered = Number(currentValue) >= Number(condition.value);
      return { triggered, details: { ...details, threshold: condition.value } };
    }

    case 'lt': {
      const triggered = Number(currentValue) < Number(condition.value);
      return { triggered, details: { ...details, threshold: condition.value } };
    }

    case 'lte': {
      const triggered = Number(currentValue) <= Number(condition.value);
      return { triggered, details: { ...details, threshold: condition.value } };
    }

    case 'in': {
      const values = condition.values ?? [];
      const triggered = values.includes(currentValue);
      return { triggered, details: { ...details, allowedValues: values } };
    }

    case 'not_in': {
      const values = condition.values ?? [];
      const triggered = !values.includes(currentValue);
      return { triggered, details: { ...details, excludedValues: values } };
    }

    case 'contains': {
      const triggered = String(currentValue ?? '').toLowerCase().includes(
        String(condition.value ?? '').toLowerCase()
      );
      return { triggered, details: { ...details, searchValue: condition.value } };
    }

    case 'starts_with': {
      const triggered = String(currentValue ?? '').toLowerCase().startsWith(
        String(condition.value ?? '').toLowerCase()
      );
      return { triggered, details: { ...details, prefix: condition.value } };
    }

    case 'changed': {
      // Must have previous state and value must be different
      const hasPrevious = previousValue !== undefined && previousValue !== null;
      const hasChanged = currentValue !== previousValue;
      // Skip empty-to-value or value-to-empty transitions
      const bothNonEmpty =
        String(currentValue ?? '').trim() !== '' &&
        String(previousValue ?? '').trim() !== '';
      const triggered = hasPrevious && hasChanged && bothNonEmpty;
      return { triggered, details };
    }

    case 'changed_to': {
      const values = condition.values ?? [];
      const hasPrevious = previousValue !== undefined && previousValue !== null;
      const hasChanged = currentValue !== previousValue;
      const matchesTarget = values.includes(currentValue);
      const triggered = hasPrevious && hasChanged && matchesTarget;
      return { triggered, details: { ...details, targetValues: values } };
    }

    case 'changed_from': {
      const values = condition.values ?? [];
      const hasPrevious = previousValue !== undefined && previousValue !== null;
      const hasChanged = currentValue !== previousValue;
      const matchesSource = values.includes(previousValue);
      const triggered = hasPrevious && hasChanged && matchesSource;
      return { triggered, details: { ...details, sourceValues: values } };
    }

    case 'changed_by': {
      const tolerance = condition.tolerance ?? 0;
      const hasPrevious = previousValue !== undefined && previousValue !== null;
      // Don't trigger if no previous state to compare against
      if (!hasPrevious) {
        return { triggered: false, details: { ...details, reason: 'no_previous_state' } };
      }
      const diff = Math.abs(Number(currentValue) - Number(previousValue));
      const triggered = diff >= tolerance;
      return { triggered, details: { ...details, tolerance, difference: diff } };
    }

    case 'crossed_above': {
      const threshold = Number(condition.value);
      const hasPrevious = previousValue !== undefined && previousValue !== null;
      // Don't trigger if no previous state to compare against
      if (!hasPrevious) {
        return { triggered: false, details: { ...details, reason: 'no_previous_state' } };
      }
      const prev = Number(previousValue);
      const curr = Number(currentValue);
      // Trigger when crossing from at-or-below to above
      const triggered = prev <= threshold && curr > threshold;
      return { triggered, details: { ...details, threshold, previousValue: prev, currentValue: curr } };
    }

    case 'crossed_below': {
      const threshold = Number(condition.value);
      const hasPrevious = previousValue !== undefined && previousValue !== null;
      // Don't trigger if no previous state to compare against
      if (!hasPrevious) {
        return { triggered: false, details: { ...details, reason: 'no_previous_state' } };
      }
      const prev = Number(previousValue);
      const curr = Number(currentValue);
      // Trigger when crossing from at-or-above to below
      const triggered = prev >= threshold && curr < threshold;
      return { triggered, details: { ...details, threshold, previousValue: prev, currentValue: curr } };
    }

    default:
      console.warn(`Unknown operator: ${condition.operator}`);
      return { triggered: false, details };
  }
}

/**
 * Evaluate a full dynamic rule with multiple conditions
 */
export function evaluateDynamicRule(
  rule: DynamicCondition,
  ctx: EvaluationContext
): DynamicEvaluationResult {
  const conditionResults: Record<string, ConditionResult> = {};

  // Evaluate each condition
  for (const condition of rule.conditions) {
    const result = evaluateCondition(condition, ctx);
    conditionResults[condition.id] = result;
  }

  // Combine results based on logic
  const triggeredConditions = Object.values(conditionResults).map(r => r.triggered);

  const triggered = rule.logic === 'AND'
    ? triggeredConditions.every(v => v)  // All must be true
    : triggeredConditions.some(v => v);  // At least one must be true

  // Build context with all evaluated fields
  const context: Record<string, unknown> = {
    logic: rule.logic,
    conditionCount: rule.conditions.length,
    triggeredCount: triggeredConditions.filter(v => v).length,
  };

  // Add current values for template rendering
  for (const condition of rule.conditions) {
    const fieldValue = ctx.currentState[condition.field as keyof VesselState];
    context[condition.field] = fieldValue;
    context[`previous_${condition.field}`] = ctx.previousState?.[condition.field as keyof VesselState];
  }

  return { triggered, conditionResults, context };
}

/**
 * Validate a dynamic rule condition
 */
export function validateCondition(condition: Condition): string[] {
  const errors: string[] = [];

  if (!condition.id) {
    errors.push('Condition must have an id');
  }

  if (!condition.field) {
    errors.push('Condition must have a field');
  } else if (!TRACKABLE_FIELDS.includes(condition.field as TrackableField)) {
    errors.push(`Unknown field: ${condition.field}. Valid fields: ${TRACKABLE_FIELDS.join(', ')}`);
  }

  if (!condition.operator) {
    errors.push('Condition must have an operator');
  }

  // Validate operator-specific requirements
  switch (condition.operator) {
    case 'eq':
    case 'neq':
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
    case 'contains':
    case 'starts_with':
    case 'crossed_above':
    case 'crossed_below':
      if (condition.value === undefined) {
        errors.push(`Operator '${condition.operator}' requires a 'value'`);
      }
      break;

    case 'in':
    case 'not_in':
    case 'changed_to':
    case 'changed_from':
      if (!condition.values || !Array.isArray(condition.values) || condition.values.length === 0) {
        errors.push(`Operator '${condition.operator}' requires a non-empty 'values' array`);
      }
      break;

    case 'changed_by':
      if (condition.tolerance === undefined || typeof condition.tolerance !== 'number') {
        errors.push("Operator 'changed_by' requires a numeric 'tolerance'");
      }
      break;

    case 'changed':
      // No additional requirements
      break;
  }

  return errors;
}

/**
 * Validate a full dynamic rule
 */
export function validateDynamicRule(rule: DynamicCondition): string[] {
  const errors: string[] = [];

  if (!rule.logic || !['AND', 'OR'].includes(rule.logic)) {
    errors.push("Rule must have 'logic' set to 'AND' or 'OR'");
  }

  if (!rule.conditions || !Array.isArray(rule.conditions) || rule.conditions.length === 0) {
    errors.push('Rule must have at least one condition');
  } else {
    // Validate each condition
    for (let i = 0; i < rule.conditions.length; i++) {
      const conditionErrors = validateCondition(rule.conditions[i]);
      errors.push(...conditionErrors.map(e => `Condition ${i + 1}: ${e}`));
    }

    // Check for duplicate condition IDs
    const ids = rule.conditions.map(c => c.id);
    const duplicates = ids.filter((id, idx) => ids.indexOf(id) !== idx);
    if (duplicates.length > 0) {
      errors.push(`Duplicate condition IDs: ${duplicates.join(', ')}`);
    }
  }

  return errors;
}
