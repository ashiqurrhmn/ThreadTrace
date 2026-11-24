import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { AuthUser } from '../middleware/auth.middleware';
import { ConfigService } from '../services/config.service';
import { EvidenceService } from '../services/evidence.service';
import { computeEventHash } from '../services/integrity.service';
import { LotEventService } from '../services/lotEvent.service';
import { PassportService } from '../services/passport.service';

async function seedDemo() {
  console.log('🌱 Starting ThreadTrace realistic Bangladeshi RMG demo seed...');

  // Register observers
  EvidenceService.registerAlertObserver();
  PassportService.registerExpiryObserver();

  // Clear existing cache snapshots
  fs.mkdirSync(env.CACHE_ABS_DIR, { recursive: true });
  for (const f of fs.readdirSync(env.CACHE_ABS_DIR)) {
    if (f.endsWith('.json')) fs.unlinkSync(path.join(env.CACHE_ABS_DIR, f));
  }

  // Clean existing tables in dependency order
  await prisma.expiryAlert.deleteMany();
  await prisma.passportVersion.deleteMany();
  await prisma.passport.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.lotEdge.deleteMany();
  await prisma.lotEvent.deleteMany();
  await prisma.lot.deleteMany();
  await prisma.productionLine.deleteMany();
  await prisma.importJob.deleteMany();
  await prisma.user.deleteMany();
  await prisma.party.deleteMany();
  await prisma.brand.deleteMany();

  // 1. Seed dynamic process, certificate, and system settings (QA5)
  await ConfigService.ensureDefaults();

  // 2. Seed European Brands
  const nordicWear = await prisma.brand.create({
    data: { code: 'NORDICWEAR', name: 'NordicWear AB', country: 'Sweden' },
  });
  const euroStyle = await prisma.brand.create({
    data: { code: 'EUROSTYLE', name: 'EuroStyle GmbH', country: 'Germany' },
  });

  // 3. Seed Demo Users (Password: Password123!)
  const passwordHash = await bcrypt.hash('Password123!', 10);
  await prisma.user.createMany({
    data: [
      {
        email: 'auditor@eu-compliance.org',
        passwordHash,
        name: 'Elena Lindqvist (EU Auditor)',
        role: 'AUDITOR',
        brandId: null,
      },
      {
        email: 'admin@gazipurknit.bd',
        passwordHash,
        name: 'Tanvir Ahmed (Factory Admin)',
        role: 'FACTORY_ADMIN',
        brandId: null,
      },
      {
        email: 'sourcing@nordicwear.se',
        passwordHash,
        name: 'Maja Bergström (NordicWear)',
        role: 'BRAND_USER',
        brandId: nordicWear.id,
      },
      {
        email: 'sourcing@eurostyle.de',
        passwordHash,
        name: 'Lukas Weber (EuroStyle)',
        role: 'BRAND_USER',
        brandId: euroStyle.id,
      },
    ],
  });

  const adminUser: AuthUser = {
    id: 'seed-admin',
    email: 'admin@gazipurknit.bd',
    name: 'Tanvir Ahmed',
    role: 'FACTORY_ADMIN',
    brandId: null,
  };

  // 4. Seed Parties & Facilities (FR1 + confidential fields for FR8/QA3)
  const spinningMill = await prisma.party.create({
    data: {
      code: 'MILL-NAR-01',
      name: 'Narayanganj Organic Spinning Mill',
      type: 'SPINNING_MILL',
      country: 'Bangladesh',
      city: 'Narayanganj',
      exactAddress: 'Plot 14, Fatullah Industrial Zone, Narayanganj 1421',
      workerCount: 640,
      unitPriceUsd: 3.85,
      contactEmail: 'ops@narayanganjspin.bd',
    },
  });

  const recycledMill = await prisma.party.create({
    data: {
      code: 'MILL-TNG-01',
      name: 'Tongi Recycled Poly-Filament Mill',
      type: 'FABRIC_MILL',
      country: 'Bangladesh',
      city: 'Gazipur',
      exactAddress: 'Sector 7, BSCIC Industrial Area, Tongi, Gazipur 1710',
      workerCount: 420,
      unitPriceUsd: 2.95,
      contactEmail: 'compliance@tongirecycled.bd',
    },
  });

  const dyeHouse = await prisma.party.create({
    data: {
      code: 'DYE-SAV-01',
      name: 'Savar Eco Dye & Knit House',
      type: 'DYE_HOUSE',
      country: 'Bangladesh',
      city: 'Savar',
      exactAddress: 'Road 3, DEPZ Extension, Ashulia, Savar 1349',
      workerCount: 510,
      unitPriceUsd: 1.45,
      contactEmail: 'lab@savarecodye.bd',
    },
  });

  const washPlant = await prisma.party.create({
    data: {
      code: 'WASH-ASH-01',
      name: 'Ashulia Zero-Discharge Wash Plant',
      type: 'WASH_PLANT',
      country: 'Bangladesh',
      city: 'Dhaka',
      exactAddress: 'House 22, Zirabo Road, Ashulia, Dhaka 1341',
      workerCount: 280,
      unitPriceUsd: 0.72,
      contactEmail: 'env@ashuliawash.bd',
    },
  });

  const factory = await prisma.party.create({
    data: {
      code: 'FAC-GAZ-01',
      name: 'Gazipur Knitwear Export Factory',
      type: 'FACTORY',
      country: 'Bangladesh',
      city: 'Gazipur',
      exactAddress: 'Holding 88, Konabari Industrial Park, Gazipur 1700',
      workerCount: 1850,
      unitPriceUsd: 4.6,
      contactEmail: 'merchandiser@gazipurknit.bd',
    },
  });

  const trimsSupplier = await prisma.party.create({
    data: {
      code: 'TRIM-CTG-01',
      name: 'Chattogram Eco Trims & Labels Ltd.',
      type: 'TRIMS_SUPPLIER',
      country: 'Bangladesh',
      city: 'Chattogram',
      exactAddress: 'Plot 5, CEPZ Sector 2, Chattogram 4223',
      workerCount: 195,
      unitPriceUsd: 0.35,
      contactEmail: 'sales@ctgecotrims.bd',
    },
  });

  // Production Lines
  const cutLine = await prisma.productionLine.create({
    data: { code: 'CUT-L1', name: 'Auto-Cutter Line 01', partyId: factory.id, processType: 'CUT', capacityPerDay: 2400 },
  });
  const sewLine1 = await prisma.productionLine.create({
    data: { code: 'SEW-L1', name: 'Knit Sewing Line A', partyId: factory.id, processType: 'SEW', capacityPerDay: 1200 },
  });
  const sewLine2 = await prisma.productionLine.create({
    data: { code: 'SEW-L2', name: 'Knit Sewing Line B', partyId: factory.id, processType: 'SEW', capacityPerDay: 1200 },
  });
  const finishLine = await prisma.productionLine.create({
    data: { code: 'FIN-L1', name: 'Steam Finish & QC Line', partyId: factory.id, processType: 'FINISH', capacityPerDay: 2000 },
  });

  // 5. Build 6-Level Split & Merge Garment Lineage (Levels 0 -> 6)
  // LEVEL 0: Root Raw Material Lots
  const rawOrganic = (await LotEventService.createLot(
    {
      lotCode: 'LOT-RAW-ORG-01',
      materialType: '100% Organic Combed Cotton Yarn',
      partyId: spinningMill.id,
      quantity: 500,
      unit: 'KG',
      weightKg: 500,
      fibreComposition: [{ fibre: 'Organic Cotton', percent: 100 }],
      claimedOrganicPct: 100,
      claimedRecycledPct: 0,
      isRootSource: true,
    },
    adminUser
  ))!;

  const rawRecycled = (await LotEventService.createLot(
    {
      lotCode: 'LOT-RAW-REC-01',
      materialType: '100% rPET Recycled Polyester Filament',
      partyId: recycledMill.id,
      quantity: 250,
      unit: 'KG',
      weightKg: 250,
      fibreComposition: [{ fibre: 'Recycled Polyester', percent: 100 }],
      claimedOrganicPct: 0,
      claimedRecycledPct: 100,
      isRootSource: true,
    },
    adminUser
  ))!;

  // Attach sample certificates (FR5) BEFORE building downstream lineage so claims verify cleanly!
  const samplePdf = (title: string) =>
    Buffer.from(`%PDF-1.4\n% ThreadTrace Sample Certificate: ${title}\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n`, 'utf-8');

  const daysFromNow = (d: number) => new Date(Date.now() + d * 86400 * 1000).toISOString();

  await EvidenceService.createEvidence({
    certificateNumber: 'GOTS-BD-2026-8841',
    certTypeCode: 'GOTS',
    issuer: 'Control Union Certifications',
    scope: 'Organic cotton spinning & combed yarn batches',
    partyId: spinningMill.id,
    lotId: rawOrganic.id,
    validFrom: daysFromNow(-120),
    validUntil: daysFromNow(245),
    certifiedPercent: 100,
    file: { buffer: samplePdf('GOTS Organic Cotton'), originalName: 'GOTS-BD-2026-8841.pdf', mimeType: 'application/pdf' },
  });

  // Expiring within 30 days (12 days left) -> triggers FR5 30-day alert!
  await EvidenceService.createEvidence({
    certificateNumber: 'GRS-BD-2026-4412',
    certTypeCode: 'GRS',
    issuer: 'Textile Exchange / Intertek',
    scope: 'Post-consumer recycled polyester filament',
    partyId: recycledMill.id,
    lotId: rawRecycled.id,
    validFrom: daysFromNow(-353),
    validUntil: daysFromNow(12),
    certifiedPercent: 100,
    file: { buffer: samplePdf('GRS Recycled Polyester'), originalName: 'GRS-BD-2026-4412.pdf', mimeType: 'application/pdf' },
  });

  await EvidenceService.createEvidence({
    certificateNumber: 'OEKO-BD-2026-9910',
    certTypeCode: 'OEKO_TEX',
    issuer: 'Hohenstein Textile Testing Institute',
    scope: 'Reactive low-impact dyeing & finishing auxiliaries',
    partyId: dyeHouse.id,
    validFrom: daysFromNow(-90),
    validUntil: daysFromNow(275),
    certifiedPercent: 100,
    file: { buffer: samplePdf('OEKO-TEX 100'), originalName: 'OEKO-BD-2026-9910.pdf', mimeType: 'application/pdf' },
  });

  await EvidenceService.createEvidence({
    certificateNumber: 'ISO14-GAZ-2026-102',
    certTypeCode: 'ISO_14001',
    issuer: 'SGS Bangladesh',
    scope: 'Factory environmental management system',
    partyId: factory.id,
    validFrom: daysFromNow(-60),
    validUntil: daysFromNow(305),
    certifiedPercent: 100,
    file: { buffer: samplePdf('ISO 14001'), originalName: 'ISO14-GAZ-2026-102.pdf', mimeType: 'application/pdf' },
  });

  await EvidenceService.createEvidence({
    certificateNumber: 'LAB-TRIM-2026-309',
    certTypeCode: 'LAB_TEST',
    issuer: 'Bureau Veritas Dhaka Lab',
    scope: 'Nickel-free recycled trim & care label testing',
    partyId: trimsSupplier.id,
    validFrom: daysFromNow(-20),
    validUntil: daysFromNow(160),
    certifiedPercent: 100,
    file: { buffer: samplePdf('Lab Test Report'), originalName: 'LAB-TRIM-2026-309.pdf', mimeType: 'application/pdf' },
  });

  // LEVEL 1: Merge 280 kg Organic Cotton + 120 kg Recycled Poly -> Blended Dyed Fabric Roll (70/30)
  const mergedFabric = await LotEventService.mergeLots(
    {
      processStep: 'WASH_DYE',
      partyId: dyeHouse.id,
      parentAllocations: [
        { parentLotId: rawOrganic.id, allocatedWeightKg: 280 },
        { parentLotId: rawRecycled.id, allocatedWeightKg: 120 },
      ],
      child: {
        lotCode: 'LOT-FAB-BLEND-01',
        materialType: '70/30 Organic Cotton / rPET Single Jersey (Navy)',
        quantity: 390,
        unit: 'KG',
        weightKg: 390, // 2.5% dye/wash loss <= 4%
        fibreComposition: [
          { fibre: 'Organic Cotton', percent: 70 },
          { fibre: 'Recycled Polyester', percent: 30 },
        ],
        claimedOrganicPct: 70,
        claimedRecycledPct: 30,
      },
    },
    adminUser
  );

  // LEVEL 2: Split Fabric Roll (CUT) into 2 Brand Cutting Lots (NordicWear & EuroStyle) — 8.2% loss <= 12%
  const splitCut = await LotEventService.splitLot(
    {
      parentLotId: mergedFabric.childLot.id,
      processStep: 'CUT',
      partyId: factory.id,
      productionLineId: cutLine.id,
      children: [
        {
          lotCode: 'LOT-CUT-NW-01',
          materialType: 'Cut T-Shirt Panels (NordicWear)',
          styleCode: 'NW-TEE-2026',
          brandId: nordicWear.id,
          quantity: 900,
          unit: 'PIECES',
          weightKg: 225,
          pieceCount: 900,
          claimedOrganicPct: 70,
          claimedRecycledPct: 30,
        },
        {
          lotCode: 'LOT-CUT-ES-01',
          materialType: 'Cut Polo Panels (EuroStyle)',
          styleCode: 'ES-POLO-2026',
          brandId: euroStyle.id,
          quantity: 520,
          unit: 'PIECES',
          weightKg: 133,
          pieceCount: 520,
          claimedOrganicPct: 70,
          claimedRecycledPct: 30,
        },
      ],
    },
    adminUser
  );

  const cutNW = splitCut.children[0];
  const cutES = splitCut.children[1];

  // LEVEL 3: Split NordicWear Cut Lot across 2 Sewing Lines (SEW-L1 & SEW-L2)
  const splitSewNW = await LotEventService.splitLot(
    {
      parentLotId: cutNW.id,
      processStep: 'SEW',
      partyId: factory.id,
      productionLineId: sewLine1.id,
      children: [
        {
          lotCode: 'LOT-SEW-NW-L1',
          materialType: 'Sewn T-Shirts Batch A (Line 1)',
          styleCode: 'NW-TEE-2026',
          brandId: nordicWear.id,
          quantity: 540,
          unit: 'PIECES',
          weightKg: 133,
          pieceCount: 540,
          claimedOrganicPct: 70,
          claimedRecycledPct: 30,
        },
        {
          lotCode: 'LOT-SEW-NW-L2',
          materialType: 'Sewn T-Shirts Batch B (Line 2)',
          styleCode: 'NW-TEE-2026',
          brandId: nordicWear.id,
          quantity: 350,
          unit: 'PIECES',
          weightKg: 88,
          pieceCount: 350,
          claimedOrganicPct: 70,
          claimedRecycledPct: 30,
        },
      ],
    },
    adminUser
  );

  // LEVEL 4: Merge NordicWear Sewing Batches in Wash & Finishing (FINISH)
  const finishNW = await LotEventService.mergeLots(
    {
      processStep: 'FINISH',
      partyId: washPlant.id,
      productionLineId: finishLine.id,
      parentAllocations: [
        { parentLotId: splitSewNW.children[0].id, allocatedWeightKg: 133, allocatedPieces: 540 },
        { parentLotId: splitSewNW.children[1].id, allocatedWeightKg: 88, allocatedPieces: 350 },
      ],
      child: {
        lotCode: 'LOT-FIN-NW-01',
        materialType: 'Washed & Finished Essential Crew Tee',
        styleCode: 'NW-TEE-2026',
        brandId: nordicWear.id,
        quantity: 880,
        unit: 'PIECES',
        weightKg: 218,
        pieceCount: 880,
        fibreComposition: [
          { fibre: 'Organic Cotton', percent: 70 },
          { fibre: 'Recycled Polyester', percent: 30 },
        ],
        claimedOrganicPct: 70,
        claimedRecycledPct: 30,
      },
    },
    adminUser
  );

  // Helper to advance 1->1 stage cleanly as a new child lot (creates true 6-level edge depth!)
  async function advanceStageLot(params: {
    parentId: string;
    parentWeightKg: number;
    parentPieces: number;
    childCode: string;
    materialType: string;
    styleCode: string;
    brandId: string;
    partyId: string;
    processStep: string;
    quantity: number;
    unit: 'KG' | 'PIECES' | 'CARTONS';
    weightKg: number;
    pieceCount: number;
    fibreComposition: Array<{ fibre: string; percent: number }>;
  }) {
    const child = await prisma.lot.create({
      data: {
        lotCode: params.childCode,
        materialType: params.materialType,
        styleCode: params.styleCode,
        brandId: params.brandId,
        partyId: params.partyId,
        status: params.processStep === 'SHIP' ? 'SHIPPED' : params.processStep === 'PACK' ? 'COMPLETED' : 'IN_PROCESS',
        quantity: params.quantity,
        unit: params.unit,
        weightKg: params.weightKg,
        pieceCount: params.pieceCount,
        fibreComposition: params.fibreComposition as object,
        claimedOrganicPct: 70,
        claimedRecycledPct: 30,
        isRootSource: false,
      },
    });

    const ev = await LotEventService.recordEvent(
      {
        lotId: child.id,
        eventType: params.processStep,
        partyId: params.partyId,
        inputQuantity: params.parentPieces,
        outputQuantity: params.quantity,
        unit: params.unit,
        inputWeightKg: params.parentWeightKg,
        outputWeightKg: params.weightKg,
      },
      adminUser
    );

    await prisma.lotEdge.create({
      data: {
        parentLotId: params.parentId,
        childLotId: child.id,
        eventId: ev.id,
        processStep: params.processStep,
        allocatedWeightKg: params.parentWeightKg,
        allocatedPieces: params.parentPieces,
        allocationRatio: 1.0,
      },
    });

    await LotEventService.recalculateCertifiedClaims(child.id);
    return child;
  }

  const blendFibre = [
    { fibre: 'Organic Cotton', percent: 70 },
    { fibre: 'Recycled Polyester', percent: 30 },
  ];

  // LEVEL 5 (PACK) -> LEVEL 6 (SHIP) for NordicWear
  const packNW = await advanceStageLot({
    parentId: finishNW.childLot.id,
    parentWeightKg: 218,
    parentPieces: 880,
    childCode: 'LOT-PACK-NW-01',
    materialType: 'Export Cartons (22 Cartons x 40 pcs)',
    styleCode: 'NW-TEE-2026',
    brandId: nordicWear.id,
    partyId: factory.id,
    processStep: 'PACK',
    quantity: 22,
    unit: 'CARTONS',
    weightKg: 217,
    pieceCount: 880,
    fibreComposition: blendFibre,
  });

  const shipNW = await advanceStageLot({
    parentId: packNW.id,
    parentWeightKg: 217,
    parentPieces: 880,
    childCode: 'LOT-SHIP-NW-01',
    materialType: 'Export Shipment -> Gothenburg Port (NordicWear)',
    styleCode: 'NW-TEE-2026',
    brandId: nordicWear.id,
    partyId: factory.id,
    processStep: 'SHIP',
    quantity: 22,
    unit: 'CARTONS',
    weightKg: 217,
    pieceCount: 880,
    fibreComposition: blendFibre,
  });

  // Also advance EuroStyle (Levels 3 -> 6) so Brand B has its own complete 6-level shipment & passport!
  const sewES = await advanceStageLot({
    parentId: cutES.id,
    parentWeightKg: 133,
    parentPieces: 520,
    childCode: 'LOT-SEW-ES-01',
    materialType: 'Sewn Polo Shirts (EuroStyle)',
    styleCode: 'ES-POLO-2026',
    brandId: euroStyle.id,
    partyId: factory.id,
    processStep: 'SEW',
    quantity: 510,
    unit: 'PIECES',
    weightKg: 130,
    pieceCount: 510,
    fibreComposition: blendFibre,
  });

  const finishES = await advanceStageLot({
    parentId: sewES.id,
    parentWeightKg: 130,
    parentPieces: 510,
    childCode: 'LOT-FIN-ES-01',
    materialType: 'Washed & Finished Pique Polo',
    styleCode: 'ES-POLO-2026',
    brandId: euroStyle.id,
    partyId: washPlant.id,
    processStep: 'FINISH',
    quantity: 505,
    unit: 'PIECES',
    weightKg: 129,
    pieceCount: 505,
    fibreComposition: blendFibre,
  });

  const packES = await advanceStageLot({
    parentId: finishES.id,
    parentWeightKg: 129,
    parentPieces: 505,
    childCode: 'LOT-PACK-ES-01',
    materialType: 'Export Cartons (17 Cartons)',
    styleCode: 'ES-POLO-2026',
    brandId: euroStyle.id,
    partyId: factory.id,
    processStep: 'PACK',
    quantity: 17,
    unit: 'CARTONS',
    weightKg: 128.5,
    pieceCount: 505,
    fibreComposition: blendFibre,
  });

  const shipES = await advanceStageLot({
    parentId: packES.id,
    parentWeightKg: 128.5,
    parentPieces: 505,
    childCode: 'LOT-SHIP-ES-01',
    materialType: 'Export Shipment -> Hamburg Port (EuroStyle)',
    styleCode: 'ES-POLO-2026',
    brandId: euroStyle.id,
    partyId: factory.id,
    processStep: 'SHIP',
    quantity: 17,
    unit: 'CARTONS',
    weightKg: 128.5,
    pieceCount: 505,
    fibreComposition: blendFibre,
  });

  // 6. Publish Versioned Digital Product Passports (FR7 + QA4 Disk Cache!)
  await PassportService.createPassport({
    passportCode: 'DPP-2026-NW-001',
    styleCode: 'NW-TEE-2026',
    shipmentRef: 'SHP-BD-SE-2026-041',
    lotId: shipNW.id,
    brandId: nordicWear.id,
    allocationMethod: 'MASS',
    customFields: {
      euDppRegulationRef: 'EU-ESPR-2027-TXT',
      repairabilityScore: '8.7 / 10',
    },
  });

  // Publish v2 with PIECE_COUNT allocation so version switcher works out of the box!
  await PassportService.publishNewVersion('DPP-2026-NW-001', {
    allocationMethod: 'PIECE_COUNT',
    customFields: {
      euDppRegulationRef: 'EU-ESPR-2027-TXT',
      repairabilityScore: '8.9 / 10',
    },
  });

  await PassportService.createPassport({
    passportCode: 'DPP-2026-ES-001',
    styleCode: 'ES-POLO-2026',
    shipmentRef: 'SHP-BD-DE-2026-019',
    lotId: shipES.id,
    brandId: euroStyle.id,
    allocationMethod: 'MASS',
  });

  // =========================================================================
  // 7. PLANTED DEFECTS DATASET FOR QA2 LIVE DEMONSTRATION
  // =========================================================================
  // Defect #1: Over-claimed recycled content (claims 85% recycled, lineage only supports 30%)
  const uncertCotton = (await LotEventService.createLot(
    {
      lotCode: 'LOT-RAW-CONV-01',
      materialType: 'Conventional Uncertified Cotton Yarn',
      partyId: trimsSupplier.id,
      quantity: 140,
      unit: 'KG',
      weightKg: 140,
      fibreComposition: [{ fibre: 'Conventional Cotton', percent: 100 }],
      claimedOrganicPct: 0,
      claimedRecycledPct: 0,
      isRootSource: true,
    },
    adminUser
  ))!;

  const overClaimMerge = await LotEventService.mergeLots(
    {
      processStep: 'SEW',
      partyId: factory.id,
      parentAllocations: [
        { parentLotId: uncertCotton.id, allocatedWeightKg: 70 },
        { parentLotId: rawRecycled.id, allocatedWeightKg: 30 },
      ],
      child: {
        lotCode: 'LOT-DEFECT-OVERCLAIM',
        materialType: 'Over-Claimed Recycled Hoodie (Planted QA2 Defect)',
        styleCode: 'NW-HOODIE-QA2',
        brandId: nordicWear.id,
        quantity: 200,
        unit: 'PIECES',
        weightKg: 98,
        pieceCount: 200,
        fibreComposition: [
          { fibre: 'Conventional Cotton', percent: 70 },
          { fibre: 'Recycled Polyester', percent: 30 },
        ],
        claimedOrganicPct: 0,
        claimedRecycledPct: 85, // PLANTED OVER-CLAIM! Only 30% is supported!
      },
    },
    adminUser
  );

  // Publish passport for over-claimed lot -> proves passport caps/refuses 85% and only shows 30%!
  await PassportService.createPassport({
    passportCode: 'DPP-2026-QA2-CHECK',
    styleCode: 'NW-HOODIE-QA2',
    shipmentRef: 'SHP-QA2-OVERCLAIM-TEST',
    lotId: overClaimMerge.childLot.id,
    brandId: nordicWear.id,
  });

  // Defect #2: Expired certificate attached to lot
  const expCertLot = (await LotEventService.createLot(
    {
      lotCode: 'LOT-DEFECT-EXPCERT',
      materialType: 'Recycled Denim Lot with Expired GRS Cert (Planted QA2 Defect)',
      styleCode: 'ES-DENIM-QA2',
      brandId: euroStyle.id,
      partyId: recycledMill.id,
      quantity: 150,
      unit: 'KG',
      weightKg: 150,
      claimedOrganicPct: 0,
      claimedRecycledPct: 50,
      isRootSource: true,
    },
    adminUser
  ))!;

  await EvidenceService.createEvidence({
    certificateNumber: 'GRS-EXP-2025-0099',
    certTypeCode: 'GRS',
    issuer: 'Control Union (Expired)',
    scope: 'Expired recycled denim certification',
    lotId: expCertLot.id,
    validFrom: daysFromNow(-410),
    validUntil: daysFromNow(-45), // EXPIRED 45 days ago!
    certifiedPercent: 100,
    file: { buffer: samplePdf('Expired GRS Cert'), originalName: 'GRS-EXP-2025-0099.pdf', mimeType: 'application/pdf' },
  });

  // Defect #3: Cutting loss exceeding 12% limit (18.5% loss recorded as FLAGGED event)
  const excessLossLot = (await LotEventService.createLot(
    {
      lotCode: 'LOT-DEFECT-LOSS',
      materialType: 'Cut Fleece Panels — Excess Cutting Loss (Planted QA2 Defect)',
      styleCode: 'NW-FLEECE-QA2',
      brandId: nordicWear.id,
      partyId: factory.id,
      quantity: 200,
      unit: 'KG',
      weightKg: 200,
      isRootSource: true,
    },
    adminUser
  ))!;

  // Insert valid hash-chained FLAGGED cutting event (18.5% loss > 12% max)
  const lastLossEv = await prisma.lotEvent.findFirst({
    where: { lotId: excessLossLot.id },
    orderBy: { sequenceNum: 'desc' },
  });
  const flaggedAt = new Date();
  const flaggedPrev = lastLossEv?.eventHash ?? 'GENESIS';
  const flaggedSeq = (lastLossEv?.sequenceNum ?? 0) + 1;
  const flaggedHash = computeEventHash(
    {
      lotId: excessLossLot.id,
      sequenceNum: flaggedSeq,
      eventType: 'CUT',
      partyId: factory.id,
      inputQuantity: 200,
      outputQuantity: 163,
      unit: 'KG',
      inputWeightKg: 200,
      outputWeightKg: 163,
      lossPercent: 18.5,
      massBalanceStatus: 'FLAGGED',
      correctionOfEventId: null,
      recordedBy: adminUser.email,
      occurredAtIso: flaggedAt.toISOString(),
    },
    flaggedPrev
  );
  await prisma.lotEvent.create({
    data: {
      lotId: excessLossLot.id,
      eventType: 'CUT',
      partyId: factory.id,
      productionLineId: cutLine.id,
      inputQuantity: 200,
      outputQuantity: 163,
      unit: 'KG',
      inputWeightKg: 200,
      outputWeightKg: 163,
      lossPercent: 18.5,
      massBalanceStatus: 'FLAGGED',
      massBalanceNote: 'Fabric Cutting loss (18.5%) exceeds configured maximum allowed loss (12%).',
      waterLiters: 300,
      energyKwh: 130,
      co2eKg: 84,
      sequenceNum: flaggedSeq,
      prevHash: flaggedPrev,
      eventHash: flaggedHash,
      recordedBy: adminUser.email,
      occurredAt: flaggedAt,
    },
  });
  await prisma.lot.update({
    where: { id: excessLossLot.id },
    data: { status: 'FLAGGED', weightKg: 163, quantity: 163 },
  });

  // Defect #4: Orphan Lot (non-root downstream lot with zero parent edges)
  await LotEventService.createLot(
    {
      lotCode: 'LOT-DEFECT-ORPHAN',
      materialType: 'Unlinked Sewn Garment Lot (Planted QA2 Orphan Lot)',
      styleCode: 'ES-ORPHAN-QA2',
      brandId: euroStyle.id,
      partyId: factory.id,
      quantity: 120,
      unit: 'PIECES',
      weightKg: 32,
      pieceCount: 120,
      isRootSource: false, // PLANTED ORPHAN! No incoming parent edge!
    },
    adminUser
  );

  // Run expiry sweep so 30-day alert is freshly logged
  await EvidenceService.runExpirySweep();

  // 8. Generate sample CSV & Excel files for FR9 Bulk Import live demo
  fs.mkdirSync(env.SAMPLES_ABS_DIR, { recursive: true });
  const sampleCsv = [
    'lotCode,eventType,partyCode,inputQuantity,outputQuantity,unit,inputWeightKg,outputWeightKg',
    'LOT-CUT-NW-01,SEW,FAC-GAZ-01,225,220,KG,225,220',
    'LOT-CUT-ES-01,SEW,FAC-GAZ-01,133,130,KG,133,130',
    'LOT-FAB-BLEND-01,CUT,FAC-GAZ-01,390,300,KG,390,300',
    'LOT-UNKNOWN-999,CUT,FAC-GAZ-01,100,95,KG,100,95',
  ].join('\n');
  fs.writeFileSync(path.join(env.SAMPLES_ABS_DIR, 'cutting_report_sample.csv'), sampleCsv, 'utf-8');

  const xlsxRows = [
    {
      lotCode: 'LOT-PACK-NW-01',
      eventType: 'PACK',
      partyCode: 'FAC-GAZ-01',
      inputQuantity: 217,
      outputQuantity: 216,
      unit: 'KG',
      inputWeightKg: 217,
      outputWeightKg: 216,
    },
    {
      lotCode: 'LOT-PACK-ES-01',
      eventType: 'PACK',
      partyCode: 'INVALID-FAC',
      inputQuantity: 128,
      outputQuantity: 127,
      unit: 'KG',
      inputWeightKg: 128,
      outputWeightKg: 127,
    },
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(xlsxRows);
  XLSX.utils.book_append_sheet(wb, ws, 'PackingList');
  XLSX.writeFile(wb, path.join(env.SAMPLES_ABS_DIR, 'packing_list_sample.xlsx'));

  console.log('✅ Seed completed successfully!');
  console.log('   - Brands: NordicWear AB, EuroStyle GmbH');
  console.log('   - Passports: DPP-2026-NW-001 (v1 & v2), DPP-2026-ES-001, DPP-2026-QA2-CHECK');
  console.log('   - Planted QA2 Defects: LOT-DEFECT-OVERCLAIM, GRS-EXP-2025-0099, LOT-DEFECT-LOSS, LOT-DEFECT-ORPHAN');
  console.log('   - Sample Import Files: data/samples/cutting_report_sample.csv & packing_list_sample.xlsx');
}

seedDemo()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
