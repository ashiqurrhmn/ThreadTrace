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
    { label: 'Cached Passport Snapshots', value: overview?.cache.diskEntries ?? '—', icon: ShieldCheck, href: '/compliance', color: 'text-purple-600 bg-purple-50' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="card p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white border-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold mb-2">
              EU ESPR Textile Compliance · Digital Product Passport Platform
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

      {/* Offline Notice if Database is Unavailable */}
      {overview?.offlineMode && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <div className="font-semibold text-amber-900 text-sm">Database Offline — High-Availability Passport Cache Active</div>
              <div className="text-xs text-amber-800">
                Primary database queries are temporarily unavailable, but <strong>{overview.cache.diskEntries} public passport snapshots</strong> remain live from resilience cache.
              </div>
            </div>
          </div>
          <Link
            href="/passport/DPP-2026-NW-001"
            target="_blank"
            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold shrink-0"
          >
            Open Cached Passport
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

      {/* Expiry Alerts Banner */}
      {alerts.length > 0 && (
        <div className="card p-5 border-amber-200 bg-amber-50/50">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-amber-950 flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Certificate Expiry Alerts (30-Day Renewal Window)
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

      {/* Platform Modules & Capabilities Grid */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-slate-900">Platform Modules &amp; Capabilities</h2>
            <p className="text-xs text-slate-500">
              Active session: <strong>{user.name}</strong> ({user.role}). Switch audience roles in the top bar to preview role-based access and brand isolation.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {[
            {
              title: 'Multi-Tier Backward & Forward Lineage Trace',
              desc: 'Trace finished export cartons back to spinning mills, or trace raw yarn lots forward across splits and merges to affected shipments.',
              href: '/trace',
            },
            {
              title: 'Automated Compliance & Mass-Balance Auditing',
              desc: 'Continuously monitor process loss limits, organic and recycled claim coverage, certificate validity, and lineage completeness.',
              href: '/compliance',
            },
            {
              title: 'Certificate Lifecycle & Automatic Claim Protection',
              desc: 'Manage GOTS, GRS, OEKO-TEX, and ISO certificates with 30-day renewal alerts and automatic removal of expired claims from passports.',
              href: '/evidence',
            },
            {
              title: 'Environmental Footprint & QR Product Passports',
              desc: 'Compute per-garment water, energy, and CO₂e footprint by mass or piece count, and publish versioned QR Digital Product Passports.',
              href: '/passports',
            },
            {
              title: 'Bulk Factory CSV & Excel Ingestion',
              desc: 'Import daily cutting reports and packing lists with automated row-level mass-balance validation and exception reporting.',
              href: '/imports',
            },
            {
              title: 'Dynamic Process, Certificate & Passport Rules',
              desc: 'Configure process stages, allowed loss thresholds, emission factors, certificate types, and custom passport attributes.',
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

      {/* Workspace Summary */}
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>Active Workspace: <strong>Gazipur Knitwear Export Factory</strong> · Connected Buyers: <strong>NordicWear AB</strong> &amp; <strong>EuroStyle GmbH</strong>.</span>
        </div>
        <Link href="/compliance" className="text-emerald-700 font-semibold hover:underline">
          Open Compliance Center →
        </Link>
      </div>
    </div>
  );
}
