ALTER TYPE "DurationPolicyMode" ADD VALUE 'CURVE';
CREATE TYPE "PricingPolicyAuthority" AS ENUM ('INTERNAL_APPROVED', 'HISTORICAL_INTERNAL', 'EXTERNAL_REFERENCE');
ALTER TABLE "DurationPolicy" ADD COLUMN "authority" "PricingPolicyAuthority" NOT NULL DEFAULT 'INTERNAL_APPROVED';

CREATE TABLE "DurationPolicyPoint" (
  "id" TEXT NOT NULL, "durationPolicyId" TEXT NOT NULL, "usageDays" INTEGER NOT NULL,
  "chargeUnitsNumerator" INTEGER NOT NULL, "chargeUnitsDenominator" INTEGER NOT NULL, "sortOrder" INTEGER NOT NULL,
  CONSTRAINT "DurationPolicyPoint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DurationPolicyPoint_values_check" CHECK ("usageDays" > 0 AND "chargeUnitsNumerator" >= 0 AND "chargeUnitsDenominator" > 0)
);
CREATE UNIQUE INDEX "DurationPolicyPoint_durationPolicyId_usageDays_key" ON "DurationPolicyPoint"("durationPolicyId","usageDays");
CREATE INDEX "DurationPolicyPoint_durationPolicyId_sortOrder_idx" ON "DurationPolicyPoint"("durationPolicyId","sortOrder");
ALTER TABLE "DurationPolicyPoint" ADD CONSTRAINT "DurationPolicyPoint_durationPolicyId_fkey" FOREIGN KEY ("durationPolicyId") REFERENCES "DurationPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CatalogueSemanticAudit" (
  "id" TEXT NOT NULL, "commercialOfferingId" TEXT NOT NULL, "field" TEXT NOT NULL, "oldValue" TEXT, "newValue" TEXT,
  "reason" TEXT NOT NULL, "decisionSetHash" TEXT NOT NULL, "applyIdentity" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CatalogueSemanticAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CatalogueSemanticAudit_commercialOfferingId_createdAt_idx" ON "CatalogueSemanticAudit"("commercialOfferingId","createdAt");
CREATE INDEX "CatalogueSemanticAudit_decisionSetHash_idx" ON "CatalogueSemanticAudit"("decisionSetHash");
ALTER TABLE "CatalogueSemanticAudit" ADD CONSTRAINT "CatalogueSemanticAudit_commercialOfferingId_fkey" FOREIGN KEY ("commercialOfferingId") REFERENCES "CommercialOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CatalogueSemanticApply" (
  "id" TEXT NOT NULL, "decisionSetHash" TEXT NOT NULL, "catalogueFingerprint" TEXT NOT NULL, "applyIdentity" TEXT NOT NULL, "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CatalogueSemanticApply_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CatalogueSemanticApply_decisionSetHash_key" ON "CatalogueSemanticApply"("decisionSetHash");
