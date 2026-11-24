-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "brandId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parties" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "exactAddress" TEXT NOT NULL,
    "workerCount" INTEGER NOT NULL,
    "unitPriceUsd" DOUBLE PRECISION NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_lines" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "processType" TEXT NOT NULL,
    "capacityPerDay" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "process_configs" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sequenceOrder" INTEGER NOT NULL,
    "maxLossPercent" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "enforcementMode" TEXT NOT NULL DEFAULT 'BLOCK',
    "waterLitersPerKg" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "energyKwhPerKg" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "co2eKgPerKg" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "process_configs_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "certificate_type_configs" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "claimTag" TEXT,
    "requiresFile" BOOLEAN NOT NULL DEFAULT true,
    "defaultValidityDays" INTEGER NOT NULL DEFAULT 365,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificate_type_configs_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" TEXT NOT NULL,
    "lotCode" TEXT NOT NULL,
    "materialType" TEXT NOT NULL,
    "styleCode" TEXT,
    "brandId" TEXT,
    "partyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "pieceCount" INTEGER,
    "fibreComposition" JSONB NOT NULL DEFAULT '[]',
    "claimedOrganicPct" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "claimedRecycledPct" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "certifiedOrganicPct" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "certifiedRecycledPct" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "isRootSource" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_events" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "productionLineId" TEXT,
    "inputQuantity" DOUBLE PRECISION NOT NULL,
    "outputQuantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "inputWeightKg" DOUBLE PRECISION NOT NULL,
    "outputWeightKg" DOUBLE PRECISION NOT NULL,
    "lossPercent" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "massBalanceStatus" TEXT NOT NULL DEFAULT 'PASS',
    "massBalanceNote" TEXT,
    "waterLiters" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "energyKwh" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "co2eKg" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "correctionOfEventId" TEXT,
    "sequenceNum" INTEGER NOT NULL,
    "prevHash" TEXT NOT NULL,
    "eventHash" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "recordedBy" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_edges" (
    "id" TEXT NOT NULL,
    "parentLotId" TEXT NOT NULL,
    "childLotId" TEXT NOT NULL,
    "eventId" TEXT,
    "processStep" TEXT NOT NULL,
    "allocatedWeightKg" DOUBLE PRECISION NOT NULL,
    "allocatedPieces" INTEGER,
    "allocationRatio" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidences" (
    "id" TEXT NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "certTypeCode" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "partyId" TEXT,
    "lotId" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VALID',
    "claimTag" TEXT,
    "certifiedPercent" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "fileName" TEXT,
    "filePath" TEXT,
    "fileMimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expiry_alerts" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "daysRemaining" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expiry_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passports" (
    "id" TEXT NOT NULL,
    "passportCode" TEXT NOT NULL,
    "styleCode" TEXT NOT NULL,
    "shipmentRef" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "careAndRepair" JSONB NOT NULL DEFAULT '{}',
    "endOfLifeGuidance" JSONB NOT NULL DEFAULT '{}',
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passport_versions" (
    "id" TEXT NOT NULL,
    "passportId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "allocationMethod" TEXT NOT NULL,
    "publicPayload" JSONB NOT NULL,
    "brandPayload" JSONB NOT NULL,
    "auditorPayload" JSONB NOT NULL,
    "evidenceSnapshot" JSONB NOT NULL DEFAULT '[]',
    "etag" TEXT NOT NULL,
    "integrityHash" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passport_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "importType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "acceptedRows" INTEGER NOT NULL,
    "rejectedRows" INTEGER NOT NULL,
    "rejectedDetails" JSONB NOT NULL DEFAULT '[]',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brands_code_key" ON "brands"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_brandId_idx" ON "users"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "parties_code_key" ON "parties"("code");

-- CreateIndex
CREATE INDEX "parties_type_idx" ON "parties"("type");

-- CreateIndex
CREATE UNIQUE INDEX "production_lines_code_key" ON "production_lines"("code");

-- CreateIndex
CREATE INDEX "production_lines_partyId_idx" ON "production_lines"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "lots_lotCode_key" ON "lots"("lotCode");

-- CreateIndex
CREATE INDEX "lots_brandId_idx" ON "lots"("brandId");

