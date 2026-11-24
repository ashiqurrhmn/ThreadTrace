'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, GitMerge, Layers, Plus, RotateCcw, ShieldAlert, ShieldCheck, Split } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { DetailCardSkeleton, SplitPaneSkeleton } from '@/components/Skeleton';

interface LotItem {
  id: string;
  lotCode: string;
  materialType: string;
  styleCode: string | null;
  status: string;
  quantity: number;
  unit: string;
  weightKg: number;
  claimedOrganicPct: number;
  claimedRecycledPct: number;
  certifiedOrganicPct: number;
  certifiedRecycledPct: number;
  isRootSource: boolean;
  brand?: { id: string; name: string } | null;
  party?: { id: string; name: string; code: string };
  _count?: { events: number };
}

interface LotDetail extends LotItem {
  events: Array<{
    id: string;
    sequenceNum: number;
    eventType: string;
    inputWeightKg: number;
    outputWeightKg: number;
    lossPercent: number;
    massBalanceStatus: string;
    massBalanceNote: string | null;
    waterLiters: number;
    energyKwh: number;
    co2eKg: number;
    prevHash: string;
    eventHash: string;
    occurredAt: string;
    correctionOfEventId: string | null;
  }>;
}

interface PartyOption {
  id: string;
  code: string;
  name: string;
}

interface BrandOption {
  id: string;
  code: string;
  name: string;
}

interface ProcessOption {
  code: string;
  label: string;
  maxLossPercent: number;
  enforcementMode: string;
}

