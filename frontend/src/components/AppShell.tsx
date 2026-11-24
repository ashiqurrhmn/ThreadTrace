'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  Database,
  FileSpreadsheet,
  GitBranch,
  LayoutDashboard,
  Layers,
  QrCode,
  Settings,
  ShieldCheck,
  Award,
  ExternalLink,
} from 'lucide-react';
import { API_BASE } from '@/lib/api';
import { PersonaKey, useAuth } from '@/lib/auth-context';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/parties', label: 'Parties & Lines (FR1)', icon: Building2 },
  { href: '/lots', label: 'Lots & Events (FR2/4/10)', icon: Layers },
  { href: '/trace', label: 'Lineage Trace (FR3/QA1)', icon: GitBranch },
  { href: '/evidence', label: 'Certificates (FR5)', icon: Award },
  { href: '/passports', label: 'Passports & QR (FR6/7/8)', icon: QrCode },
  { href: '/imports', label: 'Bulk Import (FR9)', icon: FileSpreadsheet },
  { href: '/compliance', label: 'QA2/3/4 Audit', icon: ShieldCheck },
  { href: '/settings', label: 'Config Rules (QA5)', icon: Settings },
];

const PERSONAS: Array<{ key: PersonaKey; label: string; tag: string }> = [
  { key: 'AUDITOR', label: 'EU Auditor', tag: 'Full Access' },
  { key: 'FACTORY_ADMIN', label: 'Factory Admin', tag: 'Gazipur Knit' },
  { key: 'BRAND_NW', label: 'NordicWear', tag: 'Brand A' },
  { key: 'BRAND_ES', label: 'EuroStyle', tag: 'Brand B' },
  { key: 'PUBLIC', label: 'Public', tag: 'Consumer' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { persona, user, switchPersona, loading } = useAuth();
  const [dbUp, setDbUp] = useState<boolean | null>(null);

  // Public QR passport pages render standalone mobile-first view without admin chrome
  const isStandalonePassport = pathname.startsWith('/passport/');

  useEffect(() => {
    if (isStandalonePassport) return;
    let active = true;
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
        const data = await res.json();
        if (active) setDbUp(Boolean(data?.database?.reachable));
      } catch {
        if (active) setDbUp(false);
      }
    };
    checkHealth();
    const timer = setInterval(checkHealth, 12000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isStandalonePassport]);

  if (isStandalonePassport) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Fixed Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 w-64 h-screen bg-slate-900 text-slate-100 flex flex-col border-r border-slate-800">
        <div className="px-5 py-5 border-b border-slate-800">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 font-bold text-lg">
              T
            </div>
            <div>
              <div className="font-bold text-base tracking-tight text-white">ThreadTrace</div>
              <div className="text-[11px] text-emerald-400 font-medium">EU Textile DPP Engine</div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  active
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800 space-y-2 text-xs">
          <Link
            href="/passport/DPP-2026-NW-001"
            target="_blank"
            className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition"
          >
            <span className="font-medium">Open Public QR Page</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <a
            href={`${API_BASE.replace(/\/api\/v1\/?$/, '')}/api/docs`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white transition"
          >
            <span>Swagger OpenAPI Docs</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </aside>

      {/* Main Content (offset by fixed sidebar width) */}
      <div className="flex-1 flex flex-col min-w-0 pl-64">
        {/* Topbar */}
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                dbUp === true
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : dbUp === false
                  ? 'bg-amber-50 text-amber-800 border border-amber-300'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {dbUp === false ? (
                <AlertTriangle className="w-3.5 h-3.5" />
              ) : (
                <Database className="w-3.5 h-3.5" />
              )}
              {dbUp === true
                ? 'PostgreSQL 18 Online'
                : dbUp === false
                ? 'DB Offline — Public Passport Cache Active (QA4)'
                : 'Checking DB...'}
            </span>
            <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-slate-500">
              <Activity className="w-3.5 h-3.5 text-emerald-600" />
              Signed in as <strong className="text-slate-800">{user.name}</strong> ({user.role})
            </span>
          </div>

          {/* 1-Click Audience Role Switcher for Live Demo (FR8 + QA3) */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 mr-1">Demo Role:</span>
            {PERSONAS.map((p) => (
              <button
                key={p.key}
                disabled={loading}
                onClick={() => switchPersona(p.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition ${
                  persona === p.key
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </header>

        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
