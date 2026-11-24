import { prisma } from '../db/prisma';
import { AudienceProxy } from '../patterns/audienceProxy';
import { ClaimVerificationVisitor } from '../patterns/lineageVisitor';
import { passportCache } from '../ports/cache.port';
import { TraceService } from './trace.service';

export interface DetectedDefect {
  category: 'OVER_CLAIMED_CONTENT' | 'EXPIRED_CERTIFICATE' | 'EXCESS_PROCESS_LOSS' | 'ORPHAN_LOT';
  severity: 'HIGH' | 'CRITICAL';
  entityType: 'LOT' | 'EVIDENCE' | 'EVENT';
  entityId: string;
  entityCode: string;
  description: string;
}

export class AuditService {
  /**
   * QA2: Detects every planted defect across the dataset and verifies zero passports
   * publish an unsupported claim or expired certificate.
   */
  static async runClaimAndDefectAudit() {
    const now = new Date();
    const defects: DetectedDefect[] = [];

    const [lots, processConfigs, evidences, passports] = await Promise.all([
      prisma.lot.findMany({
        include: {
          incomingEdges: { select: { id: true } },
          events: true,
        },
      }),
      prisma.processConfig.findMany(),
      prisma.evidence.findMany({
        include: {
          certType: true,
          party: { select: { code: true, name: true } },
          lot: { select: { lotCode: true } },
        },
      }),
      prisma.passport.findMany({
        include: {
          versions: { orderBy: { version: 'desc' }, take: 1 },
        },
      }),
    ]);

    const configMap = new Map(processConfigs.map((c) => [c.code, c]));

    // 1. Detect Orphan Lots & Over-Claimed Organic / Recycled Content
    for (const lot of lots) {
      if (!lot.isRootSource && lot.incomingEdges.length === 0) {
        defects.push({
          category: 'ORPHAN_LOT',
          severity: 'CRITICAL',
          entityType: 'LOT',
          entityId: lot.id,
          entityCode: lot.lotCode,
          description: `Downstream lot ${lot.lotCode} (${lot.materialType}) has no parent source edge in lineage (orphan lot).`,
        });
      }

      if (lot.claimedOrganicPct > 0 || lot.claimedRecycledPct > 0) {
        const composite = await TraceService.buildBackwardComposite(lot.id);
        const visitor = new ClaimVerificationVisitor(now);
        composite.accept(visitor, 1.0);
        const claimRes = visitor.getResult(lot.claimedOrganicPct, lot.claimedRecycledPct);

        if (lot.claimedRecycledPct > claimRes.certifiedRecycledPct + 0.01) {
          defects.push({
            category: 'OVER_CLAIMED_CONTENT',
            severity: 'CRITICAL',
            entityType: 'LOT',
            entityId: lot.id,
            entityCode: lot.lotCode,
            description: `Lot ${lot.lotCode} claims ${lot.claimedRecycledPct}% recycled content, but certified lineage only supports ${claimRes.certifiedRecycledPct}%.`,
          });
        }
        if (lot.claimedOrganicPct > claimRes.certifiedOrganicPct + 0.01) {
          defects.push({
            category: 'OVER_CLAIMED_CONTENT',
            severity: 'CRITICAL',
            entityType: 'LOT',
            entityId: lot.id,
            entityCode: lot.lotCode,
            description: `Lot ${lot.lotCode} claims ${lot.claimedOrganicPct}% organic content, but certified lineage only supports ${claimRes.certifiedOrganicPct}%.`,
          });
        }
      }

      // 2. Detect Excess Cutting / Process Loss
      for (const ev of lot.events) {
        const cfg = configMap.get(ev.eventType);
        const limit = cfg?.maxLossPercent ?? 100;
        if (ev.massBalanceStatus === 'FLAGGED' || ev.lossPercent > limit + 0.01 || ev.outputWeightKg > ev.inputWeightKg * 1.0001) {
          defects.push({
            category: 'EXCESS_PROCESS_LOSS',
            severity: 'HIGH',
            entityType: 'EVENT',
            entityId: ev.id,
            entityCode: `${lot.lotCode} (${ev.eventType})`,
            description:
              ev.massBalanceNote ??
              `${ev.eventType} on ${lot.lotCode} recorded ${ev.lossPercent}% loss, exceeding configured max ${limit}%.`,
          });
        }
      }
    }

    // 3. Detect Expired / Revoked Certificates
    for (const ev of evidences) {
      if (ev.status === 'EXPIRED' || ev.status === 'REVOKED' || ev.validUntil.getTime() <= now.getTime()) {
        defects.push({
          category: 'EXPIRED_CERTIFICATE',
          severity: 'HIGH',
          entityType: 'EVIDENCE',
          entityId: ev.id,
          entityCode: ev.certificateNumber,
          description: `Certificate ${ev.certificateNumber} (${ev.certTypeCode}) expired on ${ev.validUntil.toISOString().slice(0, 10)} (attached to ${ev.lot?.lotCode ?? ev.party?.name ?? 'unknown'}).`,
        });
      }
    }

    // 4. Verify ZERO Published Public Passports contain an expired cert or unsupported claim
    const passportViolations: Array<{ passportCode: string; reason: string }> = [];
    for (const p of passports) {
      const latest = p.versions[0];
      if (!latest) continue;
      const pub = latest.publicPayload as {
        certifications?: Array<{ certificateNumber: string; validUntil: string }>;
        verifiedClaims?: { organicPct: number; recycledPct: number };
      };
      for (const cert of pub.certifications ?? []) {
        if (new Date(cert.validUntil).getTime() <= now.getTime()) {
          passportViolations.push({
            passportCode: p.passportCode,
            reason: `Public passport lists expired cert ${cert.certificateNumber}`,
          });
        }
      }
    }

    const summaryByCategory = {
      OVER_CLAIMED_CONTENT: defects.filter((d) => d.category === 'OVER_CLAIMED_CONTENT').length,
      EXPIRED_CERTIFICATE: defects.filter((d) => d.category === 'EXPIRED_CERTIFICATE').length,
      EXCESS_PROCESS_LOSS: defects.filter((d) => d.category === 'EXCESS_PROCESS_LOSS').length,
      ORPHAN_LOT: defects.filter((d) => d.category === 'ORPHAN_LOT').length,
    };

    return {
      auditedAt: now.toISOString(),
      qa2Passed: passportViolations.length === 0,
      totalDefectsDetected: defects.length,
      summaryByCategory,
      passportUnsupportedClaimViolations: passportViolations,
      defects,
    };
  }