-- CreateIndex
CREATE INDEX "lots_styleCode_idx" ON "lots"("styleCode");

-- CreateIndex
CREATE INDEX "lots_partyId_idx" ON "lots"("partyId");

-- CreateIndex
CREATE INDEX "lots_status_idx" ON "lots"("status");

-- CreateIndex
CREATE INDEX "lot_events_lotId_idx" ON "lot_events"("lotId");

-- CreateIndex
CREATE INDEX "lot_events_eventType_idx" ON "lot_events"("eventType");

-- CreateIndex
CREATE INDEX "lot_events_massBalanceStatus_idx" ON "lot_events"("massBalanceStatus");

-- CreateIndex
CREATE INDEX "lot_events_occurredAt_idx" ON "lot_events"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "lot_events_lotId_sequenceNum_key" ON "lot_events"("lotId", "sequenceNum");

-- CreateIndex
CREATE INDEX "lot_edges_parentLotId_childLotId_idx" ON "lot_edges"("parentLotId", "childLotId");

-- CreateIndex
CREATE INDEX "lot_edges_childLotId_parentLotId_idx" ON "lot_edges"("childLotId", "parentLotId");

-- CreateIndex
CREATE UNIQUE INDEX "evidences_certificateNumber_key" ON "evidences"("certificateNumber");

-- CreateIndex
CREATE INDEX "evidences_validUntil_idx" ON "evidences"("validUntil");

-- CreateIndex
CREATE INDEX "evidences_partyId_idx" ON "evidences"("partyId");

-- CreateIndex
CREATE INDEX "evidences_lotId_idx" ON "evidences"("lotId");

-- CreateIndex
CREATE INDEX "evidences_status_idx" ON "evidences"("status");

-- CreateIndex
CREATE INDEX "expiry_alerts_evidenceId_idx" ON "expiry_alerts"("evidenceId");

-- CreateIndex
CREATE INDEX "expiry_alerts_acknowledged_idx" ON "expiry_alerts"("acknowledged");

-- CreateIndex
CREATE UNIQUE INDEX "passports_passportCode_key" ON "passports"("passportCode");

-- CreateIndex
CREATE INDEX "passports_brandId_idx" ON "passports"("brandId");

-- CreateIndex
CREATE INDEX "passports_styleCode_idx" ON "passports"("styleCode");

-- CreateIndex
CREATE INDEX "passports_lotId_idx" ON "passports"("lotId");

-- CreateIndex
CREATE INDEX "passport_versions_passportId_idx" ON "passport_versions"("passportId");

-- CreateIndex
CREATE UNIQUE INDEX "passport_versions_passportId_version_key" ON "passport_versions"("passportId", "version");

-- CreateIndex
CREATE INDEX "import_jobs_createdAt_idx" ON "import_jobs"("createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_lines" ADD CONSTRAINT "production_lines_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_events" ADD CONSTRAINT "lot_events_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_events" ADD CONSTRAINT "lot_events_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_events" ADD CONSTRAINT "lot_events_productionLineId_fkey" FOREIGN KEY ("productionLineId") REFERENCES "production_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_events" ADD CONSTRAINT "lot_events_correctionOfEventId_fkey" FOREIGN KEY ("correctionOfEventId") REFERENCES "lot_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_edges" ADD CONSTRAINT "lot_edges_parentLotId_fkey" FOREIGN KEY ("parentLotId") REFERENCES "lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_edges" ADD CONSTRAINT "lot_edges_childLotId_fkey" FOREIGN KEY ("childLotId") REFERENCES "lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_edges" ADD CONSTRAINT "lot_edges_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "lot_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidences" ADD CONSTRAINT "evidences_certTypeCode_fkey" FOREIGN KEY ("certTypeCode") REFERENCES "certificate_type_configs"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidences" ADD CONSTRAINT "evidences_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidences" ADD CONSTRAINT "evidences_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expiry_alerts" ADD CONSTRAINT "expiry_alerts_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passports" ADD CONSTRAINT "passports_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passports" ADD CONSTRAINT "passports_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passport_versions" ADD CONSTRAINT "passport_versions_passportId_fkey" FOREIGN KEY ("passportId") REFERENCES "passports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