export default function LotsPage() {
  const { token, user } = useAuth();
  const [lots, setLots] = useState<LotItem[]>([]);
  const [parties, setParties] = useState<PartyOption[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [processes, setProcesses] = useState<ProcessOption[]>([]);
  const [selectedLot, setSelectedLot] = useState<LotDetail | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; eventsChecked: number; headHash: string } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Create Lot Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    lotCode: '',
    materialType: '',
    styleCode: '',
    brandId: '',
    partyId: '',
    quantity: '100',
    unit: 'KG' as 'KG' | 'PIECES' | 'CARTONS',
    weightKg: '100',
    pieceCount: '',
    claimedOrganicPct: '0',
    claimedRecycledPct: '0',
    isRootSource: true,
  });

  // Merge Lots Modal (N -> 1)
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeForm, setMergeForm] = useState({
    parent1Id: '',
    parent1Weight: '50',
    parent2Id: '',
    parent2Weight: '50',
    processStep: 'WASH_DYE',
    partyId: '',
    childCode: '',
    materialType: 'Blended Merged Fabric Batch',
    styleCode: '',
    brandId: '',
    outputWeightKg: '98',
    pieceCount: '400',
    claimedOrganicPct: '50',
    claimedRecycledPct: '50',
  });

  // Record Event / Correction Modal
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventForm, setEventForm] = useState({
    eventType: 'CUT',
    partyId: '',
    inputWeightKg: '100',
    outputWeightKg: '92',
    unit: 'KG',
    correctionOfEventId: '',
    correctionNote: '',
  });

  // Split Modal (1 -> N)
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitForm, setSplitForm] = useState({
    processStep: 'CUT',
    partyId: '',
    child1Code: '',
    child1Weight: '50',
    child2Code: '',
    child2Weight: '45',
  });

  const loadLots = useCallback(async () => {
    if (!token) {
      setLots([]);
      setSelectedLot(null);
      setLoadingList(false);
      return;
    }
    setLoadingList(true);
    try {
      const [lRes, pRes, bRes, cRes] = await Promise.all([
        apiFetch<{ items: LotItem[] }>('/lots?limit=80', { token }),
        apiFetch<{ items: PartyOption[] }>('/parties?limit=50', { token }),
        apiFetch<{ items: BrandOption[] }>('/parties/brands', { token }),
        apiFetch<{ processConfigs: ProcessOption[] }>('/config', { token }),
      ]);
      setLots(lRes.items);
      setParties(pRes.items);
      setBrands(bRes.items);
      setProcesses(cRes.processConfigs);

      if (pRes.items[0]) {
        setEventForm((f) => ({ ...f, partyId: f.partyId || pRes.items[0].id }));
        setSplitForm((f) => ({ ...f, partyId: f.partyId || pRes.items[0].id }));
        setCreateForm((f) => ({ ...f, partyId: f.partyId || pRes.items[0].id }));
        setMergeForm((f) => ({ ...f, partyId: f.partyId || pRes.items[0].id }));
      }
      if (lRes.items.length >= 2) {
        setMergeForm((f) => ({
          ...f,
          parent1Id: f.parent1Id || lRes.items[0].id,
          parent2Id: f.parent2Id || lRes.items[1].id,
        }));
      }
    } catch (e) {
      setFeedback({ type: 'err', msg: e instanceof ApiError ? e.message : 'Failed to load lots' });
    } finally {
      setLoadingList(false);
    }
  }, [token]);

  useEffect(() => {
    loadLots();
  }, [loadLots]);

  const openLotDetail = async (id: string) => {
    setVerifyResult(null);
    setFeedback(null);
    setLoadingDetail(true);
    try {
      const detail = await apiFetch<LotDetail>(`/lots/${id}`, { token });
      setSelectedLot(detail);
      setEventForm((f) => ({
        ...f,
        eventType: 'CUT',
        correctionOfEventId: '',
        correctionNote: '',
        inputWeightKg: String(detail.weightKg),
        outputWeightKg: String(Math.round(detail.weightKg * 0.94 * 10) / 10),
      }));
    } catch (e) {
      setFeedback({ type: 'err', msg: e instanceof ApiError ? e.message : 'Access denied or failed' });
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleVerifyHash = async (lotId: string) => {
    try {
      const res = await apiFetch<{ valid: boolean; eventsChecked: number; headHash: string }>(
        `/lots/${lotId}/verify`,
        { token }
      );
      setVerifyResult(res);
    } catch (e) {
      setFeedback({ type: 'err', msg: e instanceof ApiError ? e.message : 'Verification failed' });
    }
  };

  const handleCreateLot = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const created = await apiFetch<{ id: string; lotCode: string }>('/lots', {
        method: 'POST',
        token,
        body: JSON.stringify({
          lotCode: createForm.lotCode,
          materialType: createForm.materialType,
          styleCode: createForm.styleCode || null,
          brandId: createForm.brandId || null,
          partyId: createForm.partyId,
          quantity: Number(createForm.quantity),
          unit: createForm.unit,
          weightKg: Number(createForm.weightKg),
          pieceCount: createForm.pieceCount ? Number(createForm.pieceCount) : null,
          claimedOrganicPct: Number(createForm.claimedOrganicPct),
          claimedRecycledPct: Number(createForm.claimedRecycledPct),
          isRootSource: createForm.isRootSource,
        }),
      });
      setShowCreateModal(false);
      setCreateForm((f) => ({ ...f, lotCode: '', materialType: '', styleCode: '' }));
      setFeedback({ type: 'ok', msg: `Created lot ${created.lotCode} with initial GENESIS RECEIVE event!` });
      await loadLots();
      await openLotDetail(created.id);
    } catch (err) {
      setFeedback({ type: 'err', msg: err instanceof ApiError ? err.message : 'Could not create lot' });
    }
  };

  const handleMergeLots = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiFetch<{ childLot: { id: string; lotCode: string } }>('/lots/merge', {
        method: 'POST',
        token,
        body: JSON.stringify({
          processStep: mergeForm.processStep,
          partyId: mergeForm.partyId,
          parentAllocations: [
            { parentLotId: mergeForm.parent1Id, allocatedWeightKg: Number(mergeForm.parent1Weight) },
            { parentLotId: mergeForm.parent2Id, allocatedWeightKg: Number(mergeForm.parent2Weight) },
          ],
          child: {
            lotCode: mergeForm.childCode,
            materialType: mergeForm.materialType,
            styleCode: mergeForm.styleCode || null,
            brandId: mergeForm.brandId || null,
            quantity: Number(mergeForm.outputWeightKg),
            unit: 'KG',
            weightKg: Number(mergeForm.outputWeightKg),
            pieceCount: mergeForm.pieceCount ? Number(mergeForm.pieceCount) : null,
            claimedOrganicPct: Number(mergeForm.claimedOrganicPct),
            claimedRecycledPct: Number(mergeForm.claimedRecycledPct),
          },
        }),
      });
      setShowMergeModal(false);
      setMergeForm((f) => ({ ...f, childCode: '' }));
      setFeedback({ type: 'ok', msg: `Merged 2 parent lots into new lot ${res.childLot.lotCode}!` });
      await loadLots();
      await openLotDetail(res.childLot.id);
    } catch (err) {
      setFeedback({ type: 'err', msg: err instanceof ApiError ? err.message : 'Merge rejected' });
    }
  };

  const handleRecordEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLot) return;
    setFeedback(null);
    try {
      await apiFetch(`/lots/${selectedLot.id}/events`, {
        method: 'POST',
        token,
        body: JSON.stringify({
          eventType: eventForm.eventType,
          partyId: eventForm.partyId,
          inputQuantity: Number(eventForm.inputWeightKg),
          outputQuantity: Number(eventForm.outputWeightKg),
          unit: eventForm.unit,
          inputWeightKg: Number(eventForm.inputWeightKg),
          outputWeightKg: Number(eventForm.outputWeightKg),
          correctionOfEventId: eventForm.correctionOfEventId || null,
          metadata: eventForm.correctionNote ? { correctionReason: eventForm.correctionNote } : undefined,
        }),
      });
      setShowEventModal(false);
      setFeedback({ type: 'ok', msg: `Recorded immutable hash-chained ${eventForm.eventType} event!` });
      await loadLots();
      await openLotDetail(selectedLot.id);
    } catch (err) {
      setFeedback({
        type: 'err',
        msg: err instanceof ApiError ? err.message : 'Event rejected by mass balance validation',
      });
    }
  };

  const handleSplitLot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLot) return;
    setFeedback(null);
    try {
      await apiFetch(`/lots/${selectedLot.id}/split`, {
        method: 'POST',
        token,
        body: JSON.stringify({
          processStep: splitForm.processStep,
          partyId: splitForm.partyId,
          children: [
            {
              lotCode: splitForm.child1Code,
              materialType: `${selectedLot.materialType} (Split A)`,
              quantity: Number(splitForm.child1Weight),
              unit: 'KG',
              weightKg: Number(splitForm.child1Weight),
            },
            {
              lotCode: splitForm.child2Code,
              materialType: `${selectedLot.materialType} (Split B)`,
              quantity: Number(splitForm.child2Weight),
              unit: 'KG',
              weightKg: Number(splitForm.child2Weight),
            },
          ],
        }),
      });
      setShowSplitModal(false);
      setFeedback({ type: 'ok', msg: `Lot ${selectedLot.lotCode} split into 2 child lots!` });
      await loadLots();
      await openLotDetail(selectedLot.id);
    } catch (err) {
      setFeedback({ type: 'err', msg: err instanceof ApiError ? err.message : 'Split rejected' });
    }
  };

  const canWrite = user.role === 'AUDITOR' || user.role === 'FACTORY_ADMIN';

  if (!token) {
    return (
      <div className="card p-8 text-center">
        <h2 className="font-bold text-slate-900">Authentication Required for Internal Lots</h2>
        <p className="text-sm text-slate-500 mt-1">
          Public consumers can only access published Digital Product Passports. Switch to <strong>Auditor</strong>, <strong>Factory Admin</strong>, or a <strong>Brand</strong> role in the top bar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-600" />
            Lots, Production Events &amp; Integrity Ledger
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Track raw material and garment batches across production stages, split and merge lots, enforce mass-balance thresholds, and verify SHA-256 event hash chains.
          </p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowMergeModal(true)}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <GitMerge className="w-4 h-4 text-emerald-600" /> Merge Lots (2→1)
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Create New Lot
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-lg text-sm border ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {loadingList ? (
        <SplitPaneSkeleton leftCols={7} rightCols={5} />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Lots List */}
        <div className="lg:col-span-7 card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 font-semibold text-xs text-slate-600 uppercase">
            Tracked Lots ({lots.length})
          </div>
          <div className="divide-y divide-slate-100 max-h-[650px] overflow-y-auto">
            {lots.map((l) => {
              const isOverClaimed =
                l.claimedRecycledPct > l.certifiedRecycledPct + 0.1 ||
                l.claimedOrganicPct > l.certifiedOrganicPct + 0.1;
              return (
                <button
                  key={l.id}
                  onClick={() => openLotDetail(l.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition flex items-center justify-between gap-3 ${
                    selectedLot?.id === l.id ? 'bg-emerald-50/70' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-slate-900">{l.lotCode}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          l.status === 'FLAGGED'
                            ? 'bg-red-100 text-red-700'
                            : l.status === 'SHIPPED'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {l.status}
                      </span>
                      {l.brand && (
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] font-medium">
                          {l.brand.name}
                        </span>
                      )}
                      {isOverClaimed && (
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-semibold">
                          Over-Claimed
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 truncate mt-0.5">{l.materialType}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {l.quantity} {l.unit} ({l.weightKg} kg) · {l._count?.events ?? 0} events · Org {l.certifiedOrganicPct}% / Rec {l.certifiedRecycledPct}%
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Lot Details & Hash Chain */}
        <div className="lg:col-span-5 space-y-4">
          {loadingDetail ? (
            <DetailCardSkeleton />
          ) : selectedLot ? (
            <div className="card p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-sm font-bold text-slate-900">{selectedLot.lotCode}</div>
                  <div className="text-xs text-slate-600">{selectedLot.materialType}</div>
                </div>
                <button
                  onClick={() => handleVerifyHash(selectedLot.id)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Verify Hash Chain
                </button>
              </div>

              {verifyResult && (
                <div
                  className={`p-3 rounded-lg text-xs border ${
                    verifyResult.valid
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5">
                    {verifyResult.valid ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 text-red-600" />
                    )}
                    {verifyResult.valid
                      ? `Hash Chain Intact (${verifyResult.eventsChecked} events verified)`
                      : 'TAMPERING DETECTED IN HASH CHAIN!'}
                  </div>
                  <div className="font-mono text-[10px] mt-1 break-all text-slate-600">
                    Head SHA-256: {verifyResult.headHash}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-lg">
                <div>
                  <span className="text-slate-500">Weight:</span> <strong>{selectedLot.weightKg} kg</strong>
                </div>
                <div>
                  <span className="text-slate-500">Quantity:</span>{' '}
                  <strong>
                    {selectedLot.quantity} {selectedLot.unit}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Organic Claim/Cert:</span>{' '}
                  <strong>
                    {selectedLot.claimedOrganicPct}% / {selectedLot.certifiedOrganicPct}%
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Recycled Claim/Cert:</span>{' '}
                  <strong>
                    {selectedLot.claimedRecycledPct}% / {selectedLot.certifiedRecycledPct}%
                  </strong>
                </div>
              </div>

              {canWrite && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setEventForm((f) => ({
                        ...f,
                        eventType: 'CUT',
                        correctionOfEventId: '',
                        correctionNote: '',
                      }));
                      setShowEventModal(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Record Event / Mass Balance
                  </button>
                  <button
                    onClick={() => {
                      const half = Math.round((selectedLot.weightKg / 2) * 10) / 10;
                      setSplitForm((f) => ({
                        ...f,
                        child1Code: `${selectedLot.lotCode}-S1`,
                        child1Weight: String(half),
                        child2Code: `${selectedLot.lotCode}-S2`,
                        child2Weight: String(Math.max(1, Math.round((half - 1) * 10) / 10)),
                      }));
                      setShowSplitModal(true);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1"
                  >
                    <Split className="w-3.5 h-3.5" /> Split 1→2
                  </button>
                </div>
              )}

              {/* Immutable Hash-Chained Events List */}
              <div>
                <h3 className="text-xs font-bold uppercase text-slate-500 mb-2">
                  Immutable Hash-Chained Events ({selectedLot.events.length})
                </h3>
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {selectedLot.events.map((ev) => (
                    <div key={ev.id} className="p-3 rounded-lg border border-slate-200 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900">
                          #{ev.sequenceNum} · {ev.eventType}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${
                              ev.massBalanceStatus === 'PASS'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {ev.massBalanceStatus} ({ev.lossPercent}% loss)
                          </span>
                          {canWrite && ev.eventType !== 'CORRECTION' && (
                            <button
                              onClick={() => {
                                setEventForm((f) => ({
                                  ...f,
                                  eventType: 'CORRECTION',
                                  inputWeightKg: String(ev.inputWeightKg),
                                  outputWeightKg: String(ev.outputWeightKg),
                                  correctionOfEventId: ev.id,
                                  correctionNote: `Correction of #${ev.sequenceNum} (${ev.eventType})`,
                                }));
                                setShowEventModal(true);
                              }}
                              title="Append immutable correction event"
                              className="px-1.5 py-0.5 rounded border border-slate-300 hover:bg-slate-100 text-[10px] font-semibold text-slate-700 inline-flex items-center gap-0.5"
                            >
                              <RotateCcw className="w-2.5 h-2.5" /> Correct
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-slate-600">
                        In: {ev.inputWeightKg} kg → Out: {ev.outputWeightKg} kg · Water: {ev.waterLiters}L · CO₂e: {ev.co2eKg}kg
                      </div>
                      {ev.correctionOfEventId && (
                        <div className="text-indigo-700 font-medium text-[11px]">
                          ↳ Immutable correction referencing event {ev.correctionOfEventId.slice(0, 8)}…
                        </div>
                      )}
                      {ev.massBalanceNote && (
                        <div className="text-red-700 font-medium">{ev.massBalanceNote}</div>
                      )}
                      <div className="font-mono text-[10px] text-slate-400 truncate">
                        prev: {ev.prevHash.slice(0, 14)}… → hash: {ev.eventHash.slice(0, 18)}…
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="card p-8 text-center text-sm text-slate-500">
              Select a lot on the left to view its immutable hash-chained events, record corrections, test mass-balance rules, or split/verify.
            </div>
          )}
        </div>
      </div>
      )}

      {/* Create New Lot Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl">
            <h2 className="font-bold text-base text-slate-900 mb-3">Create New Lot</h2>
            <form onSubmit={handleCreateLot} className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Lot Code</label>
                  <input
                    required
                    placeholder="LOT-RAW-NEW-01"
                    value={createForm.lotCode}
                    onChange={(e) => setCreateForm({ ...createForm, lotCode: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Style Code (optional)</label>
                  <input
                    placeholder="NW-TEE-2026"
                    value={createForm.styleCode}
                    onChange={(e) => setCreateForm({ ...createForm, styleCode: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Material Description</label>
                <input
                  required
                  placeholder="Organic Cotton Single Jersey Roll"
                  value={createForm.materialType}
                  onChange={(e) => setCreateForm({ ...createForm, materialType: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Facility / Supplier</label>
                  <select
                    value={createForm.partyId}
                    onChange={(e) => setCreateForm({ ...createForm, partyId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    {parties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Brand (optional)</label>
                  <select
                    value={createForm.brandId}
                    onChange={(e) => setCreateForm({ ...createForm, brandId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">Shared / Raw Stock</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Quantity</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={createForm.quantity}
                    onChange={(e) => setCreateForm({ ...createForm, quantity: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Unit</label>
                  <select
                    value={createForm.unit}
                    onChange={(e) => setCreateForm({ ...createForm, unit: e.target.value as 'KG' | 'PIECES' | 'CARTONS' })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="KG">KG</option>
                    <option value="PIECES">PIECES</option>
                    <option value="CARTONS">CARTONS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Weight (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={createForm.weightKg}
                    onChange={(e) => setCreateForm({ ...createForm, weightKg: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Claimed Organic %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={createForm.claimedOrganicPct}
                    onChange={(e) => setCreateForm({ ...createForm, claimedOrganicPct: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Claimed Recycled %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={createForm.claimedRecycledPct}
                    onChange={(e) => setCreateForm({ ...createForm, claimedRecycledPct: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={createForm.isRootSource}
                  onChange={(e) => setCreateForm({ ...createForm, isRootSource: e.target.checked })}
                />
                Origin Mill Source Lot (uncheck for downstream intermediate batches)
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 rounded-lg border">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold">
                  Create Lot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Merge Lots Modal (2 -> 1) */}
      {showMergeModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl">
            <h2 className="font-bold text-base text-slate-900 mb-3">Merge 2 Parent Lots into 1 Child Lot</h2>
            <form onSubmit={handleMergeLots} className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Parent Lot 1</label>
                  <select
                    value={mergeForm.parent1Id}
                    onChange={(e) => setMergeForm({ ...mergeForm, parent1Id: e.target.value })}
                    className="w-full px-2.5 py-2 border rounded-lg text-xs"
                  >
                    {lots.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.lotCode} ({l.weightKg}kg)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Alloc (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={mergeForm.parent1Weight}
                    onChange={(e) => setMergeForm({ ...mergeForm, parent1Weight: e.target.value })}
                    className="w-full px-2.5 py-2 border rounded-lg text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Parent Lot 2</label>
                  <select
                    value={mergeForm.parent2Id}
                    onChange={(e) => setMergeForm({ ...mergeForm, parent2Id: e.target.value })}
                    className="w-full px-2.5 py-2 border rounded-lg text-xs"
                  >
                    {lots.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.lotCode} ({l.weightKg}kg)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Alloc (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={mergeForm.parent2Weight}
                    onChange={(e) => setMergeForm({ ...mergeForm, parent2Weight: e.target.value })}
                    className="w-full px-2.5 py-2 border rounded-lg text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">New Merged Lot Code</label>
                  <input
                    required
                    placeholder="LOT-MERGED-01"
                    value={mergeForm.childCode}
                    onChange={(e) => setMergeForm({ ...mergeForm, childCode: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Process Step</label>
                  <select
                    value={mergeForm.processStep}
                    onChange={(e) => setMergeForm({ ...mergeForm, processStep: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    {processes.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Facility</label>
                  <select
                    value={mergeForm.partyId}
                    onChange={(e) => setMergeForm({ ...mergeForm, partyId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    {parties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Merged Output Weight (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={mergeForm.outputWeightKg}
                    onChange={(e) => setMergeForm({ ...mergeForm, outputWeightKg: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowMergeModal(false)} className="px-4 py-2 rounded-lg border">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold">
                  Execute Merge
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Event / Correction Modal */}
      {showEventModal && selectedLot && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <h2 className="font-bold text-base text-slate-900 mb-1">
              {eventForm.eventType === 'CORRECTION'
                ? `Append Immutable Correction on ${selectedLot.lotCode}`
                : `Record Event on ${selectedLot.lotCode}`}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              {eventForm.eventType === 'CORRECTION'
                ? 'Original events are never mutated. This appends a new hash-chained CORRECTION event.'
                : 'Mass-balance loss thresholds are validated automatically based on the selected process stage.'}
            </p>
            <form onSubmit={handleRecordEvent} className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Process Step (Config-Driven)</label>
                <select
                  value={eventForm.eventType}
                  onChange={(e) => setEventForm({ ...eventForm, eventType: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {processes.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.code} — {p.label} (max loss {p.maxLossPercent}%, {p.enforcementMode})
                    </option>
                  ))}
                  <option value="CORRECTION">CORRECTION (Immutable adjustment)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Facility / Party</label>
                <select
                  value={eventForm.partyId}
                  onChange={(e) => setEventForm({ ...eventForm, partyId: e.target.value })}
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
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Input Weight (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={eventForm.inputWeightKg}
                    onChange={(e) => setEventForm({ ...eventForm, inputWeightKg: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Output Weight (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={eventForm.outputWeightKg}
                    onChange={(e) => setEventForm({ ...eventForm, outputWeightKg: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              {eventForm.eventType === 'CORRECTION' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Correction Reason</label>
                  <input
                    required
                    value={eventForm.correctionNote}
                    onChange={(e) => setEventForm({ ...eventForm, correctionNote: e.target.value })}
                    placeholder="Scale recalibration adjustment"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="px-4 py-2 rounded-lg border text-slate-700"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold">
                  Append Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Split Modal */}
      {showSplitModal && selectedLot && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <h2 className="font-bold text-base text-slate-900 mb-3">Split {selectedLot.lotCode} (1 → 2)</h2>
            <form onSubmit={handleSplitLot} className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Child 1 Code</label>
                  <input
                    required
                    value={splitForm.child1Code}
                    onChange={(e) => setSplitForm({ ...splitForm, child1Code: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Child 1 Weight (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={splitForm.child1Weight}
                    onChange={(e) => setSplitForm({ ...splitForm, child1Weight: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Child 2 Code</label>
                  <input
                    required
                    value={splitForm.child2Code}
                    onChange={(e) => setSplitForm({ ...splitForm, child2Code: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Child 2 Weight (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={splitForm.child2Weight}
                    onChange={(e) => setSplitForm({ ...splitForm, child2Weight: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSplitModal(false)}
                  className="px-4 py-2 rounded-lg border text-slate-700"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold">
                  Execute Split
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
