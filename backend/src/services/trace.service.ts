import { pgPool } from '../db/pool';
import { prisma } from '../db/prisma';
import { ProblemError } from '../errors/problemDetails';
import { AuthUser } from '../middleware/auth.middleware';
import { assertBrandAccess } from '../middleware/rbac.middleware';
import { AudienceProxy } from '../patterns/audienceProxy';
import { LotLineageNode } from '../patterns/lotComposite';

export interface TraceResult {
  direction: 'BACKWARD' | 'FORWARD';
  queryTimeMs: number;
  targetLot: {
    id: string;
    lotCode: string;
    materialType: string;
    styleCode: string | null;
    status: string;
    quantity: number;
    unit: string;
    weightKg: number;
  };
  maxDepth: number;
  nodeCount: number;
  edgeCount: number;
  nodes: Array<Record<string, unknown>>;
  edges: Array<{
    parentLotId: string;
    parentLotCode: string;
    childLotId: string;
    childLotCode: string;
    processStep: string;
    allocatedWeightKg: number;
    allocatedPieces: number | null;
    allocationRatio: number;
  }>;
  paths: Array<Array<{ lotId: string; lotCode: string; processStep?: string }>>;
  suppliers: Array<Record<string, unknown>>;
  passports?: Array<{ passportCode: string; styleCode: string; shipmentRef: string; brandName: string }>;
}

export class TraceService {
  private static async resolveTargetLot(identifier: string) {
    // Allow lookup by lot ID, lotCode, OR styleCode (picks latest carton/shipped lot for that style)
    let lot = await prisma.lot.findFirst({
      where: {
        OR: [{ id: identifier }, { lotCode: identifier }],
      },
      include: { party: true, brand: true },
    });

    if (!lot) {
      lot = await prisma.lot.findFirst({
        where: { styleCode: identifier },
        orderBy: { createdAt: 'desc' },
        include: { party: true, brand: true },
      });
    }

    if (!lot) {
      throw new ProblemError({
        status: 404,
        title: 'Lot or Style Not Found',
        detail: `Could not find any lot or style matching '${identifier}'.`,
      });
    }

    return lot;
  }

