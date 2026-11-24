'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Factory, Lock, Plus } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface PartyItem {
  id: string;
  code: string;
  name: string;
  type: string;
  country: string;
  city: string;
  exactAddress?: string;
  workerCount?: number;
  unitPriceUsd?: number;
  contactEmail?: string;
  productionLines?: Array<{ id: string; code: string; name: string; processType: string; capacityPerDay: number }>;
}

export default function PartiesPage() {
  const { token, user } = useAuth();
  const [parties, setParties] = useState<PartyItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showLineModal, setShowLineModal] = useState(false);

  const [form, setForm] = useState({
    code: '',
    name: '',
    type: 'SPINNING_MILL',
    country: 'Bangladesh',
    city: 'Dhaka',
    exactAddress: '',
    workerCount: '350',
    unitPriceUsd: '2.5',
    contactEmail: '',
  });

  const [lineForm, setLineForm] = useState({
    code: '',
    name: '',
    partyId: '',
    processType: 'SEW',
    capacityPerDay: '1200',
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch<{ items: PartyItem[] }>('/parties?limit=50', { token });
      setParties(res.items);
      const defaultFactory = res.items.find((p) => p.type === 'FACTORY') ?? res.items[0];
      if (defaultFactory) {
        setLineForm((f) => ({ ...f, partyId: f.partyId || defaultFactory.id }));
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load parties');
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      await apiFetch('/parties', {
        method: 'POST',
        token,
        body: JSON.stringify({
          ...form,
          workerCount: Number(form.workerCount),
          unitPriceUsd: Number(form.unitPriceUsd),
        }),
      });
      setShowModal(false);
      setSuccess(`Registered facility ${form.code.toUpperCase()} successfully!`);
      setForm({
        code: '',
        name: '',
        type: 'SPINNING_MILL',
        country: 'Bangladesh',
        city: 'Dhaka',
        exactAddress: '',
        workerCount: '350',
        unitPriceUsd: '2.5',
        contactEmail: '',
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create party');
    }
  };

  const handleCreateLine = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      await apiFetch('/parties/lines', {
        method: 'POST',
        token,
        body: JSON.stringify({
          ...lineForm,
          capacityPerDay: Number(lineForm.capacityPerDay),
        }),
      });
      setShowLineModal(false);
      setSuccess(`Added production line ${lineForm.code.toUpperCase()}!`);
      setLineForm((f) => ({ ...f, code: '', name: '', capacityPerDay: '1200' }));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create production line');
    }
  };

  const canCreate = user.role === 'AUDITOR' || user.role === 'FACTORY_ADMIN';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-600" />
            Parties, Suppliers &amp; Production Lines
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage spinning mills, fabric mills, dye houses, wash plants, trims suppliers, and factory production lines. Role-based access automatically redacts confidential pricing and workforce fields for external audiences (active role: <strong>{user.role}</strong>).
          </p>
        </div>
        {canCreate && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowLineModal(true)}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold inline-flex items-center gap-1.5"
            >
              <Factory className="w-4 h-4 text-emerald-600" /> Add Production Line
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Register Party
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{success}</div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Facility Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">
                <span className="inline-flex items-center gap-1">
                  <Lock className="w-3 h-3 text-amber-600" /> Exact Address
                </span>
              </th>
              <th className="px-4 py-3">
                <span className="inline-flex items-center gap-1">
                  <Lock className="w-3 h-3 text-amber-600" /> Workers
                </span>
              </th>
              <th className="px-4 py-3">
                <span className="inline-flex items-center gap-1">
                  <Lock className="w-3 h-3 text-amber-600" /> Unit Price
                </span>
              </th>
              <th className="px-4 py-3">Lines</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {parties.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-800">{p.code}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                    {p.type}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {p.city}, {p.country}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {p.exactAddress ?? <span className="text-amber-700 font-medium italic">Hidden (Confidential)</span>}
                </td>
                <td className="px-4 py-3 text-xs">
                  {p.workerCount !== undefined ? (
                    p.workerCount
                  ) : (
                    <span className="text-amber-700 font-medium italic">Hidden</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  {p.unitPriceUsd !== undefined ? (
                    `$${p.unitPriceUsd.toFixed(2)}`
                  ) : (
                    <span className="text-amber-700 font-medium italic">Hidden</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  {p.productionLines && p.productionLines.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {p.productionLines.map((l) => (
                        <span
                          key={l.id}
                          title={`${l.name} (${l.processType}, ${l.capacityPerDay}/day)`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200"
                        >
                          <Factory className="w-3 h-3" /> {l.code}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Register Party Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl">
            <h2 className="font-bold text-lg text-slate-900 mb-4">Register Supplier / Factory</h2>
            <form onSubmit={handleCreate} className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Code</label>
                  <input
                    required
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="MILL-DHK-02"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="SPINNING_MILL">SPINNING_MILL</option>
                    <option value="FABRIC_MILL">FABRIC_MILL</option>
                    <option value="DYE_HOUSE">DYE_HOUSE</option>
                    <option value="WASH_PLANT">WASH_PLANT</option>
                    <option value="TRIMS_SUPPLIER">TRIMS_SUPPLIER</option>
                    <option value="FACTORY">FACTORY</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Name</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Dhaka Green Spinning Mill"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">City</label>
                  <input
                    required
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Country</label>
                  <input
                    required
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Exact Address (Confidential)</label>
                <input
                  required
                  value={form.exactAddress}
                  onChange={(e) => setForm({ ...form, exactAddress: e.target.value })}
                  placeholder="Plot 9, BSCIC Gazipur"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Workers</label>
                  <input
                    type="number"
                    required
                    value={form.workerCount}
                    onChange={(e) => setForm({ ...form, workerCount: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Unit Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={form.unitPriceUsd}
                    onChange={(e) => setForm({ ...form, unitPriceUsd: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Contact Email</label>
                  <input
                    type="email"
                    required
                    value={form.contactEmail}
                    onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                    placeholder="ops@mill.bd"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg border text-slate-700"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold">
                  Save Party
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Production Line Modal */}
      {showLineModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <h2 className="font-bold text-lg text-slate-900 mb-4">Add Production Line</h2>
            <form onSubmit={handleCreateLine} className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Factory / Facility</label>
                <select
                  required
                  value={lineForm.partyId}
                  onChange={(e) => setLineForm({ ...lineForm, partyId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Line Code</label>
                  <input
                    required
                    placeholder="SEW-L3"
                    value={lineForm.code}
                    onChange={(e) => setLineForm({ ...lineForm, code: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Process Type</label>
                  <select
                    value={lineForm.processType}
                    onChange={(e) => setLineForm({ ...lineForm, processType: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="CUT">CUT</option>
                    <option value="SEW">SEW</option>
                    <option value="WASH_DYE">WASH_DYE</option>
                    <option value="FINISH">FINISH</option>
                    <option value="PACK">PACK</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Line Name</label>
                <input
                  required
                  placeholder="Knit Sewing Line C"
                  value={lineForm.name}
                  onChange={(e) => setLineForm({ ...lineForm, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Daily Capacity (pcs/day)</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={lineForm.capacityPerDay}
                  onChange={(e) => setLineForm({ ...lineForm, capacityPerDay: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLineModal(false)}
                  className="px-4 py-2 rounded-lg border text-slate-700"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold">
                  Save Line
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
