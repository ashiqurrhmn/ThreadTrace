import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { AudienceProxy } from '../patterns/audienceProxy';
import { passportCache } from '../ports/cache.port';
import { AuditService } from '../services/audit.service';
import { AuthService } from '../services/auth.service';
import { ConfigService } from '../services/config.service';
import { EvidenceService } from '../services/evidence.service';
import { FootprintService } from '../services/footprint.service';
import { ImportService } from '../services/import.service';
import { IntegrityService } from '../services/integrity.service';
import { LotEventService } from '../services/lotEvent.service';
import { PassportService } from '../services/passport.service';
import { TraceService } from '../services/trace.service';

async function verifyAll() {
  console.log('🔍 Running ThreadTrace End-to-End Verification (FR1–FR10 & QA2–QA5)...\n');

  const auditor = (await AuthService.demoSwitch('AUDITOR')).user;
  const brandNW = (await AuthService.demoSwitch('BRAND_NW')).user;
  const brandES = (await AuthService.demoSwitch('BRAND_ES')).user;

  // 1. FR3 + QA1: 6-level Backward & Forward Trace
  const backTrace = await TraceService.traceBackward('LOT-SHIP-NW-01', auditor);
  assert(backTrace.maxDepth >= 6, `Expected >= 6 backward depth, got ${backTrace.maxDepth}`);
  assert(backTrace.queryTimeMs < 2000, `Backward trace too slow: ${backTrace.queryTimeMs}ms`);
  console.log(`✅ [FR3/QA1] Backward 6-level trace: ${backTrace.nodeCount} lots, depth=${backTrace.maxDepth}, latency=${backTrace.queryTimeMs}ms`);

  const fwdTrace = await TraceService.traceForward('LOT-RAW-ORG-01', auditor);
  assert(fwdTrace.maxDepth >= 6, `Expected >= 6 forward depth, got ${fwdTrace.maxDepth}`);
  console.log(`✅ [FR3/QA1] Forward 6-level trace: ${fwdTrace.nodeCount} lots, depth=${fwdTrace.maxDepth}, latency=${fwdTrace.queryTimeMs}ms`);

  // 2. FR4: Mass Balance Block Test (> 12% cutting loss blocked)
  const rawLot = await prisma.lot.findUniqueOrThrow({ where: { lotCode: 'LOT-FAB-BLEND-01' } });
  const fac = await prisma.party.findUniqueOrThrow({ where: { code: 'FAC-GAZ-01' } });
  let blocked = false;
  try {
    await LotEventService.recordEvent(
      {
        lotId: rawLot.id,
        eventType: 'CUT',
        partyId: fac.id,
        inputQuantity: 100,
        outputQuantity: 80,
        unit: 'KG',
        inputWeightKg: 100,
        outputWeightKg: 80, // 20% loss > 12% limit -> BLOCK
      },
      auditor
    );
  } catch {
    blocked = true;
  }
  assert(blocked, 'Expected CUT event with 20% loss to be blocked!');
  console.log('✅ [FR4] Mass balance enforcement blocked 20% cutting loss (> 12% limit)');

  // 3. FR6: Footprint Roll-up Strategy Toggle (MASS vs PIECE_COUNT)
  const fpMass = await FootprintService.calculateForLot('LOT-SHIP-NW-01', 'MASS');
  const fpPiece = await FootprintService.calculateForLot('LOT-SHIP-NW-01', 'PIECE_COUNT');
  assert(fpMass.perPiece.waterLiters > 0 && fpMass.perPiece.co2eKg > 0, 'Footprint must be positive');
  console.log(
    `✅ [FR6] Footprint per piece -> MASS: ${fpMass.perPiece.waterLiters}L / ${fpMass.perPiece.co2eKg}kg CO2e | PIECE_COUNT: ${fpPiece.perPiece.waterLiters}L / ${fpPiece.perPiece.co2eKg}kg CO2e`
  );

  // 4. QA2: Planted Defects Audit & Zero Unsupported Claims in Published Passports
  const defectAudit = await AuditService.runClaimAndDefectAudit();
  assert(defectAudit.summaryByCategory.OVER_CLAIMED_CONTENT >= 1, 'Over-claimed defect not caught');
  assert(defectAudit.summaryByCategory.EXPIRED_CERTIFICATE >= 1, 'Expired cert defect not caught');
  assert(defectAudit.summaryByCategory.EXCESS_PROCESS_LOSS >= 1, 'Excess loss defect not caught');
  assert(defectAudit.summaryByCategory.ORPHAN_LOT >= 1, 'Orphan lot defect not caught');
  assert(defectAudit.qa2Passed, 'QA2 failed: unsupported claim leaked into passport');
  const qa2Passport = await PassportService.getPublicPassportWithFallback('DPP-2026-QA2-CHECK');
  const qa2Claims = (qa2Passport.data as { verifiedClaims: { recycledPct: number } }).verifiedClaims;
  assert(qa2Claims.recycledPct <= 30, `Over-claimed 85% should be capped at 30%, got ${qa2Claims.recycledPct}`);
  console.log(
    `✅ [QA2] All 4 planted defect classes detected (${defectAudit.totalDefectsDetected} total) & over-claimed 85% capped at ${qa2Claims.recycledPct}% in passport`
  );

  // 5. QA3: Confidentiality Zero-Leak Scan & Cross-Brand Access Refusal
  const confScan = await AuditService.runConfidentialityScan();
  assert(confScan.qa3Passed && confScan.leaksFound === 0, `Confidentiality leaks found: ${JSON.stringify(confScan.leaks)}`);
  let crossBrandRefused = false;
  try {
    await PassportService.getAudiencePassport('DPP-2026-ES-001', brandNW);
  } catch (err) {
    crossBrandRefused = (err as { status?: number }).status === 403;
  }
  assert(crossBrandRefused, 'Brand NW must receive 403 when requesting Brand ES passport');
  console.log(
    `✅ [QA3] Confidentiality scan: 0 leaks across ${confScan.passportVersionsScanned} passport versions + ${confScan.diskCacheSnapshotsScanned} disk snapshots; cross-brand refused (403)`
  );

  // 6. QA4: Disk Cache Verification + Real-Time Expiry Filtering on Cached Entry
  const cachedEntry = passportCache.get('DPP-2026-NW-001__latest');
  assert(cachedEntry !== null, 'Public passport snapshot missing from local disk cache!');
  const futureFiltered = AudienceProxy.applyRealtimeExpiryFilter(
    cachedEntry!,
    new Date(Date.now() + 20 * 86400 * 1000) // 20 days later -> GRS cert (12 days left) has expired!
  );
  const futureClaims = futureFiltered.verifiedClaims as { recycledPct: number };
  assert(futureClaims.recycledPct === 0, 'Realtime cache expiry filter must drop expired GRS recycled claim!');
  console.log('✅ [QA4/FR5] Local disk cache populated & real-time expiry filter drops expired claims even offline');

  // 7. FR10: Hash-Chain Integrity Verification
  const integrity = await IntegrityService.verifyPassport('DPP-2026-NW-001');
  assert(integrity.verified && integrity.eventsChecked > 0, 'Passport hash-chain integrity check failed');
  console.log(`✅ [FR10] Hash-chain integrity verified across ${integrity.lotsChecked} lots & ${integrity.eventsChecked} events`);

  // 8. FR9: Bulk CSV Import with Valid & Rejected Rows
  const csvBuf = fs.readFileSync(path.join(env.SAMPLES_ABS_DIR, 'cutting_report_sample.csv'));
  const job = await ImportService.processUpload({
    buffer: csvBuf,
    fileName: 'cutting_report_sample.csv',
    importType: 'CUTTING_REPORT',
    user: auditor,
  });
  assert(job.acceptedRows >= 2 && job.rejectedRows >= 2, `Expected >=2 accepted & >=2 rejected, got ${job.acceptedRows}/${job.rejectedRows}`);
  console.log(`✅ [FR9] Bulk CSV import: ${job.acceptedRows} accepted, ${job.rejectedRows} rejected with reasons`);

  // 9. QA5: Config-Only New Process Step & Custom Passport Field
  await ConfigService.upsertProcessConfig({
    code: 'LASER_WASH',
    label: 'Ozone & Laser Denim Finishing',
    sequenceOrder: 8,
    maxLossPercent: 2.5,
    enforcementMode: 'FLAG',
    waterLitersPerKg: 4.5,
    energyKwhPerKg: 1.9,
    co2eKgPerKg: 1.1,
  });
  const cfg = await ConfigService.getAllConfig();
  assert(cfg.processConfigs.some((c) => c.code === 'LASER_WASH'), 'Dynamic process step missing');
  console.log('✅ [QA5] Config-only process step (LASER_WASH) added dynamically without code edits');

  // Re-verify Brand ES still accesses its own passport cleanly
  const esPass = await PassportService.getAudiencePassport('DPP-2026-ES-001', brandES);
  assert(esPass.audienceView === 'BRAND', 'Brand ES should receive BRAND projection');
  console.log('✅ [FR8] Brand ES accesses own passport with BRAND audience projection\n');

  console.log('🎉 ALL AUTOMATED CHECKS PASSED!');
}

verifyAll()
  .catch((err) => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