  /**
   * FR3 + QA1: Fast 6+ level backward trace using PostgreSQL WITH RECURSIVE over indexed lot_edges.
   */
  static async traceBackward(identifier: string, user: AuthUser, maxDepth = 10): Promise<TraceResult> {
    const start = performance.now();
    const target = await this.resolveTargetLot(identifier);
    if (user.role === 'BRAND_USER') {
      assertBrandAccess(user, target.brandId);
    }

    const { rows } = await pgPool.query<{
      lot_id: string;
      depth: number;
      parent_lot_id: string | null;
      child_lot_id: string | null;
      process_step: string | null;
      allocated_weight_kg: number | null;
      allocated_pieces: number | null;
      allocation_ratio: number | null;
      path: string[];
    }>(
      `
      WITH RECURSIVE lineage AS (
        SELECT
          $1::text AS lot_id,
          0 AS depth,
          NULL::text AS parent_lot_id,
          NULL::text AS child_lot_id,
          NULL::text AS process_step,
          NULL::double precision AS allocated_weight_kg,
          NULL::integer AS allocated_pieces,
          NULL::double precision AS allocation_ratio,
          ARRAY[$1::text] AS path
        UNION ALL
        SELECT
          e."parentLotId" AS lot_id,
          l.depth + 1 AS depth,
          e."parentLotId" AS parent_lot_id,
          e."childLotId" AS child_lot_id,
          e."processStep" AS process_step,
          e."allocatedWeightKg" AS allocated_weight_kg,
          e."allocatedPieces" AS allocated_pieces,
          e."allocationRatio" AS allocation_ratio,
          l.path || e."parentLotId" AS path
        FROM lot_edges e
        INNER JOIN lineage l ON e."childLotId" = l.lot_id
        WHERE l.depth < $2
          AND NOT (e."parentLotId" = ANY(l.path))
      )
      SELECT * FROM lineage ORDER BY depth ASC
      `,
      [target.id, maxDepth]
    );

    const lotIds = Array.from(new Set(rows.map((r) => r.lot_id)));
    const depthMap = new Map<string, number>();
    for (const r of rows) {
      const existing = depthMap.get(r.lot_id);
      if (existing === undefined || r.depth < existing) {
        depthMap.set(r.lot_id, r.depth);
      }
    }

    const lots = await prisma.lot.findMany({
      where: { id: { in: lotIds } },
      include: {
        party: true,
        brand: true,
        events: { orderBy: { sequenceNum: 'asc' } },
      },
    });

    const lotMap = new Map(lots.map((l) => [l.id, l]));

    const edgeSet = new Map<string, TraceResult['edges'][number]>();
    for (const r of rows) {
      if (r.parent_lot_id && r.child_lot_id) {
        const key = `${r.parent_lot_id}->${r.child_lot_id}:${r.process_step}`;
        if (!edgeSet.has(key)) {
          edgeSet.set(key, {
            parentLotId: r.parent_lot_id,
            parentLotCode: lotMap.get(r.parent_lot_id)?.lotCode ?? r.parent_lot_id,
            childLotId: r.child_lot_id,
            childLotCode: lotMap.get(r.child_lot_id)?.lotCode ?? r.child_lot_id,
            processStep: r.process_step ?? 'TRANSFER',
            allocatedWeightKg: r.allocated_weight_kg ?? 0,
            allocatedPieces: r.allocated_pieces,
            allocationRatio: r.allocation_ratio ?? 1,
          });
        }
      }
    }

    // Build leaf-to-root unique paths (reversed to read Source -> Target)
    const parentIds = new Set(Array.from(edgeSet.values()).map((e) => e.childLotId));
    const leafRows = rows.filter((r) => !rows.some((other) => other.child_lot_id === r.lot_id));
    const paths = (leafRows.length > 0 ? leafRows : rows.slice(0, 1)).map((r) =>
      [...r.path].reverse().map((id) => ({
        lotId: id,
        lotCode: lotMap.get(id)?.lotCode ?? id,
        processStep: lotMap.get(id)?.events[lotMap.get(id)!.events.length - 1]?.eventType,
      }))
    );

    const uniqueParties = new Map<string, Record<string, unknown>>();
    for (const lot of lots) {
      if (!uniqueParties.has(lot.party.id)) {
        uniqueParties.set(lot.party.id, AudienceProxy.projectParty(lot.party, user.role));
      }
    }

    const queryTimeMs = Math.round((performance.now() - start) * 100) / 100;

    return {
      direction: 'BACKWARD',
      queryTimeMs,
      targetLot: {
        id: target.id,
        lotCode: target.lotCode,
        materialType: target.materialType,
        styleCode: target.styleCode,
        status: target.status,
        quantity: target.quantity,
        unit: target.unit,
        weightKg: target.weightKg,
      },
      maxDepth: Math.max(0, ...rows.map((r) => r.depth)),
      nodeCount: lots.length,
      edgeCount: edgeSet.size,
      nodes: lots
        .sort((a, b) => (depthMap.get(b.id) ?? 0) - (depthMap.get(a.id) ?? 0))
        .map((l) => ({
          id: l.id,
          lotCode: l.lotCode,
          materialType: l.materialType,
          styleCode: l.styleCode,
          status: l.status,
          depthFromTarget: depthMap.get(l.id) ?? 0,
          quantity: l.quantity,
          unit: l.unit,
          weightKg: l.weightKg,
          pieceCount: l.pieceCount,
          isRootSource: l.isRootSource,
          hasIncomingEdge: parentIds.has(l.id),
          brandName: l.brand?.name ?? null,
          party: AudienceProxy.projectParty(l.party, user.role),
          eventCount: l.events.length,
          latestEvent: l.events[l.events.length - 1]?.eventType ?? null,
        })),
      edges: Array.from(edgeSet.values()),
      paths,
      suppliers: Array.from(uniqueParties.values()),
    };
  }

