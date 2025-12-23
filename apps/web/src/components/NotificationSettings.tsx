'use client';

import { useState, useEffect, useRef } from 'react';
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
        enabled ? 'bg-cyan-500' : 'bg-slate-600'
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
  color = 'cyan',
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  color?: 'cyan' | 'emerald';
}) {
  const colors = {
    cyan: selected
      ? 'bg-cyan-500 text-white border-cyan-500'
      : 'bg-slate-700 text-slate-300 border-slate-600 hover:border-cyan-400',
    emerald: selected
      ? 'bg-emerald-500 text-white border-emerald-500'
      : 'bg-slate-700 text-slate-300 border-slate-600 hover:border-emerald-400',
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

// Destination selector with floating dropdown
function DestinationSelector({
  label,
  color,
  selected,
  onToggle,
  onAddMultiple,
}: {
  label: string;
  color: 'cyan' | 'emerald';
  selected: string[];
  onToggle: (dest: string) => void;
  onAddMultiple: (dests: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch destinations from API when search changes
  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }

    const fetchDestinations = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '50', search: search.trim() });
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

  const accentColor = color === 'cyan' ? 'cyan' : 'emerald';
  const unselectedResults = results.filter((r) => !selected.includes(r));

  // Generate wildcard pattern from search term
  const wildcardPattern = search.trim() ? `*${search.trim()}*` : '';
  const hasWildcard = wildcardPattern && selected.includes(wildcardPattern);

  const handleSelect = (dest: string) => {
    onToggle(dest);
    setSearch('');
    setIsOpen(false);
  };

  const handleAddWildcard = () => {
    if (wildcardPattern && !selected.includes(wildcardPattern)) {
      onAddMultiple([...selected, wildcardPattern]);
      setSearch('');
      setIsOpen(false);
    }
  };

  const handleAddAll = () => {
    onAddMultiple([...selected, ...unselectedResults]);
    setSearch('');
    setIsOpen(false);
  };

  // Check if a value is a wildcard pattern
  const isWildcard = (value: string) => value.includes('*');

  return (
    <div ref={containerRef} className="relative">
      {/* Label row */}
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-slate-300">
          {label}
          {selected.length > 0 && (
            <span className={`ml-2 text-xs font-normal text-${accentColor}-400`}>
              ({selected.length} selected)
            </span>
          )}
        </label>
        {selected.length > 0 && (
          <button
            onClick={() => onAddMultiple([])}
            className="text-xs text-slate-400 hover:text-red-400"
          >
            Clear
          </button>
        )}
      </div>

      {/* Selected chips - compact display */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {selected.map((dest) => {
            const wild = isWildcard(dest);
            return (
              <span
                key={dest}
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${
                  wild
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : `bg-${accentColor}-500/20 text-${accentColor}-300 border border-${accentColor}-500/30`
                }`}
              >
                {wild && <span className="text-amber-400 font-mono">⁕</span>}
                {dest}
                <button
                  onClick={() => onToggle(dest)}
                  className={wild ? 'hover:text-amber-100' : `hover:text-${accentColor}-100`}
                >
                  <XMarkIcon className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search and add destinations..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="w-full pl-8 pr-3 py-2 text-sm border border-slate-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-500 bg-slate-800 text-white placeholder-slate-500"
        />
        {loading && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-slate-500 border-t-cyan-400 rounded-full animate-spin" />
        )}

        {/* Floating dropdown */}
        {isOpen && search.trim() && (
          <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-64 overflow-y-auto">
            {/* Wildcard option - always shown first */}
            {!hasWildcard && (
              <button
                onClick={handleAddWildcard}
                className="w-full px-3 py-2 text-left text-sm font-medium text-amber-400 hover:bg-amber-900/30 border-b border-slate-700 flex items-center gap-2"
              >
                <span className="font-mono">⁕</span>
                <span>Add wildcard: <code className="bg-slate-700 px-1.5 py-0.5 rounded text-amber-300">{wildcardPattern}</code></span>
                <span className="text-xs text-slate-500 ml-auto">matches any containing "{search.trim()}"</span>
              </button>
            )}

            {loading ? (
              <div className="px-3 py-2 text-sm text-slate-500">Searching...</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500">No exact matches found</div>
            ) : (
              <>
                {/* Add all option */}
                {unselectedResults.length > 1 && (
                  <button
                    onClick={handleAddAll}
                    className={`w-full px-3 py-2 text-left text-sm font-medium text-${accentColor}-400 hover:bg-slate-700 border-b border-slate-700`}
                  >
                    + Add all {unselectedResults.length} exact matches
                  </button>
                )}
                {/* Individual results */}
                {results.map((dest) => {
                  const isSelected = selected.includes(dest);
                  return (
                    <button
                      key={dest}
                      onClick={() => handleSelect(dest)}
                      disabled={isSelected}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-700 flex items-center justify-between ${
                        isSelected ? 'text-slate-500' : 'text-slate-200'
                      }`}
                    >
                      <span>{dest}</span>
                      {isSelected && (
                        <CheckIcon className="w-4 h-4 text-emerald-400" />
                      )}
                    </button>
                  );
                })}
                {results.length >= 50 && (
                  <div className="px-3 py-2 text-xs text-slate-500 border-t border-slate-700">
                    Showing first 50 results
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Helper text when nothing selected */}
      {selected.length === 0 && !isOpen && (
        <p className="text-xs text-slate-500 mt-1">Leave empty to match any destination</p>
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
      <>
        <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
        <div className="fixed right-0 top-0 h-full w-[28rem] bg-slate-900 shadow-2xl z-50 flex items-center justify-center animate-slide-in">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-slate-300">Loading preferences...</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[28rem] bg-slate-900 shadow-2xl z-50 flex flex-col animate-slide-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between bg-slate-800">
          <h2 className="text-lg font-semibold text-white">Notification Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
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
                <div className="p-2 bg-cyan-900/50 rounded-lg">
                  <MapPinIcon className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="font-medium text-white">Geofence Alerts</h3>
                  <p className="text-sm text-slate-400">Get notified when vessels enter or exit geofences</p>
                </div>
              </div>
              <Toggle
                enabled={geofencePrefs.enabled}
                onChange={(v) => setGeofencePrefs((prev) => ({ ...prev, enabled: v }))}
              />
            </div>

            {geofencePrefs.enabled && (
              <div className="ml-12 space-y-3">
                <label className="block text-sm font-medium text-slate-300">
                  Monitor specific geofences
                  <span className="font-normal text-slate-500 ml-1">(empty = all)</span>
                </label>
                {availableGeofences.length === 0 ? (
                  <p className="text-sm text-slate-500 italic py-3 px-4 bg-slate-800 rounded-lg">
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
                        color="cyan"
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <hr className="border-slate-700" />

          {/* Destination Change Section */}
          <section className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-900/50 rounded-lg">
                  <ArrowsRightLeftIcon className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-medium text-white">Destination Changes</h3>
                  <p className="text-sm text-slate-400">Get notified when vessels change their destination</p>
                </div>
              </div>
              <Toggle
                enabled={destinationPrefs.enabled}
                onChange={(v) => setDestinationPrefs((prev) => ({ ...prev, enabled: v }))}
              />
            </div>

            {destinationPrefs.enabled && (
              <div className="ml-12 space-y-4">
                {/* From Destinations */}
                <DestinationSelector
                  label="Changed from"
                  color="cyan"
                  selected={destinationPrefs.fromDestinations}
                  onToggle={(dest) => toggleDestination('fromDestinations', dest)}
                  onAddMultiple={(dests) => setDestinations('fromDestinations', dests)}
                />

                {/* To Destinations */}
                <DestinationSelector
                  label="Changed to"
                  color="emerald"
                  selected={destinationPrefs.toDestinations}
                  onToggle={(dest) => toggleDestination('toDestinations', dest)}
                  onAddMultiple={(dests) => setDestinations('toDestinations', dests)}
                />
              </div>
            )}
          </section>

          <hr className="border-slate-700" />

          {/* Dynamic Rules Section */}
          <section className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-900/50 rounded-lg">
                  <BoltIcon className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-medium text-white">Dynamic Rules</h3>
                  <p className="text-sm text-slate-400">Create custom notification rules with any field conditions</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setEditingRule(null);
                  setShowRuleBuilder(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-purple-300 hover:bg-purple-900/50 rounded-lg transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                Add Rule
              </button>
            </div>

            {/* Rules List */}
            <div className="space-y-2">
              {dynamicRules.length === 0 ? (
                <p className="text-sm text-slate-500 italic py-3 px-4 bg-slate-800 rounded-lg">
                  No dynamic rules created yet. Click "Add Rule" to create one.
                </p>
              ) : (
                dynamicRules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
                      rule.isActive ? 'bg-purple-900/30 border-purple-700' : 'bg-slate-800 border-slate-700'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium text-sm ${rule.isActive ? 'text-white' : 'text-slate-500'}`}>
                          {rule.name}
                        </span>
                        {!rule.isActive && (
                          <span className="px-1.5 py-0.5 text-xs bg-slate-700 text-slate-400 rounded">
                            Disabled
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
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
                        className="p-1.5 text-slate-400 hover:text-purple-400 hover:bg-purple-900/50 rounded transition-colors"
                        title="Edit rule"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/30 rounded transition-colors"
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
          <div className="flex gap-3 p-4 bg-slate-800 rounded-lg border border-slate-700">
            <InformationCircleIcon className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-slate-200 mb-1">How filters work</p>
              <ul className="space-y-1 text-slate-400">
                <li>Empty selection means "match any"</li>
                <li>Multiple selections mean "match any of these"</li>
              </ul>
            </div>
          </div>
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
            className="px-4 py-2 text-sm font-medium text-slate-900 bg-cyan-500 hover:bg-cyan-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && (
              <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
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
    </>
  );
}
