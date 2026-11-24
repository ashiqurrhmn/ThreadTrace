'use client';

import React from 'react';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/80 ${className}`} />;
}

export function KpiGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-5 flex items-center justify-between">
          <div className="space-y-2.5 flex-1">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-7 w-16" />
          </div>
          <Skeleton className="w-11 h-11 rounded-xl shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} className="h-3 w-20" />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="px-4 py-3.5 grid gap-4 items-center"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={`h-3.5 ${c === 0 ? 'w-24' : 'w-full max-w-[140px]'}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailCardSkeleton() {
  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <Skeleton className="h-8 w-28 rounded-lg shrink-0" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 p-3 rounded-lg bg-slate-50">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="space-y-2.5">
        <Skeleton className="h-3 w-36" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-3 rounded-lg border border-slate-200 space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-4 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3 w-48" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SplitPaneSkeleton({ leftCols = 7, rightCols = 5 }: { leftCols?: number; rightCols?: number }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div className={leftCols === 4 ? 'lg:col-span-4 space-y-2.5' : 'lg:col-span-7 card overflow-hidden'}>
        {leftCols === 4 ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card p-4 space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-10 rounded-full" />
              </div>
              <Skeleton className="h-3 w-44" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))
        ) : (
          <>
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <Skeleton className="h-3.5 w-32" />
            </div>
            <div className="divide-y divide-slate-100">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-4 py-3.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-64" />
                  <Skeleton className="h-2.5 w-48" />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className={rightCols === 8 ? 'lg:col-span-8' : 'lg:col-span-5'}>
        <DetailCardSkeleton />
      </div>
    </div>
  );
}

export function TraceSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4 space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
      <div className="card p-5 space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 card p-5 space-y-3">
          <Skeleton className="h-4 w-36" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-3 rounded-lg border border-slate-200 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-60" />
            </div>
          ))}
        </div>
        <div className="lg:col-span-5 card p-5 space-y-3">
          <Skeleton className="h-4 w-36" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ComplianceSkeleton() {
  return (
    <div className="space-y-6">
      <div className="card p-5 space-y-4">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-3 w-80" />
          </div>
          <Skeleton className="h-7 w-44 rounded-full" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <Skeleton className="h-7 w-10 mx-auto" />
              <Skeleton className="h-3 w-24 mx-auto" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      </div>
      <div className="card p-5 space-y-3">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
      <div className="card p-5 space-y-3">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    </div>
  );
}

export function PublicPassportSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-950 via-slate-900 to-slate-100 pb-12">
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-8">
        <div className="flex items-center justify-between mb-5">
          <div className="h-4 w-48 rounded bg-white/15 animate-pulse" />
          <div className="h-5 w-24 rounded-full bg-white/15 animate-pulse" />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2.5 flex-1">
            <div className="h-3.5 w-44 rounded bg-emerald-400/30 animate-pulse" />
            <div className="h-7 w-3/4 rounded bg-white/20 animate-pulse" />
            <div className="h-3 w-56 rounded bg-white/15 animate-pulse" />
          </div>
          <div className="w-20 h-20 rounded-xl bg-white/20 animate-pulse shrink-0" />
        </div>
        <div className="flex gap-2 mt-4">
          <div className="h-6 w-32 rounded-full bg-emerald-500/40 animate-pulse" />
          <div className="h-6 w-36 rounded-full bg-emerald-500/40 animate-pulse" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 space-y-4 -mt-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex justify-between items-center">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-6 w-28" />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <Skeleton className="h-4 w-48" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
