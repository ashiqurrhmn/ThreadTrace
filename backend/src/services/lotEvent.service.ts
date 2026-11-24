import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { ProblemError } from '../errors/problemDetails';
import { AuthUser } from '../middleware/auth.middleware';
import { assertBrandAccess } from '../middleware/rbac.middleware';
import { AudienceProxy } from '../patterns/audienceProxy';
import { ClaimVerificationVisitor } from '../patterns/lineageVisitor';
import { LotStateMachine, LotStatus } from '../patterns/lotState';
import { computeEventHash } from './integrity.service';
import { TraceService } from './trace.service';

export interface CreateLotInput {
  lotCode: string;
  materialType: string;
  styleCode?: string | null;
  brandId?: string | null;
  partyId: string;
  quantity: number;
  unit: 'KG' | 'PIECES' | 'CARTONS';
  weightKg: number;
  pieceCount?: number | null;
  fibreComposition?: Array<{ fibre: string; percent: number }>;
  claimedOrganicPct?: number;
  claimedRecycledPct?: number;
  isRootSource?: boolean;
}

export interface RecordEventInput {
  lotId: string;
  eventType: string;
  partyId: string;
  productionLineId?: string | null;
  inputQuantity: number;
  outputQuantity: number;
  unit: 'KG' | 'PIECES' | 'CARTONS';
  inputWeightKg: number;
  outputWeightKg: number;
  waterLiters?: number;
  energyKwh?: number;
  co2eKg?: number;
  correctionOfEventId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface SplitLotInput {
  parentLotId: string;
  processStep: string;
  partyId: string;
  productionLineId?: string | null;
  children: Array<{
    lotCode: string;
    materialType: string;
    styleCode?: string | null;
    brandId?: string | null;
    quantity: number;
    unit: 'KG' | 'PIECES' | 'CARTONS';
    weightKg: number;
    pieceCount?: number | null;
    claimedOrganicPct?: number;
    claimedRecycledPct?: number;
  }>;
}

export interface MergeLotsInput {
  parentAllocations: Array<{
    parentLotId: string;
    allocatedWeightKg: number;
    allocatedPieces?: number | null;
  }>;
  processStep: string;
  partyId: string;
  productionLineId?: string | null;
  child: {
    lotCode: string;
    materialType: string;
    styleCode?: string | null;
    brandId?: string | null;
    quantity: number;
    unit: 'KG' | 'PIECES' | 'CARTONS';
    weightKg: number;
    pieceCount?: number | null;
    fibreComposition?: Array<{ fibre: string; percent: number }>;
    claimedOrganicPct?: number;
    claimedRecycledPct?: number;
  };
}

export class LotEventService {
  private static async appendHashedEventTx(
    tx: Prisma.TransactionClient,
    params: {
      lotId: string;
      eventType: string;
      partyId: string;
      productionLineId?: string | null;
      inputQuantity: number;
      outputQuantity: number;
      unit: string;
      inputWeightKg: number;
      outputWeightKg: number;
      lossPercent: number;
      massBalanceStatus: 'PASS' | 'FLAGGED' | 'BLOCKED';
      massBalanceNote?: string | null;
      waterLiters: number;
      energyKwh: number;
      co2eKg: number;
      correctionOfEventId?: string | null;
      metadata?: Record<string, unknown>;
      recordedBy: string;
    }
  ) {
    // Row-level lock on the lot so concurrent writes never corrupt sequenceNum / prevHash
    await tx.$queryRaw`SELECT id FROM lots WHERE id = ${params.lotId} FOR UPDATE`;

    const lastEvent = await tx.lotEvent.findFirst({
      where: { lotId: params.lotId },
      orderBy: { sequenceNum: 'desc' },
    });

    const sequenceNum = (lastEvent?.sequenceNum ?? 0) + 1;
    const prevHash = lastEvent?.eventHash ?? 'GENESIS';
    const occurredAt = new Date();

    const eventHash = computeEventHash(
      {
        lotId: params.lotId,
        sequenceNum,
        eventType: params.eventType,
        partyId: params.partyId,
        inputQuantity: params.inputQuantity,
        outputQuantity: params.outputQuantity,
        unit: params.unit,
        inputWeightKg: params.inputWeightKg,
        outputWeightKg: params.outputWeightKg,
        lossPercent: params.lossPercent,
        massBalanceStatus: params.massBalanceStatus,
        correctionOfEventId: params.correctionOfEventId ?? null,
        recordedBy: params.recordedBy,
        occurredAtIso: occurredAt.toISOString(),
      },
      prevHash
    );

    return tx.lotEvent.create({
      data: {
        lotId: params.lotId,
        eventType: params.eventType,
        partyId: params.partyId,
        productionLineId: params.productionLineId ?? null,
        inputQuantity: params.inputQuantity,
        outputQuantity: params.outputQuantity,
        unit: params.unit,
        inputWeightKg: params.inputWeightKg,
        outputWeightKg: params.outputWeightKg,
        lossPercent: params.lossPercent,
        massBalanceStatus: params.massBalanceStatus,
        massBalanceNote: params.massBalanceNote ?? null,
        waterLiters: params.waterLiters,
        energyKwh: params.energyKwh,
        co2eKg: params.co2eKg,
        correctionOfEventId: params.correctionOfEventId ?? null,
        sequenceNum,
        prevHash,
        eventHash,
        metadata: (params.metadata ?? {}) as object,
        recordedBy: params.recordedBy,
        occurredAt,
      },
    });
  }

