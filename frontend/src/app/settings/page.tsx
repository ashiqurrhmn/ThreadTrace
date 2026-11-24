'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Save, Settings } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface ProcessConfig {
  code: string;
  label: string;
  sequenceOrder: number;
  maxLossPercent: number;
  enforcementMode: 'BLOCK' | 'FLAG';
  waterLitersPerKg: number;
  energyKwhPerKg: number;
  co2eKgPerKg: number;
}

interface CertTypeConfig {
  code: string;
  name: string;
  claimTag: string | null;
  defaultValidityDays: number;
}

interface CustomField {
  key: string;
  label: string;
  defaultValue?: string;
}

export default function SettingsPage() {
  const { token, user } = useAuth();
  const [processes, setProcesses] = useState<ProcessConfig[]>([]);
  const [certTypes, setCertTypes] = useState<CertTypeConfig[]>([]);
  const [allocationMethod, setAllocationMethod] = useState<'MASS' | 'PIECE_COUNT'>('MASS');
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [newProc, setNewProc] = useState({
    code: '',
    label: '',
    sequenceOrder: '8',
    maxLossPercent: '3',
    enforcementMode: 'FLAG' as 'BLOCK' | 'FLAG',
    waterLitersPerKg: '5',
    energyKwhPerKg: '1.2',
    co2eKgPerKg: '0.85',
  });

  const [newCert, setNewCert] = useState({
    code: '',
    name: '',
    claimTag: 'FAIR_LABOR',
    defaultValidityDays: '365',
  });

  const [newField, setNewField] = useState({ key: '', label: '', defaultValue: '' });

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{
        processConfigs: ProcessConfig[];
        certificateTypes: CertTypeConfig[];
        settings: Record<string, unknown>;
      }>('/config', { token });
      setProcesses(res.processConfigs);
      setCertTypes(res.certificateTypes);
      setAllocationMethod(res.settings.allocation_method === 'PIECE_COUNT' ? 'PIECE_COUNT' : 'MASS');
      setCustomFields(Array.isArray(res.settings.passport_custom_fields) ? (res.settings.passport_custom_fields as CustomField[]) : []);
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const canEdit = user.role === 'AUDITOR' || user.role === 'FACTORY_ADMIN';

  const saveProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await apiFetch('/config/processes', {
        method: 'PUT',
        token,
        body: JSON.stringify({
          ...newProc,
          sequenceOrder: Number(newProc.sequenceOrder),
          maxLossPercent: Number(newProc.maxLossPercent),
          waterLitersPerKg: Number(newProc.waterLitersPerKg),
          energyKwhPerKg: Number(newProc.energyKwhPerKg),
          co2eKgPerKg: Number(newProc.co2eKgPerKg),
        }),
      });
      setNewProc({
        code: '',
        label: '',
        sequenceOrder: String(processes.length + 2),
        maxLossPercent: '3',
        enforcementMode: 'FLAG',
        waterLitersPerKg: '5',
        energyKwhPerKg: '1.2',
        co2eKgPerKg: '0.85',
      });
      setMsg({ type: 'ok', text: 'Process step & emission factor saved via configuration alone (QA5)!' });
      await load();
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof ApiError ? err.message : 'Save failed' });
    }
  };

  const saveCertType = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await apiFetch('/config/cert-types', {
        method: 'PUT',
        token,
        body: JSON.stringify({
          ...newCert,
          defaultValidityDays: Number(newCert.defaultValidityDays),
        }),
      });
      setNewCert({ code: '', name: '', claimTag: 'FAIR_LABOR', defaultValidityDays: '365' });
      setMsg({ type: 'ok', text: 'New certificate type added via configuration alone (QA5)!' });
      await load();
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof ApiError ? err.message : 'Save failed' });
    }
  };

  const addCustomField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newField.key.trim() || !newField.label.trim()) return;
    setMsg(null);
    try {
      const updated = [...customFields, { ...newField }];
      await apiFetch('/config/custom-passport-fields', {
        method: 'PUT',
        token,
        body: JSON.stringify({ fields: updated }),
      });
      setNewField({ key: '', label: '', defaultValue: '' });
      setMsg({
        type: 'ok',
        text: 'Custom passport field added! Republish any passport to see it live without editing lineage or mass-balance code (QA5).',
      });
      await load();
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof ApiError ? err.message : 'Save failed' });
    }
  };

  const updateAllocation = async (method: 'MASS' | 'PIECE_COUNT') => {
    setMsg(null);
    try {
      await apiFetch('/config/allocation-method', {
        method: 'PUT',
        token,
        body: JSON.stringify({ method }),
      });
      setAllocationMethod(method);
      setMsg({ type: 'ok', text: `Default footprint allocation strategy updated to ${method} (FR6 / QA5).` });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof ApiError ? err.message : 'Update failed' });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Settings className="w-5 h-5 text-emerald-600" />
          Config-Driven Adaptability Rules (QA5)
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Add new process steps, loss limits, emission factors, certificate types, or custom passport fields <strong>through configuration alone</strong> — zero code edits or server restarts!
        </p>
      </div>

      {msg && (
        <div
          className={`p-3.5 rounded-lg text-sm border ${
            msg.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Default Allocation Strategy */}
      <div className="card p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-bold text-sm text-slate-900">Default Footprint Allocation Strategy (FR6 Strategy Pattern)</div>
          <div className="text-xs text-slate-500">Controls how Water, Energy &amp; CO₂e split across multi-child lots.</div>
        </div>
        <div className="flex gap-2">
          {(['MASS', 'PIECE_COUNT'] as const).map((m) => (
            <button
              key={m}
              disabled={!canEdit}
              onClick={() => updateAllocation(m)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border ${
                allocationMethod === m
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {m === 'MASS' ? 'By Mass (kg)' : 'By Piece Count'}
            </button>
          ))}
        </div>
      </div>

      {/* Process Steps & Emission Factors */}
      <div className="card p-5 space-y-4">
        <h2 className="font-bold text-sm text-slate-900">Process Steps, Max Loss Limits &amp; Emission Factors</h2>
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b text-slate-500">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">Max Loss</th>
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2">Water (L/kg)</th>
                <th className="px-3 py-2">Energy (kWh/kg)</th>
                <th className="px-3 py-2">CO₂e (kg/kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {processes.map((p) => (
                <tr key={p.code}>
                  <td className="px-3 py-2 font-mono font-bold text-slate-900">{p.code}</td>
                  <td className="px-3 py-2">{p.label}</td>
                  <td className="px-3 py-2 font-semibold">{p.maxLossPercent}%</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                        p.enforcementMode === 'BLOCK' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {p.enforcementMode}
                    </span>
                  </td>
                  <td className="px-3 py-2">{p.waterLitersPerKg}</td>
                  <td className="px-3 py-2">{p.energyKwhPerKg}</td>
                  <td className="px-3 py-2">{p.co2eKgPerKg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canEdit && (
          <form onSubmit={saveProcess} className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 text-xs">
            <input
              required
              placeholder="Code (e.g. EMBROIDERY)"
              value={newProc.code}
              onChange={(e) => setNewProc({ ...newProc, code: e.target.value })}
              className="px-2.5 py-2 border rounded-lg"
            />
            <input
              required
              placeholder="Label"
              value={newProc.label}
              onChange={(e) => setNewProc({ ...newProc, label: e.target.value })}
              className="px-2.5 py-2 border rounded-lg"
            />
            <input
              type="number"
              step="0.1"
              placeholder="Max Loss %"
              value={newProc.maxLossPercent}
              onChange={(e) => setNewProc({ ...newProc, maxLossPercent: e.target.value })}
              className="px-2.5 py-2 border rounded-lg"
            />
            <select
              value={newProc.enforcementMode}
              onChange={(e) => setNewProc({ ...newProc, enforcementMode: e.target.value as 'BLOCK' | 'FLAG' })}
              className="px-2.5 py-2 border rounded-lg"
            >
              <option value="BLOCK">BLOCK</option>
              <option value="FLAG">FLAG</option>
            </select>
            <input
              type="number"
              step="0.1"
              placeholder="Water L/kg"
              value={newProc.waterLitersPerKg}
              onChange={(e) => setNewProc({ ...newProc, waterLitersPerKg: e.target.value })}
              className="px-2.5 py-2 border rounded-lg"
            />
            <input
              type="number"
              step="0.1"
              placeholder="Energy kWh/kg"
              value={newProc.energyKwhPerKg}
              onChange={(e) => setNewProc({ ...newProc, energyKwhPerKg: e.target.value })}
              className="px-2.5 py-2 border rounded-lg"
            />
            <input
              type="number"
              step="0.1"
              placeholder="CO2e kg/kg"
              value={newProc.co2eKgPerKg}
              onChange={(e) => setNewProc({ ...newProc, co2eKgPerKg: e.target.value })}
              className="px-2.5 py-2 border rounded-lg"
            />
            <button type="submit" className="px-3 py-2 rounded-lg bg-emerald-600 text-white font-semibold inline-flex items-center justify-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add / Update Step
            </button>
          </form>
        )}
      </div>

      {/* Certificate Types & Custom Passport Fields */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5 space-y-3">
          <h2 className="font-bold text-sm text-slate-900">Certificate Types ({certTypes.length})</h2>
          <div className="space-y-1.5 text-xs">
            {certTypes.map((c) => (
              <div key={c.code} className="p-2.5 rounded-lg bg-slate-50 border flex justify-between">
                <div>
                  <span className="font-mono font-bold text-slate-900">{c.code}</span> — {c.name}
                </div>
                <span className="text-emerald-700 font-semibold">{c.claimTag ?? 'INFO'}</span>
              </div>
            ))}
          </div>
          {canEdit && (
            <form onSubmit={saveCertType} className="grid grid-cols-2 gap-2 pt-2 text-xs">
              <input
                required
                placeholder="Code (e.g. FAIRTRADE)"
                value={newCert.code}
                onChange={(e) => setNewCert({ ...newCert, code: e.target.value })}
                className="px-2.5 py-2 border rounded-lg"
              />
              <input
                required
                placeholder="Display Name"
                value={newCert.name}
                onChange={(e) => setNewCert({ ...newCert, name: e.target.value })}
                className="px-2.5 py-2 border rounded-lg"
              />
              <input
                placeholder="Claim Tag (e.g. FAIR_LABOR)"
                value={newCert.claimTag}
                onChange={(e) => setNewCert({ ...newCert, claimTag: e.target.value })}
                className="px-2.5 py-2 border rounded-lg"
              />
              <button type="submit" className="px-3 py-2 rounded-lg bg-emerald-600 text-white font-semibold inline-flex items-center justify-center gap-1">
                <Save className="w-3.5 h-3.5" /> Save Cert Type
              </button>
            </form>
          )}
        </div>

        <div className="card p-5 space-y-3">
          <h2 className="font-bold text-sm text-slate-900">Custom Passport Fields (QA5 Decoupled Builder)</h2>
          <div className="space-y-1.5 text-xs">
            {customFields.map((f) => (
              <div key={f.key} className="p-2.5 rounded-lg bg-slate-50 border flex justify-between">
                <div>
                  <span className="font-mono font-bold text-slate-900">{f.key}</span> ({f.label})
                </div>
                <span className="text-slate-600">Default: {f.defaultValue || 'N/A'}</span>
              </div>
            ))}
          </div>
          {canEdit && (
            <form onSubmit={addCustomField} className="grid grid-cols-2 gap-2 pt-2 text-xs">
              <input
                required
                placeholder="Key (e.g. microplasticRating)"
                value={newField.key}
                onChange={(e) => setNewField({ ...newField, key: e.target.value })}
                className="px-2.5 py-2 border rounded-lg"
              />
              <input
                required
                placeholder="Label (e.g. Microplastic Shedding)"
                value={newField.label}
                onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                className="px-2.5 py-2 border rounded-lg"
              />
              <input
                placeholder="Default Value (e.g. Low — Grade A)"
                value={newField.defaultValue}
                onChange={(e) => setNewField({ ...newField, defaultValue: e.target.value })}
                className="px-2.5 py-2 border rounded-lg"
              />
              <button type="submit" className="px-3 py-2 rounded-lg bg-emerald-600 text-white font-semibold inline-flex items-center justify-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add Passport Field
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
