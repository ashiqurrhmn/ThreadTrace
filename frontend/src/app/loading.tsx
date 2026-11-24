import React from 'react';
import { KpiGridSkeleton, Skeleton, TableSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-3.5 w-96" />
      </div>
      <KpiGridSkeleton count={3} />
      <TableSkeleton rows={5} cols={5} />
    </div>
  );
}
