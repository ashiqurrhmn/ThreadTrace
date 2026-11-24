'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowRight, Clock, GitBranch, Search } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { TraceSkeleton } from '@/components/Skeleton';

interface TraceResponse {
  direction: 'BACKWARD' | 'FORWARD';
  queryTimeMs: number;
  targetLot: {
    id: string;
    lotCode: string;
    materialType: string;
    styleCode: string | null;
    status: string;
    quantity: number;
    unit: string;
    weightKg: number;
  };
  maxDepth: number;
  nodeCount: number;
  edgeCount: number;
  nodes: Array<{
    id: string;
    lotCode: string;
    materialType: string;
    styleCode: string | null;
    status: string;
    depthFromTarget?: number;
    depthFromSource?: number;
    quantity: number;
    unit: string;
    weightKg: number;
    brandName: string | null;
    latestEvent: string | null;
    party: { name: string; type: string; city: string; country: string };
  }>;
  edges: Array<{
    parentLotCode: string;
    childLotCode: string;
    processStep: string;
    allocatedWeightKg: number;
    allocationRatio: number;
  }>;
  paths: Array<Array<{ lotId: string; lotCode: string; processStep?: string }>>;
  suppliers: Array<{ code: string; name: string; type: string; city: string; country: string }>;
  passports?: Array<{ passportCode: string; styleCode: string; shipmentRef: string; brandName: string }>;
}