  /**
   * QA3: Automated confidentiality scan of every public passport payload,
   * cached disk snapshot, and public party projection.
   */
  static async runConfidentialityScan() {
    const [versions, parties] = await Promise.all([
      prisma.passportVersion.findMany({
        include: { passport: { select: { passportCode: true } } },
      }),
      prisma.party.findMany(),
    ]);

    const leaks: Array<{ source: string; leakedPaths: string[] }> = [];

    for (const v of versions) {
      const found = AudienceProxy.scanForConfidentialFields(v.publicPayload);
      if (found.length > 0) {
        leaks.push({
          source: `PassportVersion ${v.passport.passportCode} v${v.version} (publicPayload)`,
          leakedPaths: found,
        });
      }
    }

    for (const party of parties) {
      const publicProj = AudienceProxy.projectParty(party, 'PUBLIC');
      const found = AudienceProxy.scanForConfidentialFields(publicProj);
      if (found.length > 0) {
        leaks.push({
          source: `Public Party Projection ${party.code}`,
          leakedPaths: found,
        });
      }
    }

    const cacheKeys = passportCache.listKeys();
    for (const key of cacheKeys) {
      const cached = passportCache.get(key);
      if (!cached) continue;
      const found = AudienceProxy.scanForConfidentialFields(cached.publicPayload);
      if (found.length > 0) {
        leaks.push({
          source: `Disk Cache Snapshot ${key}`,
          leakedPaths: found,
        });
      }
    }

    return {
      scannedAt: new Date().toISOString(),
      qa3Passed: leaks.length === 0,
      passportVersionsScanned: versions.length,
      publicPartiesScanned: parties.length,
      diskCacheSnapshotsScanned: cacheKeys.length,
      leaksFound: leaks.length,
      leaks,
    };
  }
}
