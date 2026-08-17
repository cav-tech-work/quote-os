-- CreateEnum
CREATE TYPE "CatalogueDomain" AS ENUM ('VC', 'OPS', 'POWER', 'TECH', 'OTHER');

-- CreateEnum
CREATE TYPE "CanonicalEntityType" AS ENUM ('PHYSICAL_ITEM', 'EQUIPMENT', 'PERSONNEL', 'SERVICE', 'CONSUMABLE', 'STRUCTURE');

-- CreateEnum
CREATE TYPE "OfferingKind" AS ENUM ('ITEM', 'PACKAGE', 'SERVICE');

-- CreateEnum
CREATE TYPE "UnitCode" AS ENUM ('M', 'FT', 'SQ_M', 'SQ_FT', 'RFT', 'CBM', 'NOS', 'DAY', 'DUTY', 'LITRE', 'SET', 'LUMPSUM');

-- CreateEnum
CREATE TYPE "QuantityBasis" AS ENUM ('COUNT', 'AREA_LW', 'AREA_LH', 'LINEAR', 'VOLUME', 'HEADCOUNT_DUTY', 'FIXED', 'MANUAL', 'GENERATOR');

-- CreateEnum
CREATE TYPE "DurationBasis" AS ENUM ('ONE_OFF', 'VC_CHARGE_DAYS', 'OPS_CHARGE_DAYS', 'POWER_CHARGE_DAYS', 'DUTY', 'MANUAL');

-- CreateEnum
CREATE TYPE "PriceSide" AS ENUM ('TO_CLIENT', 'TO_VENDOR');

-- CreateEnum
CREATE TYPE "PriceScopeType" AS ENUM ('GLOBAL', 'CITY');

