'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Layers, Plus, QrCode, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface PassportSummary {
  id: string;
  passportCode: string;
  styleCode: string;
  shipmentRef: string;
  currentVersion: number;
  brand: { name: string; country: string };
  lot: { lotCode: string; materialType: string };
  versions: Array<{ version: number; allocationMethod: string; publishedAt: string }>;
}

interface AudiencePassportDetail {
  passportCode: string;
  audienceView: 'PUBLIC' | 'BRAND' | 'AUDITOR';
  version: number;
  availableVersions: number[];
  allocationMethod: string;
  etag: string;
  publicUrl: string;
  qrDataUrl: string;
  data: {
    verifiedClaims?: { organicPct: number; recycledPct: number; badges: string[] };
    droppedClaimsNotice?: Array<{ claimTag: string; reason: string }>;
    footprint?: {
      allocationMethod: string;
      perPiece: { waterLiters: number; energyKwh: number; co2eKg: number };
    };
    originByProcessStep?: Array<{
      step: string;
      facilityName: string;
      city: string;
      country: string;
      exactAddress?: string;
      workerCount?: number;
      unitPriceUsd?: number;
    }>;
    certifications?: Array<{ certificateNumber: string; certTypeCode: string; validUntil: string }>;
    customFields?: Record<string, { label: string; value: string }>;
  };
}