  private static async evaluateMassBalance(
    eventType: string,
    inputWeightKg: number,
    outputWeightKg: number
  ): Promise<{
    lossPercent: number;
    status: 'PASS' | 'FLAGGED';
    note: string | null;
    waterPerKg: number;
    energyPerKg: number;
    co2ePerKg: number;
  }> {
    if (eventType.toUpperCase() === 'CORRECTION') {
      return {
        lossPercent: 0,
        status: 'PASS',
        note: 'Immutable correction event recorded.',
        waterPerKg: 0,
        energyPerKg: 0,
        co2ePerKg: 0,
      };
    }

    const config = await prisma.processConfig.findUnique({
      where: { code: eventType.toUpperCase() },
    });

    if (!config || !config.active) {
      throw new ProblemError({
        status: 400,
        title: 'Unknown Process Step',
        detail: `Process step '${eventType}' is not registered in active process configuration.`,
      });
    }

    if (inputWeightKg <= 0 || outputWeightKg < 0) {
      throw new ProblemError({
        status: 422,
        title: 'Invalid Mass Input',
        detail: 'Input weight must be positive and output weight cannot be negative.',
      });
    }

    if (outputWeightKg > inputWeightKg * 1.0001) {
      const msg = `Mass conservation violated for ${config.code}: output (${outputWeightKg} kg) exceeds input (${inputWeightKg} kg).`;
      if (config.enforcementMode === 'BLOCK') {
        throw new ProblemError({
          status: 422,
          title: 'Mass Balance Violation (Blocked)',
          detail: msg,
          type: 'https://threadtrace.local/errors/mass-balance-violation',
        });
      }
      return {
        lossPercent: Math.round(((inputWeightKg - outputWeightKg) / inputWeightKg) * 10000) / 100,
        status: 'FLAGGED',
        note: msg,
        waterPerKg: config.waterLitersPerKg,
        energyPerKg: config.energyKwhPerKg,
        co2ePerKg: config.co2eKgPerKg,
      };
    }

    const lossPercent = Math.round(((inputWeightKg - outputWeightKg) / inputWeightKg) * 10000) / 100;

    if (lossPercent > config.maxLossPercent) {
      const msg = `${config.label} loss (${lossPercent}%) exceeds configured maximum allowed loss (${config.maxLossPercent}%).`;
      if (config.enforcementMode === 'BLOCK') {
        throw new ProblemError({
          status: 422,
          title: 'Mass Balance Loss Limit Exceeded (Blocked)',
          detail: msg,
          type: 'https://threadtrace.local/errors/mass-balance-loss-exceeded',
        });
      }
      return {
        lossPercent,
        status: 'FLAGGED',
        note: msg,
        waterPerKg: config.waterLitersPerKg,
        energyPerKg: config.energyKwhPerKg,
        co2ePerKg: config.co2eKgPerKg,
      };
    }

    return {
      lossPercent,
      status: 'PASS',
      note: null,
      waterPerKg: config.waterLitersPerKg,
      energyPerKg: config.energyKwhPerKg,
      co2ePerKg: config.co2eKgPerKg,
    };
  }

