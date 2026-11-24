import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { pgPool } from '../db/pool';
import { ProblemError } from '../errors/problemDetails';

export interface CanonicalEventHashInput {
  lotId: string;
  sequenceNum: number;
  eventType: string;
  partyId: string;
  inputQuantity: number;
  outputQuantity: number;
  unit: string;
  inputWeightKg: number;
  outputWeightKg: number;
  lossPercent: number;
  massBalanceStatus: string;
  correctionOfEventId: string | null;
  recordedBy: string;
  occurredAtIso: string;
}

/**
 * Deterministic SHA-256 hash chaining per lot (FR10).
 */
export function computeEventHash(payload: CanonicalEventHashInput, prevHash: string): string {
  const canonical = JSON.stringify({
    lotId: payload.lotId,
    sequenceNum: payload.sequenceNum,
    eventType: payload.eventType,
    partyId: payload.partyId,
    inputQuantity: Number(payload.inputQuantity.toFixed(4)),
    outputQuantity: Number(payload.outputQuantity.toFixed(4)),
    unit: payload.unit,
    inputWeightKg: Number(payload.inputWeightKg.toFixed(4)),
    outputWeightKg: Number(payload.outputWeightKg.toFixed(4)),
    lossPercent: Number(payload.lossPercent.toFixed(4)),
    massBalanceStatus: payload.massBalanceStatus,
    correctionOfEventId: payload.correctionOfEventId ?? null,
    recordedBy: payload.recordedBy,
    occurredAtIso: payload.occurredAtIso,
    prevHash,
  });

  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export interface LotIntegrityResult {
  lotId: string;
  lotCode: string;
  valid: boolean;
  eventsChecked: number;
  headHash: string;
  brokenEvents: Array<{
    eventId: string;
    sequenceNum: number;
    reason: string;
    expectedHash: string;
    storedHash: string;
  }>;
}

export class IntegrityService {
  static async verifyLot(lotIdOrCode: string): Promise<LotIntegrityResult> {
    const lot = await prisma.lot.findFirst({
      where: {
        OR: [{ id: lotIdOrCode }, { lotCode: lotIdOrCode }],
      },
      include: {
        events: {
          orderBy: { sequenceNum: 'asc' },
        },
      },
    });

    if (!lot) {
      throw new ProblemError({
        status: 404,
        title: 'Lot Not Found',
        detail: `No lot found for identifier '${lotIdOrCode}'.`,
      });
    }

    let expectedPrevHash = 'GENESIS';
    const brokenEvents: LotIntegrityResult['brokenEvents'] = [];

    for (const ev of lot.events) {
      if (ev.prevHash !== expectedPrevHash) {
        brokenEvents.push({
          eventId: ev.id,
          sequenceNum: ev.sequenceNum,
          reason: `Broken prevHash pointer: expected '${expectedPrevHash.slice(0, 12)}...', stored '${ev.prevHash.slice(0, 12)}...'`,
          expectedHash: expectedPrevHash,
          storedHash: ev.prevHash,
        });
      }

      const recomputed = computeEventHash(
        {
          lotId: ev.lotId,
          sequenceNum: ev.sequenceNum,
          eventType: ev.eventType,
          partyId: ev.partyId,
          inputQuantity: ev.inputQuantity,
          outputQuantity: ev.outputQuantity,
          unit: ev.unit,
          inputWeightKg: ev.inputWeightKg,
          outputWeightKg: ev.outputWeightKg,
          lossPercent: ev.lossPercent,
          massBalanceStatus: ev.massBalanceStatus,
          correctionOfEventId: ev.correctionOfEventId,
          recordedBy: ev.recordedBy,
          occurredAtIso: ev.occurredAt.toISOString(),
        },
        ev.prevHash
      );

      if (recomputed !== ev.eventHash) {
        brokenEvents.push({
          eventId: ev.id,
          sequenceNum: ev.sequenceNum,
          reason: 'Payload hash mismatch — event fields were altered after recording!',
          expectedHash: recomputed,
          storedHash: ev.eventHash,
        });
      }

      expectedPrevHash = ev.eventHash;
    }

    return {
      lotId: lot.id,
      lotCode: lot.lotCode,
      valid: brokenEvents.length === 0,
      eventsChecked: lot.events.length,
      headHash: expectedPrevHash,
      brokenEvents,
    };
  }

  /**
   * Verifies every lot and event across the entire backward lineage behind a Passport (FR10).
   */
  static async verifyPassport(passportCode: string) {
    const passport = await prisma.passport.findUnique({
      where: { passportCode },
    });

    if (!passport) {
      throw new ProblemError({
        status: 404,
        title: 'Passport Not Found',
        detail: `No passport found with code '${passportCode}'.`,
      });
    }

    // Collect all ancestor lot IDs using fast recursive CTE
    const { rows } = await pgPool.query<{ lot_id: string }>(
      `
      WITH RECURSIVE anc AS (
        SELECT $1::text AS lot_id, ARRAY[$1::text] AS path
        UNION ALL
        SELECT e."parentLotId", a.path || e."parentLotId"
        FROM lot_edges e
        JOIN anc a ON e."childLotId" = a.lot_id
        WHERE NOT (e."parentLotId" = ANY(a.path))
          AND array_length(a.path, 1) <= 12
      )
      SELECT DISTINCT lot_id FROM anc
      `,
      [passport.lotId]
    );

    const lotResults: LotIntegrityResult[] = [];
    for (const row of rows) {
      lotResults.push(await this.verifyLot(row.lot_id));
    }

    const totalEventsChecked = lotResults.reduce((sum, r) => sum + r.eventsChecked, 0);
    const allValid = lotResults.every((r) => r.valid);
    const aggregateHash = crypto
      .createHash('sha256')
      .update(
        lotResults
          .map((r) => `${r.lotId}:${r.headHash}`)
          .sort()
          .join('|')
      )
      .digest('hex');

    return {
      passportCode,
      verified: allValid,
      lotsChecked: lotResults.length,
      eventsChecked: totalEventsChecked,
      integrityHash: aggregateHash,
      lots: lotResults,
      verifiedAt: new Date().toISOString(),
    };
  }
}
