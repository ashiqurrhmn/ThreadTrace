'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Code2,
  Droplets,
  Flame,
  Leaf,
  MapPin,
  Recycle,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { API_BASE } from '@/lib/api';

interface PublicPassportResponse {
  cacheStatus: 'HIT-DB' | 'HIT-CACHE-DB-DOWN' | 'HIT-CACHE';
  etag: string;
  availableVersions: number[];
  qrDataUrl: string;
  publicUrl: string;
  cachedAt: string;
  data: {
    passportCode: string;
    version: number;
    styleCode: string;
    shipmentRef: string;
    brandName: string;
    brandCountry: string;
    materialType: string;
    fibreComposition: Array<{ fibre: string; percent: number }>;
    verifiedClaims: { organicPct: number; recycledPct: number; badges: string[] };
    originByProcessStep: Array<{
      step: string;
      facilityName: string;
      facilityType: string;
      city: string;
      country: string;
      occurredAt: string;
    }>;
    certifications: Array<{
      id: string;
      certificateNumber: string;
      certTypeCode: string;
      certTypeName: string;
      issuer: string;
      validUntil: string;
    }>;
    footprint: {
      allocationMethod: string;
      perPiece: { waterLiters: number; energyKwh: number; co2eKg: number };
      byProcessStep: Array<{ processStep: string; waterLiters: number; energyKwh: number; co2eKg: number }>;
    };
    careAndRepair: Record<string, string>;
    endOfLifeGuidance: Record<string, unknown>;
    customFields: Record<string, { label: string; value: string }>;
    integrity: { verified: boolean; eventsChecked: number; integrityHash: string };
    publishedAt: string;
  };
}