export default function TracePage() {
  const { token } = useAuth();
  const [direction, setDirection] = useState<'BACKWARD' | 'FORWARD'>('BACKWARD');
  const [identifier, setIdentifier] = useState('LOT-SHIP-NW-01');
  const [result, setResult] = useState<TraceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runTrace = async (dir = direction, id = identifier) => {
    if (!token || !id.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const endpoint =
        dir === 'BACKWARD'
          ? `/trace/backward/${encodeURIComponent(id.trim())}`
          : `/trace/forward/${encodeURIComponent(id.trim())}`;
      const res = await apiFetch<TraceResponse>(endpoint, { token });
      setResult(res);
    } catch (e) {
      setResult(null);
      setError(e instanceof ApiError ? e.message : 'Trace query failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) runTrace('BACKWARD', 'LOT-SHIP-NW-01');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token) {
    return (
      <div className="card p-8 text-center text-sm text-slate-600">
        Switch to <strong>Auditor</strong>, <strong>Factory Admin</strong>, or a <strong>Brand</strong> role in the top bar to run internal lineage traces.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-emerald-600" />
          Multi-Tier Supply-Chain Lineage Traceability
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Trace any export carton or style backward to its raw material mills, or trace any upstream yarn/fabric lot forward to all downstream shipments and buyers.
        </p>
      </div>

      {/* Search & Preset Controls */}
      <div className="card p-5 space-y-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setDirection('BACKWARD');
              setIdentifier('LOT-SHIP-NW-01');
              runTrace('BACKWARD', 'LOT-SHIP-NW-01');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              direction === 'BACKWARD' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700'
            }`}
          >
            Backward Trace (Carton → Source Mills)
          </button>
          <button
            onClick={() => {
              setDirection('FORWARD');
              setIdentifier('LOT-RAW-ORG-01');
              runTrace('FORWARD', 'LOT-RAW-ORG-01');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              direction === 'FORWARD' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700'
            }`}
          >
            Forward Trace (Fabric/Yarn → Shipments &amp; Buyers)
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            runTrace();
          }}
          className="flex flex-wrap gap-2"
        >
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Enter Lot Code or Style Code (e.g. LOT-SHIP-NW-01, LOT-RAW-ORG-01, NW-TEE-2026)"
            className="flex-1 min-w-[260px] px-3.5 py-2 border rounded-lg text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-1.5"
          >
            <Search className="w-4 h-4" /> {loading ? 'Tracing...' : 'Run Trace'}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Quick Presets:</span>
          {[
            { label: 'Backward: LOT-SHIP-NW-01 (NordicWear)', dir: 'BACKWARD' as const, id: 'LOT-SHIP-NW-01' },
            { label: 'Backward: LOT-SHIP-ES-01 (EuroStyle)', dir: 'BACKWARD' as const, id: 'LOT-SHIP-ES-01' },
            { label: 'Forward: LOT-RAW-ORG-01 (Organic Yarn)', dir: 'FORWARD' as const, id: 'LOT-RAW-ORG-01' },
            { label: 'Forward: LOT-FAB-BLEND-01 (Blended Roll)', dir: 'FORWARD' as const, id: 'LOT-FAB-BLEND-01' },
          ].map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setDirection(p.dir);
                setIdentifier(p.id);
                runTrace(p.dir, p.id);
              }}
              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 font-medium transition"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-medium">{error}</div>
      )}

      {loading && <TraceSkeleton />}

      {!loading && result && (
        <div className="space-y-5">
          {/* Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-4">
              <div className="text-xs text-slate-500">Query Execution Time</div>
              <div className="text-xl font-bold text-emerald-600 flex items-center gap-1.5 mt-1">
                <Clock className="w-4 h-4" /> {result.queryTimeMs} ms
              </div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-slate-500">Process Depth Traversed</div>
              <div className="text-xl font-bold text-slate-900 mt-1">{result.maxDepth} levels</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-slate-500">Lots in Lineage</div>
              <div className="text-xl font-bold text-slate-900 mt-1">{result.nodeCount} lots</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-slate-500">Split / Merge Edges</div>
              <div className="text-xl font-bold text-slate-900 mt-1">{result.edgeCount} edges</div>
            </div>
          </div>

          {/* Complete End-to-End Paths */}
          <div className="card p-5">
            <h2 className="font-bold text-sm text-slate-900 mb-3">
              Resolved Supply-Chain Paths ({result.paths.length})
            </h2>
            <div className="space-y-2">
              {result.paths.map((path, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center gap-1.5 text-xs">
                  {path.map((step, sIdx) => (
                    <React.Fragment key={`${idx}-${step.lotId}`}>
                      <span className="px-2 py-1 rounded bg-white border border-slate-300 font-mono font-semibold text-slate-800">
                        {step.lotCode}
                        {step.processStep ? (
                          <span className="ml-1 text-[10px] text-emerald-700 font-sans">({step.processStep})</span>
                        ) : null}
                      </span>
                      {sIdx < path.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-slate-400" />}
                    </React.Fragment>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Lineage Nodes & Edges */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 card p-5">
              <h2 className="font-bold text-sm text-slate-900 mb-3">Lineage Nodes ({result.nodes.length})</h2>
              <div className="space-y-2.5">
                {result.nodes.map((n) => (
                  <div key={n.id} className="p-3 rounded-lg border border-slate-200 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-slate-900">{n.lotCode}</span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold text-[10px]">
                          {n.latestEvent ?? n.status}
                        </span>
                        {n.brandName && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-semibold">
                            {n.brandName}
                          </span>
                        )}
                      </div>
                      <div className="text-slate-700 mt-0.5">{n.materialType}</div>
                      <div className="text-slate-400 mt-0.5">
                        {n.party.name} ({n.party.city}, {n.party.country}) · {n.weightKg} kg
                      </div>
                    </div>
                    <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-semibold text-[11px] shrink-0">
                      Lvl {n.depthFromTarget ?? n.depthFromSource ?? 0}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 space-y-4">
              <div className="card p-5">
                <h2 className="font-bold text-sm text-slate-900 mb-3">Split &amp; Merge Edges ({result.edges.length})</h2>
                <div className="space-y-2 text-xs">
                  {result.edges.map((e, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="font-semibold text-slate-800">{e.parentLotCode}</span>
                        <ArrowDownRight className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="font-semibold text-emerald-800">{e.childLotCode}</span>
                      </div>
                      <span className="text-[11px] text-slate-500">
                        {e.processStep} · {e.allocatedWeightKg}kg
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {result.passports && result.passports.length > 0 && (
                <div className="card p-5">
                  <h2 className="font-bold text-sm text-slate-900 mb-3">Affected Downstream Passports</h2>
                  <div className="space-y-2 text-xs">
                    {result.passports.map((p) => (
                      <Link
                        key={p.passportCode}
                        href={`/passport/${p.passportCode}`}
                        target="_blank"
                        className="block p-3 rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition"
                      >
                        <div className="font-mono font-bold text-emerald-900">{p.passportCode}</div>
                        <div className="text-emerald-800">
                          {p.brandName} · Style {p.styleCode} · {p.shipmentRef}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