  /**
   * FR3 + QA1: Fast 6+ level forward trace (fabric lot -> all cartons, shipments, buyers).
   */
  static async traceForward(identifier: string, user: AuthUser, maxDepth = 10): Promise<TraceResult> {
    const start = performance.now();
    const target = await this.resolveTargetLot(identifier);
    if (user.role === 'BRAND_USER' && target.brandId) {
      assertBrandAccess(user, target.brandId);
    }

    const { rows } = await pgPool.query<{
      lot_id: string;
      depth: number;
      parent_lot_id: string | null;
      child_lot_id: string | null;
      process_step: string | null;
      allocated_weight_kg: number | null;
      allocated_pieces: number | null;
      allocation_ratio: number | null;
      path: string[];
    }>(
      `
      WITH RECURSIVE lineage AS (
        SELECT
          $1::text AS lot_id,
          0 AS depth,
          NULL::text AS parent_lot_id,
          NULL::text AS child_lot_id,
          NULL::text AS process_step,
          NULL::double precision AS allocated_weight_kg,
          NULL::integer AS allocated_pieces,
          NULL::double precision AS allocation_ratio,
          ARRAY[$1::text] AS path
        UNION ALL
        SELECT
          e."childLotId" AS lot_id,
          l.depth + 1 AS depth,
          e."parentLotId" AS parent_lot_id,
          e."childLotId" AS child_lot_id,
          e."processStep" AS process_step,
          e."allocatedWeightKg" AS allocated_weight_kg,
          e."allocatedPieces" AS allocated_pieces,
          e."allocationRatio" AS allocation_ratio,
          l.path || e."childLotId" AS path
        FROM lot_edges e
        INNER JOIN lineage l ON e."parentLotId" = l.lot_id
        WHERE l.depth < $2
          AND NOT (e."childLotId" = ANY(l.path))
      )
      SELECT * FROM lineage ORDER BY depth ASC
      `,
      [target.id, maxDepth]
    );

    const lotIds = Array.from(new Set(rows.map((r) => r.lot_id)));
    const depthMap = new Map<string, number>();
    for (const r of rows) {
      const existing = depthMap.get(r.lot_id);
      if (existing === undefined || r.depth < existing) {
        depthMap.set(r.lot_id, r.depth);
      }
    }

    let lots = await prisma.lot.findMany({
      where: { id: { in: lotIds } },
      include: {
        party: true,
        brand: true,
        events: { orderBy: { sequenceNum: 'asc' } },
        passports: { include: { brand: true } },
      },
    });

    // Strict cross-brand scoping (FR8 / QA3): Brand user only sees unbranded raw inputs + their own brand's lots
    if (user.role === 'BRAND_USER') {
      lots = lots.filter((l) => !l.brandId || l.brandId === user.brandId);
    }

    const allowedIds = new Set(lots.map((l) => l.id));
    const lotMap = new Map(lots.map((l) => [l.id, l]));

    const edgeSet = new Map<string, TraceResult['edges'][number]>();
    for (const r of rows) {
      if (r.parent_lot_id && r.child_lot_id && allowedIds.has(r.parent_lot_id) && allowedIds.has(r.child_lot_id)) {
        const key = `${r.parent_lot_id}->${r.child_lot_id}:${r.process_step}`;
        if (!edgeSet.has(key)) {
          edgeSet.set(key, {
            parentLotId: r.parent_lot_id,
            parentLotCode: lotMap.get(r.parent_lot_id)?.lotCode ?? r.parent_lot_id,
            childLotId: r.child_lot_id,
            childLotCode: lotMap.get(r.child_lot_id)?.lotCode ?? r.child_lot_id,
            processStep: r.process_step ?? 'TRANSFER',
            allocatedWeightKg: r.allocated_weight_kg ?? 0,
            allocatedPieces: r.allocated_pieces,
            allocationRatio: r.allocation_ratio ?? 1,
          });
        }
      }
    }

    const filteredRows = rows.filter((r) => r.path.every((id) => allowedIds.has(id)));
    const terminalRows = filteredRows.filter((r) => !filteredRows.some((o) => o.parent_lot_id === r.lot_id));
    const paths = (terminalRows.length > 0 ? terminalRows : filteredRows.slice(0, 1)).map((r) =>
      r.path.map((id) => ({
        lotId: id,
        lotCode: lotMap.get(id)?.lotCode ?? id,
        processStep: lotMap.get(id)?.events[lotMap.get(id)!.events.length - 1]?.eventType,
      }))
    );

    const uniqueParties = new Map<string, Record<string, unknown>>();
    const passports: NonNullable<TraceResult['passports']> = [];
    for (const lot of lots) {
      if (!uniqueParties.has(lot.party.id)) {
        uniqueParties.set(lot.party.id, AudienceProxy.projectParty(lot.party, user.role));
      }
      for (const p of lot.passports) {
        if (user.role !== 'BRAND_USER' || p.brandId === user.brandId) {
          passports.push({
            passportCode: p.passportCode,
            styleCode: p.styleCode,
            shipmentRef: p.shipmentRef,
            brandName: p.brand.name,
          });
        }
      }
    }

    const queryTimeMs = Math.round((performance.now() - start) * 100) / 100;

    return {
      direction: 'FORWARD',
      queryTimeMs,
      targetLot: {
        id: target.id,
        lotCode: target.lotCode,
        materialType: target.materialType,
        styleCode: target.styleCode,
        status: target.status,
        quantity: target.quantity,
        unit: target.unit,
        weightKg: target.weightKg,
      },
      maxDepth: Math.max(0, ...filteredRows.map((r) => r.depth)),
      nodeCount: lots.length,
      edgeCount: edgeSet.size,
      nodes: lots
        .sort((a, b) => (depthMap.get(a.id) ?? 0) - (depthMap.get(b.id) ?? 0))
        .map((l) => ({
          id: l.id,
          lotCode: l.lotCode,
          materialType: l.materialType,
          styleCode: l.styleCode,
          status: l.status,
          depthFromSource: depthMap.get(l.id) ?? 0,
          quantity: l.quantity,
          unit: l.unit,
          weightKg: l.weightKg,
          pieceCount: l.pieceCount,
          brandName: l.brand?.name ?? null,
          party: AudienceProxy.projectParty(l.party, user.role),
          eventCount: l.events.length,
          latestEvent: l.events[l.events.length - 1]?.eventType ?? null,
        })),
      edges: Array.from(edgeSet.values()),
      paths,
      suppliers: Array.from(uniqueParties.values()),
      passports,
    };
  }

