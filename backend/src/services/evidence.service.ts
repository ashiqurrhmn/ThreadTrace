import { prisma } from '../db/prisma';
import { ProblemError } from '../errors/problemDetails';
import { expirySubject } from '../patterns/expiryObserver';
import { storagePort } from '../ports/storage.port';
import { ConfigService } from './config.service';

export interface CreateEvidenceInput {
  certificateNumber: string;
  certTypeCode: string;
  issuer: string;
  scope: string;
  partyId?: string | null;
  lotId?: string | null;
  validFrom: string;
  validUntil: string;
  certifiedPercent?: number;
  file?: {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
  };
}

export class EvidenceService {
  private static observerRegistered = false;

  static registerAlertObserver(): void {
    if (this.observerRegistered) return;
    this.observerRegistered = true;

    expirySubject.subscribe('ExpiryAlertRecordObserver', async (ev) => {
      const existing = await prisma.expiryAlert.findFirst({
        where: { evidenceId: ev.evidenceId, acknowledged: false },
      });
      const message =
        ev.kind === 'EXPIRED'
          ? `Certificate ${ev.certificateNumber} (${ev.certTypeCode}) has EXPIRED. Dependent claims were automatically dropped from passports.`
          : `Certificate ${ev.certificateNumber} (${ev.certTypeCode}) expires in ${ev.daysRemaining} day(s). Renewal required.`;

      if (!existing) {
        await prisma.expiryAlert.create({
          data: {
            evidenceId: ev.evidenceId,
            daysRemaining: ev.daysRemaining,
            message,
          },
        });
      } else {
        await prisma.expiryAlert.update({
          where: { id: existing.id },
          data: { daysRemaining: ev.daysRemaining, message },
        });
      }
    });
  }

  private static computeStatus(validUntil: Date, windowDays: number): { status: string; daysRemaining: number } {
    const diffMs = validUntil.getTime() - Date.now();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (daysRemaining <= 0) return { status: 'EXPIRED', daysRemaining };
    if (daysRemaining <= windowDays) return { status: 'EXPIRING_SOON', daysRemaining };
    return { status: 'VALID', daysRemaining };
  }

  static async listEvidences(options: { page: number; limit: number; status?: string; partyId?: string; lotId?: string }) {
    const where: Record<string, unknown> = {};
    if (options.status) where.status = options.status;
    if (options.partyId) where.partyId = options.partyId;
    if (options.lotId) where.lotId = options.lotId;

    const [total, items] = await Promise.all([
      prisma.evidence.count({ where }),
      prisma.evidence.findMany({
        where,
        include: {
          certType: true,
          party: { select: { id: true, code: true, name: true, type: true } },
          lot: { select: { id: true, lotCode: true, materialType: true } },
        },
        orderBy: { validUntil: 'asc' },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
    ]);

    return {
      items,
      page: options.page,
      limit: options.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / options.limit)),
    };
  }

  static async createEvidence(input: CreateEvidenceInput) {
    if (!input.partyId && !input.lotId) {
      throw new ProblemError({
        status: 400,
        title: 'Target Missing',
        detail: 'Evidence must be attached to either a supplier/facility (partyId) or a lot (lotId).',
      });
    }

    const certType = await prisma.certificateTypeConfig.findUnique({
      where: { code: input.certTypeCode.trim().toUpperCase() },
    });
    if (!certType || !certType.active) {
      throw new ProblemError({
        status: 400,
        title: 'Unknown Certificate Type',
        detail: `Certificate type '${input.certTypeCode}' is not configured.`,
      });
    }

    let fileMeta: { fileName: string; filePath: string; mimeType: string } | null = null;
    if (input.file) {
      const saved = await storagePort.save(input.file.buffer, input.file.originalName, input.file.mimeType);
      fileMeta = { fileName: saved.fileName, filePath: saved.filePath, mimeType: saved.mimeType };
    }

    const windowDays = await ConfigService.getExpiryAlertWindowDays();
    const validFrom = new Date(input.validFrom);
    const validUntil = new Date(input.validUntil);
    const { status, daysRemaining } = this.computeStatus(validUntil, windowDays);

    const evidence = await prisma.evidence.create({
      data: {
        certificateNumber: input.certificateNumber.trim().toUpperCase(),
        certTypeCode: certType.code,
        issuer: input.issuer.trim(),
        scope: input.scope.trim(),
        partyId: input.partyId ?? null,
        lotId: input.lotId ?? null,
        validFrom,
        validUntil,
        status,
        claimTag: certType.claimTag,
        certifiedPercent: input.certifiedPercent ?? 100,
        fileName: fileMeta?.fileName ?? null,
        filePath: fileMeta?.filePath ?? null,
        fileMimeType: fileMeta?.mimeType ?? null,
      },
      include: { certType: true },
    });

    if (status === 'EXPIRING_SOON' || status === 'EXPIRED') {
      await expirySubject.notify({
        evidenceId: evidence.id,
        certificateNumber: evidence.certificateNumber,
        certTypeCode: evidence.certTypeCode,
        claimTag: evidence.claimTag,
        lotId: evidence.lotId,
        partyId: evidence.partyId,
        daysRemaining,
        kind: status === 'EXPIRED' ? 'EXPIRED' : 'EXPIRING_SOON',
      });
    }

    return evidence;
  }