  static async recalculateCertifiedClaims(lotId: string): Promise<{
    certifiedOrganicPct: number;
    certifiedRecycledPct: number;
  }> {
    const lot = await prisma.lot.findUnique({ where: { id: lotId } });
    if (!lot) return { certifiedOrganicPct: 0, certifiedRecycledPct: 0 };

    const rootNode = await TraceService.buildBackwardComposite(lotId);
    const visitor = new ClaimVerificationVisitor(new Date());
    rootNode.accept(visitor);
    const result = visitor.getResult(lot.claimedOrganicPct, lot.claimedRecycledPct);

    await prisma.lot.update({
      where: { id: lotId },
      data: {
        certifiedOrganicPct: result.certifiedOrganicPct,
        certifiedRecycledPct: result.certifiedRecycledPct,
      },
    });

    return {
      certifiedOrganicPct: result.certifiedOrganicPct,
      certifiedRecycledPct: result.certifiedRecycledPct,
    };
  }

  static async listLots(
    user: AuthUser,
    options: { page: number; limit: number; status?: string; brandId?: string; search?: string }
  ) {
    const where: Record<string, unknown> = {};
    if (user.role === 'BRAND_USER') {
      where.brandId = user.brandId;
    } else if (options.brandId) {
      where.brandId = options.brandId;
    }

    if (options.status) where.status = options.status;
    if (options.search) {
      where.OR = [
        { lotCode: { contains: options.search, mode: 'insensitive' } },
        { materialType: { contains: options.search, mode: 'insensitive' } },
        { styleCode: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.lot.count({ where }),
      prisma.lot.findMany({
        where,
        include: {
          party: true,
          brand: true,
          _count: { select: { events: true, outgoingEdges: true, incomingEdges: true, evidences: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
    ]);

    return {
      items: items.map((lot) => ({
        ...lot,
        party: AudienceProxy.projectParty(lot.party, user.role),
      })),
      page: options.page,
      limit: options.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / options.limit)),
    };
  }

  static async getLotById(idOrCode: string, user: AuthUser) {
    const lot = await prisma.lot.findFirst({
      where: { OR: [{ id: idOrCode }, { lotCode: idOrCode }] },
      include: {
        party: true,
        brand: true,
        events: {
          include: {
            party: true,
            productionLine: true,
          },
          orderBy: { sequenceNum: 'asc' },
        },
        incomingEdges: {
          include: { parentLot: { select: { id: true, lotCode: true, materialType: true } } },
        },
        outgoingEdges: {
          include: { childLot: { select: { id: true, lotCode: true, materialType: true } } },
        },
        evidences: { include: { certType: true } },
        passports: true,
      },
    });

    if (!lot) {
      throw new ProblemError({
        status: 404,
        title: 'Lot Not Found',
        detail: `No lot found for '${idOrCode}'.`,
      });
    }

    if (user.role === 'BRAND_USER') {
      assertBrandAccess(user, lot.brandId);
    }

    return {
      ...lot,
      party: AudienceProxy.projectParty(lot.party, user.role),
      events: lot.events.map((ev) => ({
        ...ev,
        party: AudienceProxy.projectParty(ev.party, user.role),
      })),
    };
  }

  static async createLot(input: CreateLotInput, user: AuthUser) {
    const isRoot = input.isRootSource ?? true;

    const created = await prisma.$transaction(async (tx) => {
      const lot = await tx.lot.create({
        data: {
          lotCode: input.lotCode.trim().toUpperCase(),
          materialType: input.materialType.trim(),
          styleCode: input.styleCode?.trim() || null,
          brandId: input.brandId || null,
          partyId: input.partyId,
          status: 'RECEIVED',
          quantity: input.quantity,
          unit: input.unit,
          weightKg: input.weightKg,
          pieceCount: input.pieceCount ?? null,
          fibreComposition: (input.fibreComposition ?? []) as object,
          claimedOrganicPct: input.claimedOrganicPct ?? 0,
          claimedRecycledPct: input.claimedRecycledPct ?? 0,
          isRootSource: isRoot,
        },
      });

      const receiveConfig = await tx.processConfig.findUnique({ where: { code: 'RECEIVE' } });
      await this.appendHashedEventTx(tx, {
        lotId: lot.id,
        eventType: 'RECEIVE',
        partyId: input.partyId,
        inputQuantity: input.quantity,
        outputQuantity: input.quantity,
        unit: input.unit,
        inputWeightKg: input.weightKg,
        outputWeightKg: input.weightKg,
        lossPercent: 0,
        massBalanceStatus: 'PASS',
        waterLiters: Math.round(input.weightKg * (receiveConfig?.waterLitersPerKg ?? 2) * 100) / 100,
        energyKwh: Math.round(input.weightKg * (receiveConfig?.energyKwhPerKg ?? 0.25) * 100) / 100,
        co2eKg: Math.round(input.weightKg * (receiveConfig?.co2eKgPerKg ?? 0.18) * 100) / 100,
        recordedBy: user.email,
      });

      return lot;
    });

    await this.recalculateCertifiedClaims(created.id);
    return prisma.lot.findUnique({ where: { id: created.id }, include: { events: true } });
  }

  static async recordEvent(input: RecordEventInput, user: AuthUser) {
    const lot = await prisma.lot.findUnique({ where: { id: input.lotId } });
    if (!lot) {
      throw new ProblemError({
        status: 404,
        title: 'Lot Not Found',
        detail: `Lot ${input.lotId} does not exist.`,
      });
    }

    const eventType = input.eventType.trim().toUpperCase();
    const mb = await this.evaluateMassBalance(eventType, input.inputWeightKg, input.outputWeightKg);

    const waterLiters =
      input.waterLiters ?? Math.round(input.inputWeightKg * mb.waterPerKg * 100) / 100;
    const energyKwh =
      input.energyKwh ?? Math.round(input.inputWeightKg * mb.energyPerKg * 100) / 100;
    const co2eKg =
      input.co2eKg ?? Math.round(input.inputWeightKg * mb.co2ePerKg * 100) / 100;

    const nextStatus = LotStateMachine.resolveNextStatus(
      lot.status as LotStatus,
      eventType,
      mb.status === 'FLAGGED'
    );

    const event = await prisma.$transaction(async (tx) => {
      const createdEv = await this.appendHashedEventTx(tx, {
        lotId: lot.id,
        eventType,
        partyId: input.partyId,
        productionLineId: input.productionLineId ?? null,
        inputQuantity: input.inputQuantity,
        outputQuantity: input.outputQuantity,
        unit: input.unit,
        inputWeightKg: input.inputWeightKg,
        outputWeightKg: input.outputWeightKg,
        lossPercent: mb.lossPercent,
        massBalanceStatus: mb.status,
        massBalanceNote: mb.note,
        waterLiters,
        energyKwh,
        co2eKg,
        correctionOfEventId: input.correctionOfEventId ?? null,
        metadata: input.metadata,
        recordedBy: user.email,
      });

      await tx.lot.update({
        where: { id: lot.id },
        data: {
          status: nextStatus,
          partyId: input.partyId,
          quantity: eventType === 'CORRECTION' ? lot.quantity : input.outputQuantity,
          unit: eventType === 'CORRECTION' ? lot.unit : input.unit,
          weightKg: eventType === 'CORRECTION' ? lot.weightKg : input.outputWeightKg,
        },
      });

      return createdEv;
    });

    await this.recalculateCertifiedClaims(lot.id);
    return event;
  }

  /**
   * FR2 + FR4: Split 1 parent lot into N child lots with mass-balance check & hash-chained events.
   */
  static async splitLot(input: SplitLotInput, user: AuthUser) {
    if (input.children.length < 2) {
      throw new ProblemError({
        status: 400,
        title: 'Invalid Split',
        detail: 'A split operation requires at least 2 child lots.',
      });
    }

    const parent = await prisma.lot.findUnique({ where: { id: input.parentLotId } });
    if (!parent) {
      throw new ProblemError({
        status: 404,
        title: 'Parent Lot Not Found',
        detail: `Parent lot ${input.parentLotId} does not exist.`,
      });
    }

    const totalChildWeight = input.children.reduce((s, c) => s + c.weightKg, 0);
    const processStep = input.processStep.trim().toUpperCase();
    const mb = await this.evaluateMassBalance(processStep, parent.weightKg, totalChildWeight);

    const result = await prisma.$transaction(async (tx) => {
      const parentEvent = await this.appendHashedEventTx(tx, {
        lotId: parent.id,
        eventType: processStep,
        partyId: input.partyId,
        productionLineId: input.productionLineId ?? null,
        inputQuantity: parent.quantity,
        outputQuantity: totalChildWeight,
        unit: parent.unit,
        inputWeightKg: parent.weightKg,
        outputWeightKg: totalChildWeight,
        lossPercent: mb.lossPercent,
        massBalanceStatus: mb.status,
        massBalanceNote: mb.note,
        waterLiters: Math.round(parent.weightKg * mb.waterPerKg * 100) / 100,
        energyKwh: Math.round(parent.weightKg * mb.energyPerKg * 100) / 100,
        co2eKg: Math.round(parent.weightKg * mb.co2ePerKg * 100) / 100,
        metadata: { operation: 'SPLIT', childCount: input.children.length },
        recordedBy: user.email,
      });

      await tx.lot.update({
        where: { id: parent.id },
        data: { status: mb.status === 'FLAGGED' ? 'FLAGGED' : 'SPLIT' },
      });

      const createdChildren = [];
      for (const child of input.children) {
        const ratio = parent.weightKg > 0 ? Math.round((child.weightKg / parent.weightKg) * 10000) / 10000 : 1 / input.children.length;

        const childLot = await tx.lot.create({
          data: {
            lotCode: child.lotCode.trim().toUpperCase(),
            materialType: child.materialType.trim(),
            styleCode: child.styleCode ?? parent.styleCode,
            brandId: child.brandId ?? parent.brandId,
            partyId: input.partyId,
            status: mb.status === 'FLAGGED' ? 'FLAGGED' : 'IN_PROCESS',
            quantity: child.quantity,
            unit: child.unit,
            weightKg: child.weightKg,
            pieceCount: child.pieceCount ?? null,
            fibreComposition: parent.fibreComposition as object,
            claimedOrganicPct: child.claimedOrganicPct ?? parent.claimedOrganicPct,
            claimedRecycledPct: child.claimedRecycledPct ?? parent.claimedRecycledPct,
            isRootSource: false,
          },
        });

        await tx.lotEdge.create({
          data: {
            parentLotId: parent.id,
            childLotId: childLot.id,
            eventId: parentEvent.id,
            processStep,
            allocatedWeightKg: child.weightKg,
            allocatedPieces: child.pieceCount ?? null,
            allocationRatio: ratio,
          },
        });

        await this.appendHashedEventTx(tx, {
          lotId: childLot.id,
          eventType: processStep,
          partyId: input.partyId,
          productionLineId: input.productionLineId ?? null,
          inputQuantity: child.quantity,
          outputQuantity: child.quantity,
          unit: child.unit,
          inputWeightKg: child.weightKg,
          outputWeightKg: child.weightKg,
          lossPercent: 0,
          massBalanceStatus: mb.status,
          massBalanceNote: mb.note,
          waterLiters: 0,
          energyKwh: 0,
          co2eKg: 0,
          metadata: { splitFromLotId: parent.id, splitFromLotCode: parent.lotCode },
          recordedBy: user.email,
        });

        createdChildren.push(childLot);
      }

      return { parentEvent, children: createdChildren };
    });

    for (const c of result.children) {
      await this.recalculateCertifiedClaims(c.id);
    }

    return result;
  }

  /**
   * FR2 + FR4: Merge N parent lots into 1 child lot with mass-balance & edge ratios.
   */
  static async mergeLots(input: MergeLotsInput, user: AuthUser) {
    if (input.parentAllocations.length < 2) {
      throw new ProblemError({
        status: 400,
        title: 'Invalid Merge',
        detail: 'A merge operation requires at least 2 parent lots.',
      });
    }

    const parentIds = input.parentAllocations.map((p) => p.parentLotId);
    const parents = await prisma.lot.findMany({ where: { id: { in: parentIds } } });
    if (parents.length !== parentIds.length) {
      throw new ProblemError({
        status: 404,
        title: 'Parent Lot Missing',
        detail: 'One or more parent lots specified in the merge do not exist.',
      });
    }

    const totalInputWeight = input.parentAllocations.reduce((s, p) => s + p.allocatedWeightKg, 0);
    const processStep = input.processStep.trim().toUpperCase();
    const mb = await this.evaluateMassBalance(processStep, totalInputWeight, input.child.weightKg);

    const parentMap = new Map(parents.map((p) => [p.id, p]));

    const result = await prisma.$transaction(async (tx) => {
      const childLot = await tx.lot.create({
        data: {
          lotCode: input.child.lotCode.trim().toUpperCase(),
          materialType: input.child.materialType.trim(),
          styleCode: input.child.styleCode ?? null,
          brandId: input.child.brandId ?? parents.find((p) => p.brandId)?.brandId ?? null,
          partyId: input.partyId,
          status: mb.status === 'FLAGGED' ? 'FLAGGED' : 'MERGED',
          quantity: input.child.quantity,
          unit: input.child.unit,
          weightKg: input.child.weightKg,
          pieceCount: input.child.pieceCount ?? null,
          fibreComposition: (input.child.fibreComposition ?? []) as object,
          claimedOrganicPct: input.child.claimedOrganicPct ?? 0,
          claimedRecycledPct: input.child.claimedRecycledPct ?? 0,
          isRootSource: false,
        },
      });

      const mergeEvent = await this.appendHashedEventTx(tx, {
        lotId: childLot.id,
        eventType: processStep,
        partyId: input.partyId,
        productionLineId: input.productionLineId ?? null,
        inputQuantity: totalInputWeight,
        outputQuantity: input.child.quantity,
        unit: input.child.unit,
        inputWeightKg: totalInputWeight,
        outputWeightKg: input.child.weightKg,
        lossPercent: mb.lossPercent,
        massBalanceStatus: mb.status,
        massBalanceNote: mb.note,
        waterLiters: Math.round(totalInputWeight * mb.waterPerKg * 100) / 100,
        energyKwh: Math.round(totalInputWeight * mb.energyPerKg * 100) / 100,
        co2eKg: Math.round(totalInputWeight * mb.co2ePerKg * 100) / 100,
        metadata: { operation: 'MERGE', parentLotIds: parentIds },
        recordedBy: user.email,
      });

      for (const alloc of input.parentAllocations) {
        const p = parentMap.get(alloc.parentLotId)!;
        const ratio = p.weightKg > 0 ? Math.min(1, Math.round((alloc.allocatedWeightKg / p.weightKg) * 10000) / 10000) : 1;

        await tx.lotEdge.create({
          data: {
            parentLotId: p.id,
            childLotId: childLot.id,
            eventId: mergeEvent.id,
            processStep,
            allocatedWeightKg: alloc.allocatedWeightKg,
            allocatedPieces: alloc.allocatedPieces ?? null,
            allocationRatio: ratio,
          },
        });
      }

      return { childLot, mergeEvent };
    });

    await this.recalculateCertifiedClaims(result.childLot.id);
    return result;
  }
}
