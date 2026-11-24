/**
 * Strategy Pattern (FR6, QA5): Configurable footprint allocation across lot splits & merges.
 */
export type AllocationMethod = 'MASS' | 'PIECE_COUNT';

export interface EdgeAllocationContext {
  allocatedWeightKg: number;
  parentTotalWeightKg: number;
  allocatedPieces: number | null;
  parentTotalPieces: number | null;
  fallbackRatio: number;
}

export interface AllocationStrategy {
  readonly method: AllocationMethod;
  computeShareRatio(ctx: EdgeAllocationContext): number;
}

export class MassAllocationStrategy implements AllocationStrategy {
  public readonly method: AllocationMethod = 'MASS';

  computeShareRatio(ctx: EdgeAllocationContext): number {
    if (ctx.parentTotalWeightKg > 0 && ctx.allocatedWeightKg > 0) {
      return Math.min(1, Math.max(0, ctx.allocatedWeightKg / ctx.parentTotalWeightKg));
    }
    return Math.min(1, Math.max(0, ctx.fallbackRatio || 1));
  }
}

export class PieceCountAllocationStrategy implements AllocationStrategy {
  public readonly method: AllocationMethod = 'PIECE_COUNT';

  computeShareRatio(ctx: EdgeAllocationContext): number {
    if (ctx.parentTotalPieces && ctx.parentTotalPieces > 0 && ctx.allocatedPieces && ctx.allocatedPieces > 0) {
      return Math.min(1, Math.max(0, ctx.allocatedPieces / ctx.parentTotalPieces));
    }
    // Fallback to mass ratio for upstream fabric lots measured only in kg
    if (ctx.parentTotalWeightKg > 0 && ctx.allocatedWeightKg > 0) {
      return Math.min(1, Math.max(0, ctx.allocatedWeightKg / ctx.parentTotalWeightKg));
    }
    return Math.min(1, Math.max(0, ctx.fallbackRatio || 1));
  }
}

export function getAllocationStrategy(method: string | undefined): AllocationStrategy {
  if (method?.toUpperCase() === 'PIECE_COUNT') {
    return new PieceCountAllocationStrategy();
  }
  return new MassAllocationStrategy();
}