export default function PublicQrPassportPage() {
  const params = useParams<{ code: string }>();
  const code = params?.code || 'DPP-2026-NW-001';
  const [passport, setPassport] = useState<PublicPassportResponse | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMs, setLoadMs] = useState<number>(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const t0 = performance.now();
      setError(null);
      try {
        const url = selectedVersion
          ? `${API_BASE}/public/passports/${encodeURIComponent(code)}/versions/${selectedVersion}`
          : `${API_BASE}/public/passports/${encodeURIComponent(code)}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Passport not found (${res.status})`);
        const json = (await res.json()) as PublicPassportResponse;
        if (active) {
          setPassport(json);
          setLoadMs(Math.round(performance.now() - t0));
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Unable to load passport');
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [code, selectedVersion]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border p-6 text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
          <h1 className="font-bold text-lg text-slate-900">Passport Unavailable</h1>
          <p className="text-sm text-slate-600">{error}</p>
          <Link href="/" className="inline-block px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold">
            Back to ThreadTrace
          </Link>
        </div>
      </div>
    );
  }

  if (!passport) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">
        Loading Digital Product Passport…
      </div>
    );
  }

  const d = passport.data;

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-950 via-slate-900 to-slate-100 pb-12">
      {/* Top Consumer Header */}
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-8 text-white">
        <div className="flex items-center justify-between text-xs mb-4">
          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
            <Leaf className="w-4 h-4" /> EU Digital Product Passport · ThreadTrace
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-slate-200 font-mono">
            {loadMs} ms · {passport.cacheStatus}
          </span>
        </div>

        {/* QA4 DB-Down Banner */}
        {passport.cacheStatus === 'HIT-CACHE-DB-DOWN' && (
          <div className="mb-4 p-3 rounded-xl bg-amber-400/20 border border-amber-300/50 text-amber-100 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-300" />
            <span>
              <strong>Resilience Cache Active (QA4):</strong> Primary database is currently offline, yet this verified public passport loaded seamlessly from local snapshot cache!
            </span>
          </div>
        )}

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-emerald-300 font-semibold">
              {d.brandName} ({d.brandCountry}) · Style {d.styleCode}
            </div>
            <h1 className="text-2xl font-bold mt-1">{d.materialType}</h1>
            <div className="text-xs text-slate-300 font-mono mt-1">
              ID: {d.passportCode} · Version {d.version} · Shipment {d.shipmentRef}
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={passport.qrDataUrl}
            alt="Passport QR"
            className="w-20 h-20 rounded-xl bg-white p-1.5 shrink-0 shadow-md"
          />
        </div>

        {/* Verified Claim Badges */}
        <div className="flex flex-wrap gap-2 mt-4">
          {d.verifiedClaims.badges.length > 0 ? (
            d.verifiedClaims.badges.map((b) => (
              <span
                key={b}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500 text-slate-950 text-xs font-bold"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> {b}
              </span>
            ))
          ) : (
            <span className="px-3 py-1 rounded-full bg-white/10 text-slate-300 text-xs">
              Standard Verified Traceability (No Active Eco Claims)
            </span>
          )}
        </div>
      </div>

      {/* Main Mobile-First Passport Cards */}
      <div className="max-w-2xl mx-auto px-4 space-y-4 -mt-3">
        {/* Version Switcher & JSON Toggle */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600">Passport Version:</span>
            {passport.availableVersions.map((v) => (
              <button
                key={v}
                onClick={() => setSelectedVersion(v)}
                className={`px-2.5 py-1 rounded-md font-semibold border ${
                  d.version === v
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                v{v}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowJson((s) => !s)}
            className="px-3 py-1 rounded-md border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold inline-flex items-center gap-1"
          >
            <Code2 className="w-3.5 h-3.5" /> {showJson ? 'Hide JSON' : 'View Public JSON'}
          </button>
        </div>

        {showJson && (
          <div className="bg-slate-950 text-emerald-300 rounded-2xl p-4 text-[11px] font-mono overflow-x-auto max-h-80">
            <pre>{JSON.stringify(d, null, 2)}</pre>
          </div>
        )}

        {/* Environmental Footprint Per Piece (FR6) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-900 text-sm">Environmental Footprint (Per Piece)</h2>
            <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
              Allocated by {d.footprint.allocationMethod}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-blue-50 text-center">
              <Droplets className="w-5 h-5 text-blue-600 mx-auto mb-1" />
              <div className="text-xl font-bold text-blue-900">{d.footprint.perPiece.waterLiters} L</div>
              <div className="text-[11px] text-blue-700 font-medium">Water Used</div>
            </div>
            <div className="p-3.5 rounded-xl bg-amber-50 text-center">
              <Zap className="w-5 h-5 text-amber-600 mx-auto mb-1" />
              <div className="text-xl font-bold text-amber-900">{d.footprint.perPiece.energyKwh} kWh</div>
              <div className="text-[11px] text-amber-700 font-medium">Energy Used</div>
            </div>
            <div className="p-3.5 rounded-xl bg-emerald-50 text-center">
              <Flame className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
              <div className="text-xl font-bold text-emerald-900">{d.footprint.perPiece.co2eKg} kg</div>
              <div className="text-[11px] text-emerald-700 font-medium">CO₂e Footprint</div>
            </div>
          </div>
        </div>

        {/* Fibre Composition */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h2 className="font-bold text-slate-900 text-sm mb-3">Fibre Composition</h2>
          <div className="space-y-2.5">
            {d.fibreComposition.map((f) => (
              <div key={f.fibre}>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                  <span>{f.fibre}</span>
                  <span>{f.percent}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${f.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Supply-Chain Origin Timeline (Public Safe — ZERO confidential fields!) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h2 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-emerald-600" /> Verified Origin by Process Step
          </h2>
          <ol className="relative border-l-2 border-emerald-200 ml-2 space-y-4">
            {d.originByProcessStep.map((s, idx) => (
              <li key={idx} className="ml-4">
                <div className="absolute -left-[9px] w-4 h-4 rounded-full bg-emerald-500 border-2 border-white" />
                <div className="text-xs font-bold text-emerald-700 uppercase">{s.step}</div>
                <div className="text-sm font-semibold text-slate-900">{s.facilityName}</div>
                <div className="text-xs text-slate-500">
                  {s.facilityType.replace(/_/g, ' ')} · {s.city}, {s.country}
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Active Verified Certifications ONLY (FR5) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h2 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-1.5">
            <Award className="w-4 h-4 text-emerald-600" /> Active Verified Certifications ({d.certifications.length})
          </h2>
          {d.certifications.length > 0 ? (
            <div className="space-y-2">
              {d.certifications.map((c) => (
                <div key={c.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-slate-900">{c.certTypeName}</div>
                    <div className="text-slate-600">
                      {c.certificateNumber} · Issued by {c.issuer}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold shrink-0">
                    Valid till {c.validUntil.slice(0, 10)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic">No active certificates currently valid for this product.</div>
          )}
        </div>

        {/* Care, Repair & End-of-Life */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 text-xs space-y-1.5">
            <h2 className="font-bold text-slate-900 text-sm mb-2 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-600" /> Care &amp; Repair
            </h2>
            {Object.entries(d.careAndRepair).map(([k, v]) => (
              <div key={k}>
                <span className="font-semibold capitalize text-slate-700">{k}:</span>{' '}
                <span className="text-slate-600">{String(v)}</span>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 text-xs space-y-1.5">
            <h2 className="font-bold text-slate-900 text-sm mb-2 flex items-center gap-1.5">
              <Recycle className="w-4 h-4 text-emerald-600" /> End-of-Life Guidance
            </h2>
            {Object.entries(d.endOfLifeGuidance).map(([k, v]) => (
              <div key={k}>
                <span className="font-semibold capitalize text-slate-700">{k}:</span>{' '}
                <span className="text-slate-600">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Config-Driven Custom Passport Fields (QA5) */}
        {Object.keys(d.customFields ?? {}).length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <h2 className="font-bold text-slate-900 text-sm mb-2">Additional Regulatory &amp; Product Attributes</h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {Object.entries(d.customFields).map(([k, item]) => (
                <div key={k} className="p-2.5 rounded-lg bg-slate-50 border">
                  <div className="text-slate-500">{item.label}</div>
                  <div className="font-bold text-slate-900 mt-0.5">{String(item.value)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cryptographic Integrity Footer (FR10) */}
        <div className="bg-slate-900 text-slate-200 rounded-2xl p-4 text-xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <div className="font-bold text-white">
                {d.integrity.verified ? 'SHA-256 Event Chain Verified' : 'Integrity Warning'}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                {d.integrity.eventsChecked} immutable events · {d.integrity.integrityHash.slice(0, 20)}…
              </div>
            </div>
          </div>
          <Link href="/" className="text-emerald-300 hover:underline font-semibold">
            Admin Console →
          </Link>
        </div>
      </div>
    </div>
  );
}
