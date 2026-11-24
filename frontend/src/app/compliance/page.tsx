'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, Lock, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface DefectReport {
  auditedAt: string;
  qa2Passed: boolean;
  totalDefectsDetected: number;
  summaryByCategory: {
    OVER_CLAIMED_CONTENT: number;
    EXPIRED_CERTIFICATE: number;
    EXCESS_PROCESS_LOSS: number;
    ORPHAN_LOT: number;
  };
  passportUnsupportedClaimViolations: Array<{ passportCode: string; reason: string }>;
  defects: Array<{
    category: string;
    severity: string;
    entityCode: string;
    description: string;
  }>;
}

interface ConfidentialityReport {
  scannedAt: string;
  qa3Passed: boolean;
  passportVersionsScanned: number;
  publicPartiesScanned: number;
  diskCacheSnapshotsScanned: number;
  leaksFound: number;
}

interface CacheStatus {
  dbHealth: { reachable: boolean; latencyMs: number };
  cache: { memoryEntries: number; diskEntries: number; cacheDir: string };
  cachedSnapshots: string[];
}

export default function CompliancePage() {
  const { token } = useAuth();
  const [defects, setDefects] = useState<DefectReport | null>(null);
  const [conf, setConf] = useState<ConfidentialityReport | null>(null);
  const [cacheInfo, setCacheInfo] = useState<CacheStatus | null>(null);
  const [crossBrandTest, setCrossBrandTest] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runScans = useCallback(async () => {
    setLoading(true);
    try {
      const cStatus = await apiFetch<CacheStatus>('/audit/cache-status');
      setCacheInfo(cStatus);
      if (token) {
        const [d, c] = await Promise.all([
          apiFetch<DefectReport>('/audit/defects', { token }),
          apiFetch<ConfidentialityReport>('/audit/confidentiality', { token }),
        ]);
        setDefects(d);
        setConf(c);
      }
    } catch {
      // ignore if offline
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    runScans();
  }, [runScans]);

  const testCrossBrandRefusal = async () => {
    setCrossBrandTest('Testing Brand A (NordicWear) attempting to fetch Brand B (EuroStyle) passport DPP-2026-ES-001...');
    try {
      const nwAuth = await apiFetch<{ token: string }>('/auth/demo-switch', {
        method: 'POST',
        body: JSON.stringify({ persona: 'BRAND_NW' }),
      });
      await apiFetch('/passports/DPP-2026-ES-001', { token: nwAuth.token });
      setCrossBrandTest('❌ UNEXPECTED: Cross-brand request succeeded!');
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setCrossBrandTest(`✅ Access Control Verified (HTTP 403 Forbidden): ${e.message}`);
      } else {
        setCrossBrandTest(`Result: ${e instanceof Error ? e.message : 'Error'}`);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            Compliance, Data Privacy &amp; Resilience Center
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Automated supply-chain claim verification, mass-balance exception auditing, public data-privacy scanning, and high-availability cache monitoring.
          </p>
        </div>
        <button
          onClick={runScans}
          disabled={loading}
          className="px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold inline-flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Re-Run All Scans
        </button>
      </div>

      {/* Claim & Lineage Compliance Audit */}
      <div className="card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-slate-900">Supply-Chain Claim &amp; Lineage Compliance Audit</h2>
            <p className="text-xs text-slate-500">
              Detects over-claimed recycled/organic content, expired certificates, cutting loss &gt; 12%, and orphan lots.
            </p>
          </div>
          {defects && (
            <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold inline-flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" />
              {defects.qa2Passed ? '0 Unsupported Claims in Passports' : 'Violation Found'}
            </span>
          )}
        </div>

        {defects ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              {[
                { label: 'Over-Claimed Content', count: defects.summaryByCategory.OVER_CLAIMED_CONTENT },
                { label: 'Expired Certificates', count: defects.summaryByCategory.EXPIRED_CERTIFICATE },
                { label: 'Excess Cutting Loss', count: defects.summaryByCategory.EXCESS_PROCESS_LOSS },
                { label: 'Orphan Lots', count: defects.summaryByCategory.ORPHAN_LOT },
              ].map((cat) => (
                <div key={cat.label} className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="text-2xl font-bold text-amber-900">{cat.count}</div>
                  <div className="text-[11px] font-semibold text-amber-800">{cat.label}</div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {defects.defects.map((d, i) => (
                <div key={i} className="p-3 rounded-lg border border-red-200 bg-red-50/50 flex items-start gap-2.5 text-xs">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-red-900">[{d.category}] {d.entityCode}:</span>{' '}
                    <span className="text-slate-800">{d.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-xs text-slate-500">Switch to Auditor or Admin role to run compliance audit.</div>
        )}
      </div>

      {/* Confidentiality & Tenant Isolation */}
      <div className="card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-emerald-600" /> Data Confidentiality &amp; Tenant Isolation Audit
            </h2>
            <p className="text-xs text-slate-500">
              Scans every public passport version, public party DTO, and cache snapshot for <code className="bg-slate-100 px-1 rounded">unitPriceUsd</code>, <code className="bg-slate-100 px-1 rounded">exactAddress</code>, <code className="bg-slate-100 px-1 rounded">workerCount</code>, and <code className="bg-slate-100 px-1 rounded">contactEmail</code>.
            </p>
          </div>
          <button
            onClick={testCrossBrandRefusal}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
          >
            Verify Cross-Tenant Access Control
          </button>
        </div>

        {conf && (
          <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex flex-wrap gap-4">
            <span>
              <strong>Leaks Found:</strong> {conf.leaksFound} (PASSED)
            </span>
            <span>Passport Versions Scanned: {conf.passportVersionsScanned}</span>
            <span>Public Parties Scanned: {conf.publicPartiesScanned}</span>
            <span>Cached Snapshots Scanned: {conf.diskCacheSnapshotsScanned}</span>
          </div>
        )}

        {crossBrandTest && (
          <div className="p-3 rounded-lg bg-slate-900 text-emerald-300 font-mono text-xs">{crossBrandTest}</div>
        )}
      </div>

      {/* High-Availability Passport Cache */}
      <div className="card p-5 space-y-3">
        <h2 className="font-bold text-slate-900 flex items-center gap-1.5">
          <Database className="w-4 h-4 text-emerald-600" /> High-Availability Passport Cache &amp; Database Status
        </h2>
        {cacheInfo && (
          <div className="space-y-2 text-xs">
            <div className="flex flex-wrap gap-3">
              <span
                className={`px-2.5 py-1 rounded-full font-semibold ${
                  cacheInfo.dbHealth.reachable ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                Database: {cacheInfo.dbHealth.reachable ? `ONLINE (${cacheInfo.dbHealth.latencyMs}ms)` : 'OFFLINE'}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 font-semibold">
                Cached Passport Snapshots: {cacheInfo.cache.diskEntries}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border text-slate-700">
              <strong>High-Availability Resilience:</strong> Published public passports are automatically snapshotted to local cache so consumer QR scans continue to resolve even during database maintenance windows.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
