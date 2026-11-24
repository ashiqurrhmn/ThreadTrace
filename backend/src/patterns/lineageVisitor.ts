import { AllocationStrategy } from './allocationStrategy';
import { LineageEvidenceSummary, LineageVisitor, LotLineageNode } from './lotComposite';

export interface FootprintStepBreakdown {
  processStep: string;
  waterLiters: number;
  energyKwh: number;
  co2eKg: number;
}

export interface FootprintRollupResult {
  allocationMethod: string;
  totalWaterLiters: number;
  totalEnergyKwh: number;
  totalCo2eKg: number;
  pieceCount: number;
  perPiece: {
    waterLiters: number;
    energyKwh: number;
    co2eKg: number;
  };
  byProcessStep: FootprintStepBreakdown[];
}

/**
 * Visitor Pattern (FR6): Walks the Composite lot lineage tree and rolls up
 * Water, Energy, and CO2e allocated via the configured AllocationStrategy.
 */
export class FootprintRollupVisitor implements LineageVisitor {
  private totalWater = 0;
  private totalEnergy = 0;
  private totalCo2e = 0;
  private readonly stepMap = new Map<string, { water: number; energy: number; co2e: number }>();
  private readonly strategy: AllocationStrategy;

  constructor(strategy: AllocationStrategy) {
    this.strategy = strategy;
  }

  visit(node: LotLineageNode, inheritedFraction: number, visited: Set<string>): void {
    const visitKey = `${node.id}:${inheritedFraction.toFixed(4)}`;
    if (visited.has(visitKey)) return;
    visited.add(visitKey);

    for (const ev of node.events) {
      const w = ev.waterLiters * inheritedFraction;
      const e = ev.energyKwh * inheritedFraction;
      const c = ev.co2eKg * inheritedFraction;

      this.totalWater += w;
      this.totalEnergy += e;
      this.totalCo2e += c;

      const prev = this.stepMap.get(ev.eventType) ?? { water: 0, energy: 0, co2e: 0 };
      prev.water += w;
      prev.energy += e;
      prev.co2e += c;
      this.stepMap.set(ev.eventType, prev);
    }

    for (const parentLink of node.parents) {
      const ratio = this.strategy.computeShareRatio({
        allocatedWeightKg: parentLink.allocatedWeightKg,
        parentTotalWeightKg: parentLink.node.weightKg,
        allocatedPieces: parentLink.allocatedPieces,
        parentTotalPieces: parentLink.node.pieceCount,
        fallbackRatio: parentLink.allocationRatio,
      });
      parentLink.node.accept(this, inheritedFraction * ratio, visited);
    }
  }

  getResult(targetPieceCount: number): FootprintRollupResult {
    const pieces = Math.max(1, targetPieceCount || 1);
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const round3 = (n: number) => Math.round(n * 1000) / 1000;

    return {
      allocationMethod: this.strategy.method,
      totalWaterLiters: round2(this.totalWater),
      totalEnergyKwh: round2(this.totalEnergy),
      totalCo2eKg: round2(this.totalCo2e),
      pieceCount: pieces,
      perPiece: {
        waterLiters: round2(this.totalWater / pieces),
        energyKwh: round3(this.totalEnergy / pieces),
        co2eKg: round3(this.totalCo2e / pieces),
      },
      byProcessStep: Array.from(this.stepMap.entries()).map(([processStep, vals]) => ({
        processStep,
        waterLiters: round2(vals.water),
        energyKwh: round2(vals.energy),
        co2eKg: round2(vals.co2e),
      })),
    };
  }
}

export interface ClaimRollupResult {
  certifiedOrganicPct: number;
  certifiedRecycledPct: number;
  activeEvidences: LineageEvidenceSummary[];
  expiredOrRevokedEvidences: LineageEvidenceSummary[];
  droppedClaims: Array<{ claimTag: string; reason: string }>;
}

/**
 * Visitor Pattern (FR4, FR5, QA2): Computes verifiable organic/recycled % across lineage
 * and collects active vs expired certificates so unsupported claims never reach a passport.
 */
export class ClaimVerificationVisitor implements LineageVisitor {
  private readonly now: Date;
  private readonly activeMap = new Map<string, LineageEvidenceSummary>();
  private readonly invalidMap = new Map<string, LineageEvidenceSummary>();
  private readonly rootContributions: Array<{
    weightShare: number;
    organicPct: number;
    recycledPct: number;
  }> = [];

