'use client';

import { useState, useEffect } from 'react';
import {
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';

interface FieldMetadata {
  name: string;
  type: 'number' | 'string' | 'boolean';
  label: string;
  description: string;
  operators: string[];
  discoveredValuesKey?: string;
}

interface OperatorMetadata {
  label: string;
  description: string;
  requiresValue?: boolean;
  requiresValues?: boolean;
  requiresTolerance?: boolean;
}

interface Condition {
  id: string;
  field: string;
  operator: string;
  value?: unknown;
  values?: unknown[];
  tolerance?: number;
}

interface DynamicCondition {
  logic: 'AND' | 'OR';
  conditions: Condition[];
}

interface RuleSettings {
  template?: {
    title: string;
    message: string;
  };
}

interface DynamicRule {
  id?: string;
  name: string;
  condition: DynamicCondition;
  filters: Record<string, unknown>;
  settings: RuleSettings;
  isActive: boolean;
}

interface DynamicRuleBuilderProps {
  rule?: DynamicRule;
  onSave: (rule: DynamicRule) => Promise<void>;
  onClose: () => void;
}

// Generate a unique ID for conditions
function generateId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export default function DynamicRuleBuilder({
  rule,
  onSave,
  onClose,
}: DynamicRuleBuilderProps) {
  const [name, setName] = useState(rule?.name || '');
  const [logic, setLogic] = useState<'AND' | 'OR'>(rule?.condition?.logic || 'AND');
  const [conditions, setConditions] = useState<Condition[]>(
    rule?.condition?.conditions || [{ id: generateId(), field: '', operator: '', value: '' }]
  );
  const [template, setTemplate] = useState({
    title: rule?.settings?.template?.title || 'Alert: {{vesselName}}',
    message: rule?.settings?.template?.message || '{{vesselName}} (IMO: {{imo}}) triggered this rule',
  });
  const [isActive, setIsActive] = useState(rule?.isActive !== false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Field and operator metadata
  const [fields, setFields] = useState<FieldMetadata[]>([]);
  const [operators, setOperators] = useState<Record<string, OperatorMetadata>>({});
  const [discoveredValues, setDiscoveredValues] = useState<Record<string, string[]>>({});

  // Fetch field metadata
  useEffect(() => {
    async function fetchMetadata() {
      try {
        const res = await fetch('/api/rules/fields');
        if (res.ok) {
          const data = await res.json();
          setFields(data.fields);
          setOperators(data.operators);
        }
      } catch (err) {
        console.error('Failed to fetch field metadata:', err);
      }
    }
    fetchMetadata();
  }, []);

  // Fetch discovered values for string fields
  useEffect(() => {
    async function fetchDiscoveredValues() {
      const keys = fields
        .filter((f) => f.discoveredValuesKey)
        .map((f) => f.discoveredValuesKey!);

      for (const key of keys) {
        try {
          const res = await fetch(`/api/discovered/${key}?limit=100`);
          if (res.ok) {
            const data = await res.json();
            setDiscoveredValues((prev) => ({ ...prev, [key]: data.values || [] }));
          }
        } catch (err) {
          console.error(`Failed to fetch discovered values for ${key}:`, err);
        }
      }
    }
    if (fields.length > 0) {
      fetchDiscoveredValues();
    }
  }, [fields]);

  const getFieldMetadata = (fieldName: string): FieldMetadata | undefined => {
    return fields.find((f) => f.name === fieldName);
  };

  const getOperatorsForField = (fieldName: string): string[] => {
    const field = getFieldMetadata(fieldName);
    return field?.operators || [];
  };

  const addCondition = () => {
    setConditions([...conditions, { id: generateId(), field: '', operator: '', value: '' }]);
  };

  const removeCondition = (id: string) => {
    if (conditions.length > 1) {
      setConditions(conditions.filter((c) => c.id !== id));
    }
  };

  const updateCondition = (id: string, updates: Partial<Condition>) => {
    setConditions(
      conditions.map((c) => {
        if (c.id !== id) return c;

        const updated = { ...c, ...updates };

        // Reset operator and value when field changes
        if (updates.field && updates.field !== c.field) {
          updated.operator = '';
          updated.value = undefined;
          updated.values = undefined;
          updated.tolerance = undefined;
        }

        // Reset value when operator changes
        if (updates.operator && updates.operator !== c.operator) {
          const opMeta = operators[updates.operator];
          if (opMeta?.requiresValues) {
            updated.value = undefined;
            updated.values = [];
          } else if (opMeta?.requiresTolerance) {
            updated.value = undefined;
            updated.values = undefined;
            updated.tolerance = 0;
          } else {
            updated.values = undefined;
            updated.tolerance = undefined;
          }
        }

        return updated;
      })
    );
  };

  const handleSave = async () => {
    // Validate
    if (!name.trim()) {
      setError('Rule name is required');
      return;
    }

    const validConditions = conditions.filter((c) => c.field && c.operator);
    if (validConditions.length === 0) {
      setError('At least one complete condition is required');
      return;
    }

    // Check each condition has required values
    for (const cond of validConditions) {
      const opMeta = operators[cond.operator];
      if (opMeta?.requiresValue && (cond.value === undefined || cond.value === '')) {
        setError(`Condition for "${cond.field}" requires a value`);
        return;
      }
      if (opMeta?.requiresValues && (!cond.values || cond.values.length === 0)) {
        setError(`Condition for "${cond.field}" requires at least one value`);
        return;
      }
      if (opMeta?.requiresTolerance && (cond.tolerance === undefined || cond.tolerance < 0)) {
        setError(`Condition for "${cond.field}" requires a tolerance value`);
        return;
      }
    }

    setSaving(true);
    setError(null);

    try {
      await onSave({
        id: rule?.id,
        name: name.trim(),
        condition: {
          logic,
          conditions: validConditions,
        },
        filters: {},
        settings: { template },
        isActive,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  const renderValueInput = (condition: Condition) => {
    const opMeta = operators[condition.operator];
    const fieldMeta = getFieldMetadata(condition.field);

    if (!opMeta || !fieldMeta) return null;

    // Boolean field with specific operators
    if (fieldMeta.type === 'boolean') {
      if (opMeta.requiresValue) {
        return (
          <select
            value={String(condition.value ?? '')}
            onChange={(e) => updateCondition(condition.id, { value: e.target.value === 'true' })}
            className="flex-1 px-3 py-2 border border-slate-600 rounded-md text-sm bg-slate-700 text-white"
          >
            <option value="">Select...</option>
            <option value="true">True (On Voyage)</option>
            <option value="false">False (Stopped)</option>
          </select>
        );
      }
      if (opMeta.requiresValues) {
        return (
          <div className="flex-1 flex gap-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={condition.values?.includes(true) ?? false}
                onChange={(e) => {
                  const current = condition.values || [];
                  const newValues = e.target.checked
                    ? [...current, true]
                    : current.filter((v) => v !== true);
                  updateCondition(condition.id, { values: newValues });
                }}
                className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded"
              />
              <span className="text-sm text-slate-300">True</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={condition.values?.includes(false) ?? false}
                onChange={(e) => {
                  const current = condition.values || [];
                  const newValues = e.target.checked
                    ? [...current, false]
                    : current.filter((v) => v !== false);
                  updateCondition(condition.id, { values: newValues });
                }}
                className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600 rounded"
              />
              <span className="text-sm text-slate-300">False</span>
            </label>
          </div>
        );
      }
    }

    // Tolerance input for changed_by
    if (opMeta.requiresTolerance) {
      return (
        <input
          type="number"
          min="0"
          step="0.1"
          value={condition.tolerance ?? 0}
          onChange={(e) => updateCondition(condition.id, { tolerance: parseFloat(e.target.value) || 0 })}
          placeholder="Minimum change"
          className="flex-1 px-3 py-2 border border-slate-600 rounded-md text-sm bg-slate-700 text-white placeholder-slate-400"
        />
      );
    }

    // Multi-value input for in/changed_to/changed_from
    if (opMeta.requiresValues) {
      const discoveredKey = fieldMeta.discoveredValuesKey;
      const suggestions = discoveredKey ? discoveredValues[discoveredKey] || [] : [];

      return (
        <div className="flex-1">
          <div className="flex flex-wrap gap-1 mb-2">
            {(condition.values || []).map((v, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2 py-1 bg-purple-900/50 text-purple-300 rounded text-xs"
              >
                {String(v)}
                <button
                  type="button"
                  onClick={() => {
                    const newValues = [...(condition.values || [])];
                    newValues.splice(idx, 1);
                    updateCondition(condition.id, { values: newValues });
                  }}
                  className="hover:text-purple-100"
                >
                  <XMarkIcon className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex-1">
            <div className="flex gap-2">
              <input
                type={fieldMeta.type === 'number' ? 'number' : 'text'}
                list={`suggestions-${condition.id}`}
                placeholder={fieldMeta.type === 'number' ? 'Enter number, press Enter' : 'Type value, press Enter'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const input = e.target as HTMLInputElement;
                    const rawValue = input.value.trim();
                    if (!rawValue) return;

                    // Parse as number if field type is number
                    const value = fieldMeta.type === 'number' ? parseFloat(rawValue) : rawValue;
                    if (fieldMeta.type === 'number' && isNaN(value as number)) return;

                    if (!condition.values?.includes(value)) {
                      updateCondition(condition.id, {
                        values: [...(condition.values || []), value],
                      });
                      input.value = '';
                    }
                  }
                }}
                className="flex-1 px-3 py-2 border border-slate-600 rounded-md text-sm bg-slate-700 text-white placeholder-slate-400"
              />
              {suggestions.length > 0 && (
                <datalist id={`suggestions-${condition.id}`}>
                  {suggestions.slice(0, 50).map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">Press Enter to add each value</p>
          </div>
        </div>
      );
    }

    // Single value input
    if (opMeta.requiresValue) {
      const discoveredKey = fieldMeta.discoveredValuesKey;
      const suggestions = discoveredKey ? discoveredValues[discoveredKey] || [] : [];

      if (fieldMeta.type === 'number') {
        return (
          <input
            type="number"
            step="any"
            value={typeof condition.value === 'number' ? condition.value : ''}
            onChange={(e) => updateCondition(condition.id, { value: parseFloat(e.target.value) || 0 })}
            placeholder="Value"
            className="flex-1 px-3 py-2 border border-slate-600 rounded-md text-sm bg-slate-700 text-white placeholder-slate-400"
          />
        );
      }

      return (
        <>
          <input
            type="text"
            list={`suggestions-${condition.id}`}
            value={String(condition.value ?? '')}
            onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
            placeholder="Value"
            className="flex-1 px-3 py-2 border border-slate-600 rounded-md text-sm bg-slate-700 text-white placeholder-slate-400"
          />
          {suggestions.length > 0 && (
            <datalist id={`suggestions-${condition.id}`}>
              {suggestions.slice(0, 50).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </>
      );
    }

    // No value needed (e.g., 'changed')
    return <span className="text-sm text-slate-500 italic">No value needed</span>;
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-xl border border-slate-700">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between bg-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-900/50 rounded-lg">
              <BoltIcon className="w-5 h-5 text-purple-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">
              {rule?.id ? 'Edit Dynamic Rule' : 'Create Dynamic Rule'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Rule Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Rule Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Vessel Stopped Alert"
              className="w-full px-3 py-2 border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 bg-slate-700 text-white placeholder-slate-400"
            />
          </div>

          {/* Logic */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Combine Conditions With
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="logic"
                  value="AND"
                  checked={logic === 'AND'}
                  onChange={() => setLogic('AND')}
                  className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600"
                />
                <span className="text-sm text-slate-300">AND (all must match)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="logic"
                  value="OR"
                  checked={logic === 'OR'}
                  onChange={() => setLogic('OR')}
                  className="w-4 h-4 text-purple-500 bg-slate-700 border-slate-600"
                />
                <span className="text-sm text-slate-300">OR (any can match)</span>
              </label>
            </div>
          </div>

          {/* Conditions */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Conditions</label>
            <div className="space-y-3">
              {conditions.map((condition, idx) => (
                <div
                  key={condition.id}
                  className="flex flex-wrap gap-2 p-3 bg-slate-800 rounded-lg border border-slate-700"
                >
                  {idx > 0 && (
                    <span className="w-full text-xs font-medium text-purple-400 -mt-1 mb-1">
                      {logic}
                    </span>
                  )}

                  {/* Field */}
                  <select
                    value={condition.field}
                    onChange={(e) => updateCondition(condition.id, { field: e.target.value })}
                    className="px-3 py-2 border border-slate-600 rounded-md text-sm bg-slate-700 text-white min-w-[140px]"
                  >
                    <option value="">Select field...</option>
                    {fields.map((f) => (
                      <option key={f.name} value={f.name}>
                        {f.label}
                      </option>
                    ))}
                  </select>

                  {/* Operator */}
                  <select
                    value={condition.operator}
                    onChange={(e) => updateCondition(condition.id, { operator: e.target.value })}
                    disabled={!condition.field}
                    className="px-3 py-2 border border-slate-600 rounded-md text-sm bg-slate-700 text-white min-w-[140px] disabled:bg-slate-800 disabled:text-slate-500"
                  >
                    <option value="">Select operator...</option>
                    {getOperatorsForField(condition.field).map((op) => (
                      <option key={op} value={op}>
                        {operators[op]?.label || op}
                      </option>
                    ))}
                  </select>

                  {/* Value */}
                  {condition.field && condition.operator && renderValueInput(condition)}

                  {/* Remove button */}
                  {conditions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeCondition(condition.id)}
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-900/30 rounded-md transition-colors"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={addCondition}
                className="flex items-center gap-2 px-3 py-2 text-sm text-purple-400 hover:bg-purple-900/30 rounded-md transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                Add Condition
              </button>
            </div>
          </div>

          {/* Notification Template */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Notification Template
            </label>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Title</label>
                <input
                  type="text"
                  value={template.title}
                  onChange={(e) => setTemplate({ ...template, title: e.target.value })}
                  placeholder="e.g., Alert: {{vesselName}}"
                  className="w-full px-3 py-2 border border-slate-600 rounded-md text-sm bg-slate-700 text-white placeholder-slate-400"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Message</label>
                <textarea
                  value={template.message}
                  onChange={(e) => setTemplate({ ...template, message: e.target.value })}
                  placeholder="e.g., {{vesselName}} triggered this rule at {{AreaName}}"
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-600 rounded-md text-sm bg-slate-700 text-white placeholder-slate-400"
                />
              </div>
              <p className="text-xs text-slate-500">
                Available variables: {'{{vesselName}}'}, {'{{imo}}'}, {'{{Speed}}'}, {'{{AreaName}}'},{' '}
                {'{{VesselVoyageStatus}}'}, and other field names.
                <br />
                For change detection, use {'{{previousSpeed}}'}, {'{{previousVesselVoyageStatus}}'}, etc.
              </p>
            </div>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-300">Rule Active</span>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isActive ? 'bg-purple-500' : 'bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                  isActive ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-700 flex justify-end gap-3 bg-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-purple-500 hover:bg-purple-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {saving ? 'Saving...' : rule?.id ? 'Update Rule' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}