  /**
   * Scans all certificates against the 30-day alert window and expired cutoff (FR5).
   * Called by node-cron and manually triggerable in UI/API.
   */
  static async runExpirySweep() {
    const windowDays = await ConfigService.getExpiryAlertWindowDays();
    const evidences = await prisma.evidence.findMany({
      where: { status: { not: 'REVOKED' } },
    });

    let expiringCount = 0;
    let newlyExpiredCount = 0;

    for (const ev of evidences) {
      const { status, daysRemaining } = this.computeStatus(ev.validUntil, windowDays);
      const changed = ev.status !== status;

      if (changed) {
        await prisma.evidence.update({
          where: { id: ev.id },
          data: { status },
        });
      }

      if (status === 'EXPIRING_SOON') {
        expiringCount++;
        await expirySubject.notify({
          evidenceId: ev.id,
          certificateNumber: ev.certificateNumber,
          certTypeCode: ev.certTypeCode,
          claimTag: ev.claimTag,
          lotId: ev.lotId,
          partyId: ev.partyId,
          daysRemaining,
          kind: 'EXPIRING_SOON',
        });
      } else if (status === 'EXPIRED') {
        if (changed) newlyExpiredCount++;
        await expirySubject.notify({
          evidenceId: ev.id,
          certificateNumber: ev.certificateNumber,
          certTypeCode: ev.certTypeCode,
          claimTag: ev.claimTag,
          lotId: ev.lotId,
          partyId: ev.partyId,
          daysRemaining,
          kind: 'EXPIRED',
        });
      }
    }

    return { scanned: evidences.length, expiringSoon: expiringCount, newlyExpired: newlyExpiredCount };
  }

  /**
   * Demo-friendly action: forces a certificate to expire now so the instructor can
   * immediately watch dependent claims drop from affected passports (FR5 + QA2)!
   */
  static async simulateExpire(evidenceId: string) {
    const ev = await prisma.evidence.findUnique({ where: { id: evidenceId } });
    if (!ev) {
      throw new ProblemError({
        status: 404,
        title: 'Evidence Not Found',
        detail: `No certificate found with id '${evidenceId}'.`,
      });
    }

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const updated = await prisma.evidence.update({
      where: { id: evidenceId },
      data: { validUntil: yesterday, status: 'EXPIRED' },
      include: { certType: true },
    });

    await expirySubject.notify({
      evidenceId: updated.id,
      certificateNumber: updated.certificateNumber,
      certTypeCode: updated.certTypeCode,
      claimTag: updated.claimTag,
      lotId: updated.lotId,
      partyId: updated.partyId,
      daysRemaining: -1,
      kind: 'EXPIRED',
    });

    return updated;
  }

  /**
   * Restores a simulated expired certificate to valid (+180 days) and republishes passports.
   */
  static async renewCertificate(evidenceId: string, extendDays = 180) {
    const ev = await prisma.evidence.findUnique({ where: { id: evidenceId } });
    if (!ev) {
      throw new ProblemError({
        status: 404,
        title: 'Evidence Not Found',
        detail: `No certificate found with id '${evidenceId}'.`,
      });
    }

    const newUntil = new Date(Date.now() + extendDays * 24 * 60 * 60 * 1000);
    const updated = await prisma.evidence.update({
      where: { id: evidenceId },
      data: { validUntil: newUntil, status: 'VALID' },
      include: { certType: true },
    });

    await prisma.expiryAlert.updateMany({
      where: { evidenceId },
      data: { acknowledged: true },
    });

    // Notify observer as EXPIRED kind triggers passport republish; also trigger republish cleanly
    await expirySubject.notify({
      evidenceId: updated.id,
      certificateNumber: updated.certificateNumber,
      certTypeCode: updated.certTypeCode,
      claimTag: updated.claimTag,
      lotId: updated.lotId,
      partyId: updated.partyId,
      daysRemaining: extendDays,
      kind: 'EXPIRED', // triggers PassportClaimAutoDropObserver to re-evaluate & republish updated valid state
    });

    return updated;
  }

  static async listAlerts(onlyUnacknowledged = false) {
    return prisma.expiryAlert.findMany({
      where: onlyUnacknowledged ? { acknowledged: false } : undefined,
      include: {
        evidence: {
          include: {
            certType: true,
            party: { select: { id: true, name: true, code: true } },
            lot: { select: { id: true, lotCode: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  static async downloadFile(evidenceId: string) {
    const ev = await prisma.evidence.findUnique({ where: { id: evidenceId } });
    if (!ev || !ev.filePath) {
      throw new ProblemError({
        status: 404,
        title: 'Evidence File Not Found',
        detail: 'No file is attached to this evidence record.',
      });
    }
    const buffer = await storagePort.read(ev.filePath);
    return {
      buffer,
      fileName: ev.fileName ?? 'certificate.pdf',
      mimeType: ev.fileMimeType ?? 'application/octet-stream',
    };
  }
}