  constructor(now: Date = new Date()) {
    this.now = now;
  }

  private isEvidenceCurrentlyValid(ev: LineageEvidenceSummary): boolean {
    if (ev.status === 'EXPIRED' || ev.status === 'REVOKED') return false;
    return new Date(ev.validUntil).getTime() > this.now.getTime();
  }

  visit(node: LotLineageNode, inheritedFraction: number, visited: Set<string>): void {
    const visitKey = `${node.id}:${inheritedFraction.toFixed(4)}`;
    if (visited.has(visitKey)) return;
    visited.add(visitKey);

    let localOrganicCert = 0;
    let localRecycledCert = 0;

    for (const ev of node.evidences) {
      if (this.isEvidenceCurrentlyValid(ev)) {
        this.activeMap.set(ev.id, ev);
        if (ev.claimTag === 'ORGANIC') {
          localOrganicCert = Math.max(localOrganicCert, ev.certifiedPercent);
        }
        if (ev.claimTag === 'RECYCLED') {
          localRecycledCert = Math.max(localRecycledCert, ev.certifiedPercent);
        }
      } else {
        this.invalidMap.set(ev.id, ev);
      }
    }

    if (node.parents.length === 0) {
      // Root lot (or orphan): only counts toward certified % if it is a real root source with valid cert
      if (node.isRootSource) {
        this.rootContributions.push({
          weightShare: inheritedFraction,
          organicPct: localOrganicCert,
          recycledPct: localRecycledCert,
        });
      }
      return;
    }

    // Weight share across multiple merged parents
    const totalParentAllocWeight = node.parents.reduce((acc, p) => acc + Math.max(0, p.allocatedWeightKg), 0);

    for (const parentLink of node.parents) {
      const shareWithinMerge =
        totalParentAllocWeight > 0
          ? parentLink.allocatedWeightKg / totalParentAllocWeight
          : 1 / node.parents.length;
      parentLink.node.accept(this, inheritedFraction * shareWithinMerge, visited);
    }
  }

  getResult(claimedOrganicPct: number, claimedRecycledPct: number): ClaimRollupResult {
    const totalShare = this.rootContributions.reduce((s, r) => s + r.weightShare, 0);
    let certOrganic = 0;
    let certRecycled = 0;

    if (totalShare > 0) {
      certOrganic =
        this.rootContributions.reduce((s, r) => s + (r.weightShare / totalShare) * r.organicPct, 0);
      certRecycled =
        this.rootContributions.reduce((s, r) => s + (r.weightShare / totalShare) * r.recycledPct, 0);
    }

    // Clamp to 0..100
    certOrganic = Math.round(Math.min(100, Math.max(0, certOrganic)) * 10) / 10;
    certRecycled = Math.round(Math.min(100, Math.max(0, certRecycled)) * 10) / 10;

    const droppedClaims: Array<{ claimTag: string; reason: string }> = [];
    if (claimedOrganicPct > certOrganic) {
      droppedClaims.push({
        claimTag: 'ORGANIC',
        reason: `Claimed ${claimedOrganicPct}% organic exceeds certified lineage support (${certOrganic}%).`,
      });
    }
    if (claimedRecycledPct > certRecycled) {
      droppedClaims.push({
        claimTag: 'RECYCLED',
        reason: `Claimed ${claimedRecycledPct}% recycled exceeds certified lineage support (${certRecycled}%).`,
      });
    }

    const activeTags = new Set(Array.from(this.activeMap.values()).map((e) => e.claimTag).filter(Boolean));
    for (const inv of this.invalidMap.values()) {
      if (inv.claimTag && !activeTags.has(inv.claimTag)) {
        droppedClaims.push({
          claimTag: inv.claimTag,
          reason: `Certificate ${inv.certificateNumber} (${inv.certTypeCode}) is ${inv.status.toLowerCase()} / expired on ${inv.validUntil.slice(0, 10)}.`,
        });
      }
    }

    return {
      certifiedOrganicPct: certOrganic,
      certifiedRecycledPct: certRecycled,
      activeEvidences: Array.from(this.activeMap.values()),
      expiredOrRevokedEvidences: Array.from(this.invalidMap.values()),
      droppedClaims,
    };
  }
}
