/**
 * Composite Pattern (FR3, FR6): Models recursive supply-chain lot lineage nodes uniformly.
 */
export interface LineageEventSummary {
  id: string;
  eventType: string;
  partyId: string;
  partyName: string;
  partyType: string;
  partyCity: string;
  partyCountry: string;
  inputWeightKg: number;
  outputWeightKg: number;
  lossPercent: number;
  massBalanceStatus: string;
  waterLiters: number;
  energyKwh: number;
  co2eKg: number;
  occurredAt: string;
}

export interface LineageEvidenceSummary {
  id: string;
  certificateNumber: string;
  certTypeCode: string;
  certTypeName: string;
  claimTag: string | null;
  certifiedPercent: number;
  issuer: string;
  scope: string;
  validFrom: string;
  validUntil: string;
  status: string;
  partyId: string | null;
  lotId: string | null;
}

export interface LineageVisitor {
  visit(node: LotLineageNode, inheritedFraction: number, visited: Set<string>): void;
}

export class LotLineageNode {
  public readonly id: string;
  public readonly lotCode: string;
  public readonly materialType: string;
  public readonly styleCode: string | null;
  public readonly status: string;
  public readonly quantity: number;
  public readonly unit: string;
  public readonly weightKg: number;
  public readonly pieceCount: number | null;
  public readonly isRootSource: boolean;
  public readonly claimedOrganicPct: number;
  public readonly claimedRecycledPct: number;
  public readonly events: LineageEventSummary[];
  public readonly evidences: LineageEvidenceSummary[];
  public readonly parents: Array<{
    node: LotLineageNode;
    processStep: string;
    allocatedWeightKg: number;
    allocatedPieces: number | null;
    allocationRatio: number;
  }> = [];

  constructor(params: {
    id: string;
    lotCode: string;
    materialType: string;
    styleCode: string | null;
    status: string;
    quantity: number;
    unit: string;
    weightKg: number;
    pieceCount: number | null;
    isRootSource: boolean;
    claimedOrganicPct: number;
    claimedRecycledPct: number;
    events: LineageEventSummary[];
    evidences: LineageEvidenceSummary[];
  }) {
    this.id = params.id;
    this.lotCode = params.lotCode;
    this.materialType = params.materialType;
    this.styleCode = params.styleCode;
    this.status = params.status;
    this.quantity = params.quantity;
    this.unit = params.unit;
    this.weightKg = params.weightKg;
    this.pieceCount = params.pieceCount;
    this.isRootSource = params.isRootSource;
    this.claimedOrganicPct = params.claimedOrganicPct;
    this.claimedRecycledPct = params.claimedRecycledPct;
    this.events = params.events;
    this.evidences = params.evidences;
  }

  addParent(
    node: LotLineageNode,
    edge: {
      processStep: string;
      allocatedWeightKg: number;
      allocatedPieces: number | null;
      allocationRatio: number;
    }
  ): void {
    this.parents.push({ node, ...edge });
  }

  accept(visitor: LineageVisitor, inheritedFraction = 1.0, visited: Set<string> = new Set()): void {
    visitor.visit(this, inheritedFraction, visited);
  }
}