  /**
   * Builds a Composite Pattern LotLineageNode tree for Visitor roll-ups (Footprint & Claims).
   */
  static async buildBackwardComposite(targetLotId: string): Promise<LotLineageNode> {
    const { rows } = await pgPool.query<{
      lot_id: string;
      parent_lot_id: string | null;
      child_lot_id: string | null;
      process_step: string | null;
      allocated_weight_kg: number | null;
      allocated_pieces: number | null;
      allocation_ratio: number | null;
    }>(
      `
      WITH RECURSIVE anc AS (
        SELECT
          $1::text AS lot_id,
          NULL::text AS parent_lot_id,
          NULL::text AS child_lot_id,
          NULL::text AS process_step,
          NULL::double precision AS allocated_weight_kg,
          NULL::integer AS allocated_pieces,
          NULL::double precision AS allocation_ratio,
          ARRAY[$1::text] AS path
        UNION ALL
        SELECT
          e."parentLotId",
          e."parentLotId",
          e."childLotId",
          e."processStep",
          e."allocatedWeightKg",
          e."allocatedPieces",
          e."allocationRatio",
          a.path || e."parentLotId"
        FROM lot_edges e
        JOIN anc a ON e."childLotId" = a.lot_id
        WHERE NOT (e."parentLotId" = ANY(a.path))
          AND array_length(a.path, 1) <= 12
      )
      SELECT * FROM anc
      `,
      [targetLotId]
    );

    const lotIds = Array.from(new Set(rows.map((r) => r.lot_id)));
    const lots = await prisma.lot.findMany({
      where: { id: { in: lotIds } },
      include: {
        party: {
          include: {
            evidences: { include: { certType: true } },
          },
        },
        events: {
          include: { party: true },
          orderBy: { sequenceNum: 'asc' },
        },
        evidences: { include: { certType: true } },
      },
    });

    const nodeMap = new Map<string, LotLineageNode>();
    for (const lot of lots) {
      const combinedEvidences = [...lot.evidences, ...lot.party.evidences];
      const uniqueEvidenceMap = new Map(combinedEvidences.map((e) => [e.id, e]));

      const node = new LotLineageNode({
        id: lot.id,
        lotCode: lot.lotCode,
        materialType: lot.materialType,
        styleCode: lot.styleCode,
        status: lot.status,
        quantity: lot.quantity,
        unit: lot.unit,
        weightKg: lot.weightKg,
        pieceCount: lot.pieceCount,
        isRootSource: lot.isRootSource,
        claimedOrganicPct: lot.claimedOrganicPct,
        claimedRecycledPct: lot.claimedRecycledPct,
        events: lot.events.map((ev) => ({
          id: ev.id,
          eventType: ev.eventType,
          partyId: ev.partyId,
          partyName: ev.party.name,
          partyType: ev.party.type,
          partyCity: ev.party.city,
          partyCountry: ev.party.country,
          inputWeightKg: ev.inputWeightKg,
          outputWeightKg: ev.outputWeightKg,
          lossPercent: ev.lossPercent,
          massBalanceStatus: ev.massBalanceStatus,
          waterLiters: ev.waterLiters,
          energyKwh: ev.energyKwh,
          co2eKg: ev.co2eKg,
          occurredAt: ev.occurredAt.toISOString(),
        })),
        evidences: Array.from(uniqueEvidenceMap.values()).map((e) => ({
          id: e.id,
          certificateNumber: e.certificateNumber,
          certTypeCode: e.certTypeCode,
          certTypeName: e.certType.name,
          claimTag: e.claimTag ?? e.certType.claimTag,
          certifiedPercent: e.certifiedPercent,
          issuer: e.issuer,
          scope: e.scope,
          validFrom: e.validFrom.toISOString(),
          validUntil: e.validUntil.toISOString(),
          status: e.status,
          partyId: e.partyId,
          lotId: e.lotId,
        })),
      });

      nodeMap.set(lot.id, node);
    }

    const wiredEdges = new Set<string>();
    for (const r of rows) {
      if (r.parent_lot_id && r.child_lot_id) {
        const key = `${r.parent_lot_id}->${r.child_lot_id}:${r.process_step}`;
        if (wiredEdges.has(key)) continue;
        wiredEdges.add(key);

        const parentNode = nodeMap.get(r.parent_lot_id);
        const childNode = nodeMap.get(r.child_lot_id);
        if (parentNode && childNode) {
          childNode.addParent(parentNode, {
            processStep: r.process_step ?? 'TRANSFER',
            allocatedWeightKg: r.allocated_weight_kg ?? parentNode.weightKg,
            allocatedPieces: r.allocated_pieces,
            allocationRatio: r.allocation_ratio ?? 1.0,
          });
        }
      }
    }

    const root = nodeMap.get(targetLotId);
    if (!root) {
      throw new ProblemError({
        status: 404,
        title: 'Lot Not Found',
        detail: `Lot ${targetLotId} could not be loaded for composite lineage.`,
      });
    }
    return root;
  }
}
