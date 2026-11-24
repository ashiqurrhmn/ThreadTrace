import { prisma } from '../db/prisma';
import { ProblemError } from '../errors/problemDetails';
import { AuthUser } from '../middleware/auth.middleware';
import { getImportAdapter } from '../patterns/importAdapter';
import { LotEventService } from './lotEvent.service';

export interface RejectedRowDetail {
  rowNumber: number;
  lotCode: string;
  reason: string;
  rawData: Record<string, unknown>;
}

export class ImportService {
  /**
   * FR9: Bulk CSV / Excel import (cutting reports, packing lists, lot events)
   * with strict row-by-row validation and rejection reporting.
   */
  static async processUpload(params: {
    buffer: Buffer;
    fileName: string;
    importType: 'CUTTING_REPORT' | 'PACKING_LIST' | 'LOT_EVENTS';
    user: AuthUser;
  }) {
    const adapter = getImportAdapter(params.fileName);
    const rows = adapter.parse(params.buffer);

    if (rows.length === 0) {
      throw new ProblemError({
        status: 400,
        title: 'Empty Import File',
        detail: 'The uploaded CSV/Excel file contains no data rows.',
      });
    }

    const [parties, lots] = await Promise.all([
      prisma.party.findMany({ select: { id: true, code: true } }),
      prisma.lot.findMany({ select: { id: true, lotCode: true } }),
    ]);

    const partyByCode = new Map(parties.map((p) => [p.code.toUpperCase(), p.id]));
    const lotByCode = new Map(lots.map((l) => [l.lotCode.toUpperCase(), l.id]));

    let acceptedRows = 0;
    const rejectedDetails: RejectedRowDetail[] = [];

    for (const row of rows) {
      const d = row.data;
      const lotCode = String(d.lotCode ?? d.lot_code ?? '').trim().toUpperCase();
      const partyCode = String(d.partyCode ?? d.party_code ?? '').trim().toUpperCase();
      const defaultEvent =
        params.importType === 'CUTTING_REPORT'
          ? 'CUT'
          : params.importType === 'PACKING_LIST'
          ? 'PACK'
          : 'SEW';
      const eventType = String(d.eventType ?? d.event_type ?? defaultEvent).trim().toUpperCase();
      const unitRaw = String(d.unit ?? 'KG').trim().toUpperCase();
      const unit = (['KG', 'PIECES', 'CARTONS'].includes(unitRaw) ? unitRaw : 'KG') as
        | 'KG'
        | 'PIECES'
        | 'CARTONS';

      const inputQuantity = Number(d.inputQuantity ?? d.input_quantity ?? d.inputWeightKg ?? d.input_weight_kg);
      const outputQuantity = Number(d.outputQuantity ?? d.output_quantity ?? d.outputWeightKg ?? d.output_weight_kg);
      const inputWeightKg = Number(d.inputWeightKg ?? d.input_weight_kg ?? inputQuantity);
      const outputWeightKg = Number(d.outputWeightKg ?? d.output_weight_kg ?? outputQuantity);

      if (!lotCode) {
        rejectedDetails.push({
          rowNumber: row.rowNumber,
          lotCode: '(missing)',
          reason: 'Missing required column: lotCode',
          rawData: d,
        });
        continue;
      }

      const lotId = lotByCode.get(lotCode);
      if (!lotId) {
        rejectedDetails.push({
          rowNumber: row.rowNumber,
          lotCode,
          reason: `Unknown lotCode '${lotCode}' — register or split lot first.`,
          rawData: d,
        });
        continue;
      }

      const partyId = partyByCode.get(partyCode);
      if (!partyId) {
        rejectedDetails.push({
          rowNumber: row.rowNumber,
          lotCode,
          reason: `Unknown partyCode '${partyCode || '(empty)'}'.`,
          rawData: d,
        });
        continue;
      }

      if (!Number.isFinite(inputWeightKg) || inputWeightKg <= 0 || !Number.isFinite(outputWeightKg) || outputWeightKg < 0) {
        rejectedDetails.push({
          rowNumber: row.rowNumber,
          lotCode,
          reason: `Invalid weight values (inputWeightKg=${d.inputWeightKg}, outputWeightKg=${d.outputWeightKg}).`,
          rawData: d,
        });
        continue;
      }

      try {
        await LotEventService.recordEvent(
          {
            lotId,
            eventType,
            partyId,
            inputQuantity: Number.isFinite(inputQuantity) && inputQuantity > 0 ? inputQuantity : inputWeightKg,
            outputQuantity: Number.isFinite(outputQuantity) && outputQuantity >= 0 ? outputQuantity : outputWeightKg,
            unit,
            inputWeightKg,
            outputWeightKg,
            metadata: { importedFromFile: params.fileName, rowNumber: row.rowNumber },
          },
          params.user
        );
        acceptedRows++;
      } catch (err) {
        rejectedDetails.push({
          rowNumber: row.rowNumber,
          lotCode,
          reason: err instanceof Error ? err.message : 'Row failed business validation',
          rawData: d,
        });
      }
    }

    const rejectedRows = rejectedDetails.length;
    const status =
      acceptedRows === rows.length ? 'COMPLETED' : acceptedRows > 0 ? 'PARTIAL' : 'FAILED';

    const job = await prisma.importJob.create({
      data: {
        fileName: params.fileName,
        format: adapter.format,
        importType: params.importType,
        status,
        totalRows: rows.length,
        acceptedRows,
        rejectedRows,
        rejectedDetails: rejectedDetails as unknown as object,
        createdBy: params.user.email,
      },
    });

    return job;
  }

  static async listJobs(page = 1, limit = 20) {
    const [total, items] = await Promise.all([
      prisma.importJob.count(),
      prisma.importJob.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
