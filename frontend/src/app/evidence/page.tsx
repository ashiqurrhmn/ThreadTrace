'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Award, Download, Plus, RefreshCw, ZapOff } from 'lucide-react';
import { API_BASE, apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface EvidenceItem {
  id: string;
  certificateNumber: string;
  certTypeCode: string;
  issuer: string;
  scope: string;
  validFrom: string;
  validUntil: string;
  status: string;
  claimTag: string | null;
  certifiedPercent: number;
  fileName: string | null;
  certType?: { name: string };
  party?: { name: string; code: string } | null;
  lot?: { lotCode: string } | null;
}

export default function EvidencePage() {
  const { token, user } = useAuth();
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [certTypes, setCertTypes] = useState<Array<{ code: string; name: string }>>([]);
  const [parties, setParties] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    certificateNumber: '',
    certTypeCode: 'GOTS',
    issuer: 'Control Union',
    scope: 'Certified textile production batch',
    partyId: '',
    validFrom: new Date().toISOString().slice(0, 10),
    validUntil: new Date(Date.now() + 20 * 86400 * 1000).toISOString().slice(0, 10),
    certifiedPercent: '100',
  });

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [evRes, cfgRes, pRes] = await Promise.all([
        apiFetch<{ items: EvidenceItem[] }>('/evidences?limit=50', { token }),
        apiFetch<{ certificateTypes: Array<{ code: string; name: string }> }>('/config', { token }),
        apiFetch<{ items: Array<{ id: string; code: string; name: string }> }>('/parties?limit=50', { token }),
      ]);
      setItems(evRes.items);
      setCertTypes(cfgRes.certificateTypes);
      setParties(pRes.items);
      if (pRes.items[0]) setForm((f) => ({ ...f, partyId: f.partyId || pRes.items[0].id }));
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof ApiError ? e.message : 'Failed to load certificates' });
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append('file', file);

      await apiFetch('/evidences', {
        method: 'POST',
        token,
        body: fd,
      });
      setShowModal(false);
      setFile(null);
      setMsg({ type: 'ok', text: `Certificate ${form.certificateNumber} uploaded & attached!` });
      await load();
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof ApiError ? err.message : 'Upload failed' });
    }
  };

  const handleSimulateExpire = async (ev: EvidenceItem) => {
    setMsg(null);
    try {
      await apiFetch(`/evidences/${ev.id}/simulate-expire`, { method: 'POST', token });
      setMsg({
        type: 'ok',
        text: `Certificate ${ev.certificateNumber} EXPIRED! Dependent passports were automatically republished without the ${ev.claimTag ?? ''} claim.`,
      });
      await load();
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof ApiError ? e.message : 'Failed to expire certificate' });
    }
  };

  const handleRenew = async (ev: EvidenceItem) => {
    setMsg(null);
    try {
      await apiFetch(`/evidences/${ev.id}/renew`, {
        method: 'POST',
        token,
        body: JSON.stringify({ extendDays: 180 }),
      });
      setMsg({
        type: 'ok',
        text: `Certificate ${ev.certificateNumber} renewed (+180 days) and passports recalculated!`,
      });
      await load();
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof ApiError ? e.message : 'Failed to renew certificate' });
    }
  };

  const canManage = user.role === 'AUDITOR' || user.role === 'FACTORY_ADMIN';

  if (!token) {
    return (
      <div className="card p-8 text-center text-sm text-slate-600">
        Switch to <strong>Auditor</strong> or <strong>Factory Admin</strong> in the top bar to manage certificates and test auto-expiry claim drops.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-600" />
            Certificates, Test Reports &amp; Validity Monitoring
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Attach compliance certificates and lab test reports to suppliers or material lots. Expiring certificates trigger 30-day renewal alerts, and expired certificates automatically revoke dependent sustainability claims on published passports.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowModal(true)}
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Attach Certificate / PDF
          </button>
        )}
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

      <div className="card overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Certificate #</th>
              <th className="px-4 py-3">Type / Claim</th>
              <th className="px-4 py-3">Issuer &amp; Target</th>
              <th className="px-4 py-3">Valid Until</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((ev) => (
              <tr key={ev.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-3 font-mono text-xs font-bold text-slate-900">{ev.certificateNumber}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-800 text-xs">{ev.certTypeCode}</div>
                  {ev.claimTag && (
                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
                      Supports {ev.claimTag} ({ev.certifiedPercent}%)
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="font-medium text-slate-800">{ev.issuer}</div>
                  <div className="text-slate-500">
                    {ev.party?.name ?? ''} {ev.lot ? `· Lot ${ev.lot.lotCode}` : ''}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs font-mono text-slate-700">{ev.validUntil.slice(0, 10)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      ev.status === 'VALID'
                        ? 'bg-emerald-100 text-emerald-700'
                        : ev.status === 'EXPIRING_SOON'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {ev.status === 'EXPIRING_SOON' && <AlertTriangle className="w-3 h-3" />}
                    {ev.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ev.fileName && (
                      <a
                        href={`${API_BASE}/evidences/${ev.id}/file`}
                        onClick={async (e) => {
                          e.preventDefault();
                          const res = await fetch(`${API_BASE}/evidences/${ev.id}/file`, {
                            headers: { Authorization: `Bearer ${token}` },
                          });
                          const blob = await res.blob();
                          window.open(URL.createObjectURL(blob), '_blank');
                        }}
                        className="px-2 py-1 rounded border text-xs text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" /> PDF
                      </a>
                    )}
                    {canManage && ev.status !== 'EXPIRED' && (
                      <button
                        onClick={() => handleSimulateExpire(ev)}
                        className="px-2 py-1 rounded bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <ZapOff className="w-3 h-3" /> Mark Expired
                      </button>
                    )}
                    {canManage && ev.status === 'EXPIRED' && (
                      <button
                        onClick={() => handleRenew(ev)}
                        className="px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" /> Renew +180d
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl">
            <h2 className="font-bold text-base text-slate-900 mb-4">Attach Certificate / Test Report</h2>
            <form onSubmit={handleUpload} className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Certificate Number</label>
                  <input
                    required
                    value={form.certificateNumber}
                    onChange={(e) => setForm({ ...form, certificateNumber: e.target.value })}
                    placeholder="GOTS-BD-2026-9999"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Certificate Type (Config)</label>
                  <select
                    value={form.certTypeCode}
                    onChange={(e) => setForm({ ...form, certTypeCode: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    {certTypes.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Issuer</label>
                  <input
                    required
                    value={form.issuer}
                    onChange={(e) => setForm({ ...form, issuer: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Supplier / Facility</label>
                  <select
                    value={form.partyId}
                    onChange={(e) => setForm({ ...form, partyId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    {parties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Scope</label>
                <input
                  required
                  value={form.scope}
                  onChange={(e) => setForm({ ...form, scope: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Valid From</label>
                  <input
                    type="date"
                    required
                    value={form.validFrom}
                    onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Valid Until</label>
                  <input
                    type="date"
                    required
                    value={form.validUntil}
                    onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Certified %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.certifiedPercent}
                    onChange={(e) => setForm({ ...form, certifiedPercent: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Certificate File (PDF / Image)</label>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="w-full text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold">
                  Upload Evidence
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