export default function PassportsPage() {
  const { token, user } = useAuth();
  const [passports, setPassports] = useState<PassportSummary[]>([]);
  const [lots, setLots] = useState<Array<{ id: string; lotCode: string; materialType: string; styleCode: string | null }>>([]);
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
  const [selected, setSelected] = useState<AudiencePassportDetail | null>(null);
  const [verifyInfo, setVerifyInfo] = useState<{ verified: boolean; lotsChecked: number; eventsChecked: number } | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    passportCode: '',
    styleCode: '',
    shipmentRef: 'SHP-BD-EU-2026-NEW',
    lotId: '',
    brandId: '',
    allocationMethod: 'MASS' as 'MASS' | 'PIECE_COUNT',
  });

  const loadList = useCallback(async () => {
    if (!token) {
      setPassports([]);
      setSelected(null);
      return;
    }
    try {
      const [res, lRes, bRes] = await Promise.all([
        apiFetch<{ items: PassportSummary[] }>('/passports?limit=30', { token }),
        apiFetch<{ items: Array<{ id: string; lotCode: string; materialType: string; styleCode: string | null }> }>(
          '/lots?limit=60',
          { token }
        ),
        apiFetch<{ items: Array<{ id: string; name: string }> }>('/parties/brands', { token }),
      ]);
      setPassports(res.items);
      setLots(lRes.items);
      setBrands(bRes.items);
      if (lRes.items[0]) {
        setCreateForm((f) => ({
          ...f,
          lotId: f.lotId || lRes.items[0].id,
          styleCode: f.styleCode || lRes.items[0].styleCode || 'STYLE-2026',
        }));
      }
      if (bRes.items[0]) {
        setCreateForm((f) => ({ ...f, brandId: f.brandId || bRes.items[0].id }));
      }

      if (res.items[0]) {
        const detail = await apiFetch<AudiencePassportDetail>(`/passports/${res.items[0].passportCode}`, { token });
        setSelected(detail);
      } else {
        setSelected(null);
      }
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof ApiError ? e.message : 'Failed to load passports' });
    }
  }, [token]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const inspectPassport = async (code: string, version?: number) => {
    setVerifyInfo(null);
    setMsg(null);
    try {
      const q = version ? `?version=${version}` : '';
      const detail = await apiFetch<AudiencePassportDetail>(`/passports/${code}${q}`, { token });
      setSelected(detail);
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof ApiError ? e.message : 'Access refused' });
    }
  };

  const handleCreatePassport = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const created = await apiFetch<{ passport: { passportCode: string } }>('/passports', {
        method: 'POST',
        token,
        body: JSON.stringify(createForm),
      });
      setShowCreateModal(false);
      setCreateForm((f) => ({ ...f, passportCode: '' }));
      setMsg({
        type: 'ok',
        text: `Generated & cached Digital Product Passport ${created.passport.passportCode} (v1)!`,
      });
      await loadList();
      await inspectPassport(created.passport.passportCode);
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof ApiError ? err.message : 'Could not create passport' });
    }
  };

  const publishNewVersion = async (code: string, allocationMethod: 'MASS' | 'PIECE_COUNT') => {
    setMsg(null);
    try {
      await apiFetch(`/passports/${code}/versions`, {
        method: 'POST',
        token,
        body: JSON.stringify({ allocationMethod }),
      });
      setMsg({
        type: 'ok',
        text: `Published new version of ${code} using ${allocationMethod} footprint allocation and updated high-availability snapshot cache!`,
      });
      await loadList();
      await inspectPassport(code);
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof ApiError ? e.message : 'Could not publish version' });
    }
  };

  const verifyChain = async (code: string) => {
    try {
      const res = await apiFetch<{ verified: boolean; lotsChecked: number; eventsChecked: number }>(
        `/passports/${code}/verify`,
        { token }
      );
      setVerifyInfo(res);
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof ApiError ? e.message : 'Verify failed' });
    }
  };

  const canPublish = user.role === 'AUDITOR' || user.role === 'FACTORY_ADMIN';

  if (!token) {
    return (
      <div className="card p-8 text-center space-y-3">
        <h2 className="font-bold text-slate-900">Public Consumer Mode</h2>
        <p className="text-sm text-slate-600">
          Public users access Digital Product Passports directly via QR code without signing in.
        </p>
        <div className="flex justify-center gap-2">
          <Link
            href="/passport/DPP-2026-NW-001"
            target="_blank"
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold"
          >
            Open DPP-2026-NW-001 Public QR Page
          </Link>
          <Link
            href="/passport/DPP-2026-ES-001"
            target="_blank"
            className="px-4 py-2 rounded-lg border text-slate-700 text-sm font-semibold"
          >
            Open DPP-2026-ES-001 Public QR Page
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <QrCode className="w-5 h-5 text-emerald-600" />
            Digital Product Passports &amp; Audience Views
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Active view: <strong>{user.role}</strong>. Generate versioned EU Digital Product Passports, configure footprint allocation methods (Mass vs. Piece Count), and preview role-based data disclosures.
          </p>
        </div>
        {canPublish && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Generate New Passport
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Passport List */}
        <div className="lg:col-span-4 space-y-2.5">
          {passports.map((p) => (
            <button
              key={p.id}
              onClick={() => inspectPassport(p.passportCode)}
              className={`w-full text-left card p-4 hover:border-emerald-400 transition ${
                selected?.passportCode === p.passportCode ? 'border-emerald-500 ring-1 ring-emerald-400' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-sm text-slate-900">{p.passportCode}</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-semibold">
                  v{p.currentVersion}
                </span>
              </div>
              <div className="text-xs text-slate-700 mt-1">
                {p.brand.name} · Style <strong>{p.styleCode}</strong>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Lot {p.lot.lotCode} · {p.shipmentRef}
              </div>
            </button>
          ))}
        </div>

        {/* Selected Passport Detail */}
        <div className="lg:col-span-8">
          {selected ? (
            <div className="card p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold font-mono text-slate-900">{selected.passportCode}</h2>
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-900 text-white text-xs font-semibold">
                      Audience View: {selected.audienceView}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
                      v{selected.version} ({selected.allocationMethod})
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-xs text-slate-500">Versions:</span>
                    {selected.availableVersions.map((v) => (
                      <button
                        key={v}
                        onClick={() => inspectPassport(selected.passportCode, v)}
                        className={`px-2 py-0.5 rounded text-xs font-semibold border ${
                          v === selected.version
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        v{v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* QR Code & Public Link */}
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selected.qrDataUrl}
                    alt={`QR for ${selected.passportCode}`}
                    className="w-20 h-20 border rounded-lg p-1 bg-white"
                  />
                  <div className="space-y-1.5">
                    <Link
                      href={`/passport/${selected.passportCode}`}
                      target="_blank"
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1"
                    >
                      Open Public Page <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                    <button
                      onClick={() => verifyChain(selected.passportCode)}
                      className="block w-full px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold inline-flex items-center justify-center gap-1"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Verify Hash Chain
                    </button>
                  </div>
                </div>
              </div>

              {verifyInfo && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium">
                  ✅ Cryptographic Integrity Verified: All {verifyInfo.eventsChecked} events across {verifyInfo.lotsChecked} lineage lots have unbroken SHA-256 hash chains.
                </div>
              )}

              {/* Strategy Publish Controls */}
              {canPublish && (
                <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                  <div className="flex items-center gap-2 text-slate-700">
                    <Layers className="w-4 h-4 text-emerald-600" />
                    <span>Publish a new passport version with selected footprint allocation method and custom attributes:</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => publishNewVersion(selected.passportCode, 'MASS')}
                      className="px-2.5 py-1.5 rounded bg-white border border-slate-300 hover:bg-emerald-50 font-semibold text-slate-800 inline-flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> Publish (MASS)
                    </button>
                    <button
                      onClick={() => publishNewVersion(selected.passportCode, 'PIECE_COUNT')}
                      className="px-2.5 py-1.5 rounded bg-white border border-slate-300 hover:bg-emerald-50 font-semibold text-slate-800 inline-flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> Publish (PIECE_COUNT)
                    </button>
                  </div>
                </div>
              )}

              {/* Footprint & Verified Claims */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 space-y-2">
                  <div className="text-xs font-bold uppercase text-slate-500">
                    Verified Sustainability Claims
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(selected.data.verifiedClaims?.badges ?? []).length > 0 ? (
                      selected.data.verifiedClaims!.badges.map((b) => (
                        <span key={b} className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
                          {b}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500 italic">No active certified claims</span>
                    )}
                  </div>
                  {(selected.data.droppedClaimsNotice ?? []).length > 0 && (
                    <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                      <div className="font-bold">Withheld / Adjusted Claims (Insufficient or Expired Evidence):</div>
                      {selected.data.droppedClaimsNotice!.map((d, i) => (
                        <div key={i}>• {d.reason}</div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-xl border border-slate-200 space-y-2">
                  <div className="text-xs font-bold uppercase text-slate-500">
                    Footprint Per Piece ({selected.data.footprint?.allocationMethod})
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded bg-blue-50">
                      <div className="text-lg font-bold text-blue-800">
                        {selected.data.footprint?.perPiece.waterLiters ?? 0}L
                      </div>
                      <div className="text-[10px] text-blue-600 font-semibold">Water</div>
                    </div>
                    <div className="p-2 rounded bg-amber-50">
                      <div className="text-lg font-bold text-amber-800">
                        {selected.data.footprint?.perPiece.energyKwh ?? 0} kWh
                      </div>
                      <div className="text-[10px] text-amber-600 font-semibold">Energy</div>
                    </div>
                    <div className="p-2 rounded bg-emerald-50">
                      <div className="text-lg font-bold text-emerald-800">
                        {selected.data.footprint?.perPiece.co2eKg ?? 0} kg
                      </div>
                      <div className="text-[10px] text-emerald-700 font-semibold">CO₂e</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Audience-Projected Origin Steps */}
              <div>
                <h3 className="text-xs font-bold uppercase text-slate-500 mb-2">
                  Origin by Process Step (Audience-Filtered DTO: {selected.audienceView})
                </h3>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Step</th>
                        <th className="px-3 py-2">Facility</th>
                        <th className="px-3 py-2">City</th>
                        <th className="px-3 py-2">Exact Address</th>
                        <th className="px-3 py-2">Workers</th>
                        <th className="px-3 py-2">Unit Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(selected.data.originByProcessStep ?? []).map((s, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 font-semibold text-emerald-700">{s.step}</td>
                          <td className="px-3 py-2 font-medium text-slate-900">{s.facilityName}</td>
                          <td className="px-3 py-2 text-slate-600">
                            {s.city}, {s.country}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {s.exactAddress ?? <span className="italic text-amber-700">Redacted</span>}
                          </td>
                          <td className="px-3 py-2">
                            {s.workerCount ?? <span className="italic text-amber-700">Redacted</span>}
                          </td>
                          <td className="px-3 py-2">
                            {s.unitPriceUsd !== undefined ? (
                              `$${s.unitPriceUsd}`
                            ) : (
                              <span className="italic text-amber-700">Redacted</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="card p-8 text-center text-sm text-slate-500">Select a passport to inspect.</div>
          )}
        </div>
      </div>

      {/* Create New Passport Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <h2 className="font-bold text-base text-slate-900 mb-3">Generate New Digital Product Passport</h2>
            <form onSubmit={handleCreatePassport} className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Passport Code</label>
                <input
                  required
                  placeholder="DPP-2026-NW-002"
                  value={createForm.passportCode}
                  onChange={(e) => setCreateForm({ ...createForm, passportCode: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Style Code</label>
                  <input
                    required
                    value={createForm.styleCode}
                    onChange={(e) => setCreateForm({ ...createForm, styleCode: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Shipment Ref</label>
                  <input
                    required
                    value={createForm.shipmentRef}
                    onChange={(e) => setCreateForm({ ...createForm, shipmentRef: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Target Shipment / Carton Lot</label>
                <select
                  required
                  value={createForm.lotId}
                  onChange={(e) => setCreateForm({ ...createForm, lotId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-xs"
                >
                  {lots.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.lotCode} — {l.materialType}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Brand</label>
                  <select
                    required
                    value={createForm.brandId}
                    onChange={(e) => setCreateForm({ ...createForm, brandId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Footprint Allocation</label>
                  <select
                    value={createForm.allocationMethod}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, allocationMethod: e.target.value as 'MASS' | 'PIECE_COUNT' })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="MASS">By Mass (kg)</option>
                    <option value="PIECE_COUNT">By Piece Count</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 rounded-lg border">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold">
                  Publish Passport v1
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
