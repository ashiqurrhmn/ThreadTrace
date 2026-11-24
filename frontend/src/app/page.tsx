'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Building2,
  CheckCircle2,
  FileSpreadsheet,
  GitBranch,
  Layers,
  QrCode,
  ShieldCheck,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface OverviewResponse {
  dbHealth: { reachable: boolean; latencyMs: number };
  offlineMode: boolean;
  counts?: {
    parties: number;
    lots: number;
    events: number;
    passports: number;
    activeCerts: number;
    expiringAlerts: number;
    importJobs: number;
  };
  cache: { memoryEntries: number; diskEntries: number; cacheDir: string };
  cachedPassports: string[];
}

interface AlertItem {
  id: string;
  daysRemaining: number;
  message: string;
  evidence: {
    certificateNumber: string;
    certTypeCode: string;
    validUntil: string;
  };
}

export default function DashboardPage() {
  const { token, user } = useAuth();
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  useEffect(() => {
    apiFetch<OverviewResponse>('/audit/overview', { token })
      .then(setOverview)
      .catch(() => {});

    if (token) {
      apiFetch<{ items: AlertItem[] }>('/evidences/alerts?unacknowledged=true', { token })
        .then((r) => setAlerts(r.items))
        .catch(() => setAlerts([]));
    } else {
      setAlerts([]);
    }
  }, [token]);

  const counts = overview?.counts;

  const kpis = [
    { label: 'Parties & Mills', value: counts?.parties ?? '—', icon: Building2, href: '/parties', color: 'text-blue-600 bg-blue-50' },
    { label: 'Tracked Lots', value: counts?.lots ?? '—', icon: Layers, href: '/lots', color: 'text-indigo-600 bg-indigo-50' },
    { label: 'Hash-Chained Events', value: counts?.events ?? '—', icon: GitBranch, href: '/trace', color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Published Passports', value: counts?.passports ?? '—', icon: QrCode, href: '/passports', color: 'text-teal-600 bg-teal-50' },
    { label: 'Valid Certificates', value: counts?.activeCerts ?? '—', icon: Award, href: '/evidence', color: 'text-amber-600 bg-amber-50' },
    { label: 'Disk Cached Snapshots (QA4)', value: overview?.cache.diskEntries ?? '—', icon: ShieldCheck, href: '/compliance', color: 'text-purple-600 bg-purple-50' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="card p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white border-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold mb-2">
              CSE 444 · Project 4 · ThreadTrace Live System
            </span>
            <h1 className="text-2xl font-bold tracking-tight">
              Garment Supply-Chain Traceability &amp; Digital Product Passports
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              End-to-end lineage from Bangladeshi spinning &amp; fabric mills to EU retail cartons, with mass balance enforcement, automatic certificate expiry claim drop, environmental footprint roll-up, and DB-resilient QR passports.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/trace"
              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm inline-flex items-center gap-1.5 transition"
            >
              Trace a Carton <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/passport/DPP-2026-NW-001"
              target="_blank"
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold text-sm inline-flex items-center gap-1.5 transition"
            >
              View QR Passport <QrCode className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Offline Notice if PostgreSQL Stopped for QA4 Demo */}
      {overview?.offlineMode && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <div className="font-semibold text-amber-900 text-sm">PostgreSQL is currently offline (QA4 Resilience Mode)</div>
              <div className="text-xs text-amber-800">
                Admin database queries are paused, but <strong>{overview.cache.diskEntries} public passport snapshots</strong> remain live from local disk cache!
              </div>
            </div>
          </div>
          <Link
            href="/passport/DPP-2026-NW-001"
            target="_blank"
            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold shrink-0"
          >
            Test Public Passport Now
          </Link>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Link key={k.label} href={k.href} className="card p-5 hover:border-emerald-300 transition flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-slate-500">{k.label}</div>
                <div className="text-2xl font-bold text-slate-900 mt-1">{k.value}</div>
              </div>
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${k.color}`}>
                <Icon className="w-5 h-5" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Expiry Alerts Banner (FR5) */}
      {alerts.length > 0 && (
        <div className="card p-5 border-amber-200 bg-amber-50/50">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-amber-950 flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Active Certificate Expiry Alerts (30-Day Window — FR5)
            </h2>
            <Link href="/evidence" className="text-xs font-semibold text-amber-800 hover:underline">
              Manage Certificates →
            </Link>
          </div>
          <div className="space-y-2">
            {alerts.slice(0, 4).map((a) => (
              <div key={a.id} className="bg-white rounded-lg border border-amber-200 px-3.5 py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-slate-900">{a.evidence.certificateNumber}</span>{' '}
                  <span className="text-slate-600">— {a.message}</span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full font-semibold shrink-0 ml-2 ${
                    a.daysRemaining <= 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {a.daysRemaining <= 0 ? 'EXPIRED' : `${a.daysRemaining}d left`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interactive Demo Walkthrough Grid */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-slate-900">Live Feature &amp; Quality-Attribute Demo Map</h2>
            <p className="text-xs text-slate-500">
              Current role: <strong>{user.name}</strong> ({user.role}). Switch roles in the top bar anytime to test audience views &amp; cross-brand isolation.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {[
            {
              title: 'FR3 + QA1: 6-Level Backward & Forward Trace',
              desc: 'Trace LOT-SHIP-NW-01 backward to mills, or LOT-RAW-ORG-01 forward across splits & merges with live ms timing.',
              href: '/trace',
            },
            {
              title: 'FR4 + QA2: Mass Balance & Planted Defect Audit',
              desc: 'Detect over-claimed recycled content, expired certs, >12% cutting loss, and orphan lots automatically.',
              href: '/compliance',
            },
            {
              title: 'FR5: Certificate Upload & Auto-Drop on Expiry',
              desc: 'Click "Simulate Expiry" on GRS-BD-2026-4412 and watch DPP-2026-NW-001 drop the Recycled claim live.',
              href: '/evidence',
            },
            {
              title: 'FR6 + FR7 + FR8: Footprint Allocation & QR Passports',
              desc: 'Toggle MASS vs PIECE_COUNT footprint, switch versions (v1/v2), compare Public vs Brand vs Auditor views.',
              href: '/passports',
            },
            {
              title: 'FR9: Bulk CSV / Excel Factory Import',
              desc: 'Download sample cutting_report_sample.csv and upload to see valid rows committed & bad rows rejected with reasons.',
              href: '/imports',
            },
            {
              title: 'QA5: Config-Only Process Steps & Custom Passport Fields',
              desc: 'Add a new process step, certificate type, emission factor, or passport field live with zero code changes.',
              href: '/settings',
            },
          ].map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="p-4 rounded-xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/30 transition flex items-start gap-3"
            >
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-slate-900">{item.title}</div>
                <div className="text-xs text-slate-600 mt-0.5">{item.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick Sample Downloads */}
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>Pre-seeded Bangladeshi RMG scenario active: <strong>NordicWear AB</strong> &amp; <strong>EuroStyle GmbH</strong> · 4 planted QA2 defects ready.</span>
        </div>
        <Link href="/compliance" className="text-emerald-700 font-semibold hover:underline">
          Run QA2 + QA3 Scans →
        </Link>
      </div>
    </div>
  );
}