-- CreateEnum
CREATE TYPE "ImportSourceType" AS ENUM ('ACTIVE_COMMERCIAL_MASTER', 'NORMALIZATION_VOCABULARY', 'OPERATIONAL_BUSINESS_LOGIC', 'HISTORICAL_OBSERVATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PREVIEWED', 'VALIDATED', 'APPLIED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('PENDING', 'VALID', 'WARNING', 'ERROR', 'APPLIED', 'SKIPPED');

-- CreateTable
CREATE TABLE "CanonicalItem" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" "CatalogueDomain" NOT NULL,
    "entityType" "CanonicalEntityType" NOT NULL,
    "defaultUnit" "UnitCode",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialOffering" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "OfferingKind" NOT NULL,
    "canonicalItemId" TEXT,
    "quantityBasis" "QuantityBasis" NOT NULL,
    "durationBasis" "DurationBasis" NOT NULL,
    "billingUnit" "UnitCode" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alias" (
    "id" TEXT NOT NULL,
    "canonicalItemId" TEXT,
    "commercialOfferingId" TEXT,
    "normalizedText" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "source" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceMapping" (
    "id" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "sourceCode" TEXT,
    "sourceDescription" TEXT NOT NULL,
    "canonicalItemId" TEXT,
    "commercialOfferingId" TEXT,
    "confidence" DECIMAL(5,4),
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateMarket" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "cityName" TEXT NOT NULL,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RateMarket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Price" (
    "id" TEXT NOT NULL,
    "commercialOfferingId" TEXT NOT NULL,
    "side" "PriceSide" NOT NULL,
    "scopeType" "PriceScopeType" NOT NULL,
    "marketId" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "sourceImportId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateObservation" (
    "id" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "sourceSheet" TEXT NOT NULL,
    "sourceRow" INTEGER,
    "rawCode" TEXT,
    "rawDescription" TEXT NOT NULL,
    "canonicalItemId" TEXT,
    "commercialOfferingId" TEXT,
    "marketId" TEXT,
    "cityText" TEXT,
    "observedRatePaise" INTEGER,
    "observedUnit" "UnitCode",
    "observedQuantity" DECIMAL(12,4),
    "length" DECIMAL(12,4),
    "width" DECIMAL(12,4),
    "height" DECIMAL(12,4),
    "observedDays" DECIMAL(12,4),
    "notes" TEXT,
    "metadata" JSONB,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "sourceType" "ImportSourceType" NOT NULL,
    "filename" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "sheet" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawData" JSONB NOT NULL,
    "rowHash" TEXT NOT NULL,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalItem_code_key" ON "CanonicalItem"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOffering_code_key" ON "CommercialOffering"("code");

-- CreateIndex
CREATE INDEX "CommercialOffering_canonicalItemId_idx" ON "CommercialOffering"("canonicalItemId");

-- CreateIndex
CREATE INDEX "Alias_normalizedText_idx" ON "Alias"("normalizedText");

-- CreateIndex
CREATE INDEX "Alias_canonicalItemId_idx" ON "Alias"("canonicalItemId");

-- CreateIndex
CREATE INDEX "Alias_commercialOfferingId_idx" ON "Alias"("commercialOfferingId");

-- CreateIndex
CREATE INDEX "SourceMapping_sourceSystem_sourceCode_idx" ON "SourceMapping"("sourceSystem", "sourceCode");

-- CreateIndex
CREATE INDEX "SourceMapping_canonicalItemId_idx" ON "SourceMapping"("canonicalItemId");

-- CreateIndex
CREATE INDEX "SourceMapping_commercialOfferingId_idx" ON "SourceMapping"("commercialOfferingId");

-- CreateIndex
CREATE INDEX "SourceMapping_importBatchId_idx" ON "SourceMapping"("importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "RateMarket_code_key" ON "RateMarket"("code");

-- CreateIndex
CREATE INDEX "Price_commercialOfferingId_side_scopeType_idx" ON "Price"("commercialOfferingId", "side", "scopeType");

-- CreateIndex
CREATE INDEX "Price_marketId_idx" ON "Price"("marketId");

-- CreateIndex
CREATE INDEX "Price_sourceImportId_idx" ON "Price"("sourceImportId");

-- CreateIndex
CREATE INDEX "RateObservation_canonicalItemId_idx" ON "RateObservation"("canonicalItemId");

-- CreateIndex
CREATE INDEX "RateObservation_commercialOfferingId_idx" ON "RateObservation"("commercialOfferingId");

-- CreateIndex
CREATE INDEX "RateObservation_marketId_idx" ON "RateObservation"("marketId");

-- CreateIndex
CREATE INDEX "RateObservation_importBatchId_idx" ON "RateObservation"("importBatchId");

-- CreateIndex
CREATE INDEX "ImportBatch_createdById_idx" ON "ImportBatch"("createdById");

-- CreateIndex
CREATE INDEX "ImportBatch_status_createdAt_idx" ON "ImportBatch"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_sourceType_fileHash_key" ON "ImportBatch"("sourceType", "fileHash");

-- CreateIndex
CREATE INDEX "ImportRow_importBatchId_rowHash_idx" ON "ImportRow"("importBatchId", "rowHash");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRow_importBatchId_sheet_rowNumber_key" ON "ImportRow"("importBatchId", "sheet", "rowNumber");

-- AddForeignKey
ALTER TABLE "CommercialOffering" ADD CONSTRAINT "CommercialOffering_canonicalItemId_fkey" FOREIGN KEY ("canonicalItemId") REFERENCES "CanonicalItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alias" ADD CONSTRAINT "Alias_canonicalItemId_fkey" FOREIGN KEY ("canonicalItemId") REFERENCES "CanonicalItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alias" ADD CONSTRAINT "Alias_commercialOfferingId_fkey" FOREIGN KEY ("commercialOfferingId") REFERENCES "CommercialOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceMapping" ADD CONSTRAINT "SourceMapping_canonicalItemId_fkey" FOREIGN KEY ("canonicalItemId") REFERENCES "CanonicalItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceMapping" ADD CONSTRAINT "SourceMapping_commercialOfferingId_fkey" FOREIGN KEY ("commercialOfferingId") REFERENCES "CommercialOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceMapping" ADD CONSTRAINT "SourceMapping_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Price" ADD CONSTRAINT "Price_commercialOfferingId_fkey" FOREIGN KEY ("commercialOfferingId") REFERENCES "CommercialOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Price" ADD CONSTRAINT "Price_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "RateMarket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Price" ADD CONSTRAINT "Price_sourceImportId_fkey" FOREIGN KEY ("sourceImportId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateObservation" ADD CONSTRAINT "RateObservation_canonicalItemId_fkey" FOREIGN KEY ("canonicalItemId") REFERENCES "CanonicalItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateObservation" ADD CONSTRAINT "RateObservation_commercialOfferingId_fkey" FOREIGN KEY ("commercialOfferingId") REFERENCES "CommercialOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateObservation" ADD CONSTRAINT "RateObservation_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "RateMarket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateObservation" ADD CONSTRAINT "RateObservation_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Known domain invariants that Prisma cannot express in schema.prisma.
ALTER TABLE "Alias" ADD CONSTRAINT "Alias_exactly_one_target_check"
CHECK (num_nonnulls("canonicalItemId", "commercialOfferingId") = 1);

ALTER TABLE "SourceMapping" ADD CONSTRAINT "SourceMapping_confidence_range_check"
CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));

ALTER TABLE "Price" ADD CONSTRAINT "Price_non_negative_amount_check"
CHECK ("amountPaise" >= 0);

ALTER TABLE "Price" ADD CONSTRAINT "Price_scope_market_check"
CHECK (
  ("scopeType" = 'GLOBAL' AND "marketId" IS NULL)
  OR ("scopeType" = 'CITY' AND "marketId" IS NOT NULL)
);

ALTER TABLE "Price" ADD CONSTRAINT "Price_effective_range_check"
CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveTo" >= "effectiveFrom");
