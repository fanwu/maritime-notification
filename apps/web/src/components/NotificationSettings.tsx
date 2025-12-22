'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  XMarkIcon,
  MapPinIcon,
  ArrowsRightLeftIcon,
  CheckIcon,
  InformationCircleIcon,
  MagnifyingGlassIcon,
  BoltIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import DynamicRuleBuilder from './DynamicRuleBuilder';

interface DestinationPreferences {
  enabled: boolean;
  fromDestinations: string[];
  toDestinations: string[];
}

interface GeofencePreferences {
  enabled: boolean;
  geofenceIds: string[];
}

interface Geofence {
  id: string;
  name: string;
}

interface DynamicRule {
  id: string;
  name: string;
  condition: {
    logic: 'AND' | 'OR';
    conditions: Array<{
      id: string;
      field: string;
      operator: string;
      value?: unknown;
      values?: unknown[];
      tolerance?: number;
    }>;
  };
  filters: Record<string, unknown>;
  settings: {
    template?: {
      title: string;
      message: string;
    };
  };
  isActive: boolean;
}

interface NotificationSettingsProps {
  clientId: string;
  onClose: () => void;
  onSave: () => void;
}

// Reusable Toggle Switch component
function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        enabled ? 'bg-blue-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// Reusable Chip component
function Chip({
  label,
  selected,
  onClick,
  color = 'blue',
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  color?: 'blue' | 'green';
}) {
  const colors = {
    blue: selected
      ? 'bg-blue-600 text-white border-blue-600'
      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400',
    green: selected
      ? 'bg-emerald-600 text-white border-emerald-600'
      : 'bg-white text-gray-700 border-gray-300 hover:border-emerald-400',
  };

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border transition-all ${colors[color]}`}
    >
      {selected && <CheckIcon className="w-3 h-3" />}
      {label}
    </button>
  );
}

// Destination selector with server-side search
function DestinationSelector({
  label,
  color,
  selected,
  onToggle,
  onAddMultiple,
}: {
  label: string;
  color: 'blue' | 'green';
  selected: string[];
  onToggle: (dest: string) => void;
  onAddMultiple: (dests: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch destinations from API when search changes
  useEffect(() => {
    const fetchDestinations = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '100' });
        if (search.trim()) {
          params.set('search', search.trim());
        }
        const res = await fetch(`/api/discovered/destinations?${params}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.values || []);
        }
      } catch (error) {
        console.error('Failed to fetch destinations:', error);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchDestinations, 200);
    return () => clearTimeout(debounce);
  }, [search]);

  const borderColor = color === 'blue' ? 'border-blue-200' : 'border-emerald-200';
  const bgColor = color === 'blue' ? 'bg-blue-50' : 'bg-emerald-50';
  const btnColor = color === 'blue' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700';

  // Count how many results are not yet selected
  const unselectedResults = results.filter((r) => !selected.includes(r));

  const handleAddAll = () => {
    onAddMultiple(unselectedResults);
    setSearch(''); // Clear search after adding
  };

  return (
    <div className={`p-3 rounded-lg border ${borderColor} ${bgColor}`}>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-gray-700">
          {label}
          <span className="font-normal text-gray-400 ml-1">(empty = any)</span>
        </label>
        {selected.length > 0 && (
          <button
            onClick={() => onAddMultiple([])}
            className="text-xs text-gray-500 hover:text-red-600"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {selected.map((dest) => (
            <Chip
              key={dest}
              label={dest}
              selected={true}
              onClick={() => onToggle(dest)}
              color={color}
            />
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative mb-2">
        <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Type to search destinations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
        />
        {loading && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
        )}
      </div>

      {/* Available destinations */}
      {loading ? (
        <p className="text-xs text-gray-400 italic">Searching...</p>
      ) : results.length === 0 ? (
        <p className="text-xs text-gray-400 italic">
          {search.trim() ? `No matches for "${search}"` : 'Type to search destinations'}
        </p>
      ) : (
        <div className="space-y-2">
          {/* Add all button */}
          {search.trim() && unselectedResults.length > 0 && (
            <button
              onClick={handleAddAll}
              className={`w-full py-1.5 text-xs font-medium text-white rounded-md ${btnColor} transition-colors`}
            >
              Add all {unselectedResults.length} matches for "{search}"
            </button>
          )}

          {/* Results list */}
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
            {results.map((dest) => (
              <Chip
                key={dest}
                label={dest}
                selected={selected.includes(dest)}
                onClick={() => onToggle(dest)}
                color={color}
              />
            ))}
            {results.length >= 100 && (
              <span className="text-xs text-gray-400 py-1">
                Showing first 100 (refine search)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function NotificationSettings({
  clientId,
  onClose,
  onSave,
}: NotificationSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availableGeofences, setAvailableGeofences] = useState<Geofence[]>([]);
  const [destinationPrefs, setDestinationPrefs] = useState<DestinationPreferences>({
    enabled: true,
    fromDestinations: [],
    toDestinations: [],
  });
  const [geofencePrefs, setGeofencePrefs] = useState<GeofencePreferences>({
    enabled: true,
    geofenceIds: [],
  });
  const [dynamicRules, setDynamicRules] = useState<DynamicRule[]>([]);
  const [showRuleBuilder, setShowRuleBuilder] = useState(false);
  const [editingRule, setEditingRule] = useState<DynamicRule | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch geofences, preferences, and dynamic rules in parallel
        const [geofenceRes, prefsRes, rulesRes] = await Promise.all([
          fetch(`/api/geofences?clientId=${clientId}`),
          fetch(`/api/preferences?clientId=${clientId}`),
          fetch(`/api/rules?clientId=${clientId}&typeId=dynamic_rule`),
        ]);

        if (geofenceRes.ok) {
          const geofences = await geofenceRes.json();
          setAvailableGeofences(geofences);
        }

        if (prefsRes.ok) {
          const data = await prefsRes.json();
          if (data.destinationChange) {
            setDestinationPrefs(data.destinationChange);
          }
          if (data.geofenceAlert) {
            setGeofencePrefs({
              enabled: data.geofenceAlert.enabled ?? true,
              geofenceIds: data.geofenceAlert.geofenceIds ?? [],
            });
          }
        }

        if (rulesRes.ok) {
          const rules = await rulesRes.json();
          setDynamicRules(rules);
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [clientId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          destinationChange: destinationPrefs,
          geofenceAlert: geofencePrefs,
        }),
      });
      onSave();
      onClose();
    } catch (error) {
      console.error('Failed to save preferences:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleGeofence = (geofenceId: string) => {
    setGeofencePrefs((prev) => ({
      ...prev,
      geofenceIds: prev.geofenceIds.includes(geofenceId)
        ? prev.geofenceIds.filter((id) => id !== geofenceId)
        : [...prev.geofenceIds, geofenceId],
    }));
  };

  const toggleDestination = (list: 'fromDestinations' | 'toDestinations', destination: string) => {
    setDestinationPrefs((prev) => ({
      ...prev,
      [list]: prev[list].includes(destination)
        ? prev[list].filter((d) => d !== destination)
        : [...prev[list], destination],
    }));
  };

  const setDestinations = (list: 'fromDestinations' | 'toDestinations', destinations: string[]) => {
    setDestinationPrefs((prev) => ({
      ...prev,
      [list]: destinations,
    }));
  };

  const addDestinations = (list: 'fromDestinations' | 'toDestinations', destinations: string[]) => {
    setDestinationPrefs((prev) => ({
      ...prev,
      [list]: Array.from(new Set([...prev[list], ...destinations])), // Merge and dedupe
    }));
  };

  // Dynamic rule handlers
  const handleSaveRule = async (rule: Omit<DynamicRule, 'id'> & { id?: string }) => {
    if (rule.id) {
      // Update existing rule
      const res = await fetch(`/api/rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
      if (res.ok) {
        const updated = await res.json();
        setDynamicRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      }
    } else {
      // Create new rule
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rule, clientId }),
      });
      if (res.ok) {
        const created = await res.json();
        setDynamicRules((prev) => [created, ...prev]);
      }
    }
    setShowRuleBuilder(false);
    setEditingRule(null);
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    const res = await fetch(`/api/rules/${ruleId}`, { method: 'DELETE' });
    if (res.ok) {
      setDynamicRules((prev) => prev.filter((r) => r.id !== ruleId));
    }
  };

  const handleToggleRule = async (ruleId: string, isActive: boolean) => {
    const res = await fetch(`/api/rules/${ruleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    });
    if (res.ok) {
      setDynamicRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, isActive } : r))
      );
    }
  };

  const formatCondition = (condition: DynamicRule['condition']) => {
    const parts = condition.conditions.map((c) => {
      let desc = c.field;
      switch (c.operator) {
        case 'eq': desc += ` = ${c.value}`; break;
        case 'neq': desc += ` ≠ ${c.value}`; break;
        case 'gt': desc += ` > ${c.value}`; break;
        case 'lt': desc += ` < ${c.value}`; break;
        case 'changed': desc += ' changed'; break;
        case 'changed_to': desc += ` → ${(c.values || []).join(', ')}`; break;
        case 'changed_from': desc += ` ← ${(c.values || []).join(', ')}`; break;
        default: desc += ` ${c.operator}`;
      }
      return desc;
    });
    return parts.join(` ${condition.logic} `);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8 shadow-xl">
          <div className="animate-pulse flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-600">Loading preferences...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Notification Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Geofence Alerts Section */}
          <section className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <MapPinIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Geofence Alerts</h3>
                  <p className="text-sm text-gray-500">Get notified when vessels enter or exit geofences</p>
                </div>
              </div>
              <Toggle
                enabled={geofencePrefs.enabled}
                onChange={(v) => setGeofencePrefs((prev) => ({ ...prev, enabled: v }))}
              />
            </div>

            {geofencePrefs.enabled && (
              <div className="ml-12 space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  Monitor specific geofences
                  <span className="font-normal text-gray-400 ml-1">(empty = all)</span>
                </label>
                {availableGeofences.length === 0 ? (
                  <p className="text-sm text-gray-400 italic py-3 px-4 bg-gray-50 rounded-lg">
                    No geofences created yet. Draw one on the map first.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availableGeofences.map((geofence) => (
                      <Chip
                        key={geofence.id}
                        label={geofence.name}
                        selected={geofencePrefs.geofenceIds.includes(geofence.id)}
                        onClick={() => toggleGeofence(geofence.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <hr className="border-gray-200" />

          {/* Destination Change Section */}
          <section className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <ArrowsRightLeftIcon className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Destination Changes</h3>
                  <p className="text-sm text-gray-500">Get notified when vessels change their destination</p>
                </div>
              </div>
              <Toggle
                enabled={destinationPrefs.enabled}
                onChange={(v) => setDestinationPrefs((prev) => ({ ...prev, enabled: v }))}
              />
            </div>

            {destinationPrefs.enabled && (
              <div className="ml-12 space-y-4">
                {/* Filter mode toggle */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="destFilter"
                      checked={destinationPrefs.fromDestinations.length === 0 && destinationPrefs.toDestinations.length === 0}
                      onChange={() => setDestinationPrefs(prev => ({ ...prev, fromDestinations: [], toDestinations: [] }))}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm text-gray-700">All destination changes</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="destFilter"
                      checked={destinationPrefs.fromDestinations.length > 0 || destinationPrefs.toDestinations.length > 0}
                      onChange={() => {}}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm text-gray-700">Specific destinations</span>
                  </label>
                </div>

                {/* From Destinations */}
                <DestinationSelector
                  label="Changed from"
                  color="blue"
                  selected={destinationPrefs.fromDestinations}
                  onToggle={(dest) => toggleDestination('fromDestinations', dest)}
                  onAddMultiple={(dests) =>
                    dests.length === 0
                      ? setDestinations('fromDestinations', [])
                      : addDestinations('fromDestinations', dests)
                  }
                />

                {/* To Destinations */}
                <DestinationSelector
                  label="Changed to"
                  color="green"
                  selected={destinationPrefs.toDestinations}
                  onToggle={(dest) => toggleDestination('toDestinations', dest)}
                  onAddMultiple={(dests) =>
                    dests.length === 0
                      ? setDestinations('toDestinations', [])
                      : addDestinations('toDestinations', dests)
                  }
                />
              </div>
            )}
          </section>

          <hr className="border-gray-200" />

          {/* Dynamic Rules Section */}
          <section className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <BoltIcon className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Dynamic Rules</h3>
                  <p className="text-sm text-gray-500">Create custom notification rules with any field conditions</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setEditingRule(null);
                  setShowRuleBuilder(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                Add Rule
              </button>
            </div>

            {/* Rules List */}
            <div className="space-y-2">
              {dynamicRules.length === 0 ? (
                <p className="text-sm text-gray-400 italic py-3 px-4 bg-gray-50 rounded-lg">
                  No dynamic rules created yet. Click "Add Rule" to create one.
                </p>
              ) : (
                dynamicRules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
                      rule.isActive ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium text-sm ${rule.isActive ? 'text-gray-900' : 'text-gray-500'}`}>
                          {rule.name}
                        </span>
                        {!rule.isActive && (
                          <span className="px-1.5 py-0.5 text-xs bg-gray-200 text-gray-600 rounded">
                            Disabled
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {formatCondition(rule.condition)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Toggle
                        enabled={rule.isActive}
                        onChange={(v) => handleToggleRule(rule.id, v)}
                      />
                      <button
                        onClick={() => {
                          setEditingRule(rule);
                          setShowRuleBuilder(true);
                        }}
                        className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-100 rounded transition-colors"
                        title="Edit rule"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded transition-colors"
                        title="Delete rule"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Info Box */}
          <div className="flex gap-3 p-4 bg-gray-50 rounded-lg">
            <InformationCircleIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-600">
              <p className="font-medium text-gray-700 mb-1">How filters work</p>
              <ul className="space-y-1 text-gray-500">
                <li>Empty selection means "match any"</li>
                <li>Multiple selections mean "match any of these"</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Dynamic Rule Builder Modal */}
      {showRuleBuilder && (
        <DynamicRuleBuilder
          rule={editingRule || undefined}
          onSave={handleSaveRule}
          onClose={() => {
            setShowRuleBuilder(false);
            setEditingRule(null);
          }}
        />
      )}
    </div>
  );
}
