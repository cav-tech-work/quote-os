ALTER TABLE "QuoteRevision" ADD COLUMN "eventDays" INTEGER;

ALTER TABLE "QuoteLine"
  ADD COLUMN "commercialOfferingId" TEXT,
  ADD COLUMN "canonicalCodeSnapshot" TEXT,
  ADD COLUMN "canonicalNameSnapshot" TEXT,
  ADD COLUMN "configurationSnapshot" JSONB,
  ADD COLUMN "normalizedConfigurationSnapshot" JSONB,
  ADD COLUMN "quantityBasisSnapshot" "QuantityBasis",
  ADD COLUMN "billableQuantitySnapshot" TEXT,
  ADD COLUMN "billableQuantityNumeratorSnapshot" TEXT,
  ADD COLUMN "billableQuantityDenominatorSnapshot" TEXT,
  ADD COLUMN "rateSideSnapshot" "PriceSide",
  ADD COLUMN "priceIdSnapshot" TEXT,
  ADD COLUMN "rateScopeSnapshot" "PriceScopeType",
  ADD COLUMN "marketIdSnapshot" TEXT,
  ADD COLUMN "currencySnapshot" TEXT,
  ADD COLUMN "usageDaysSnapshot" TEXT,
  ADD COLUMN "durationPolicyIdSnapshot" TEXT,
  ADD COLUMN "durationPolicyCodeSnapshot" TEXT,
  ADD COLUMN "durationPolicyModeSnapshot" "DurationPolicyMode",
  ADD COLUMN "durationPolicyDefinitionSnapshot" JSONB,
  ADD COLUMN "chargeUnitsSnapshot" TEXT,
  ADD COLUMN "durationResolutionProvenanceSnapshot" TEXT,
  ADD COLUMN "overrideChargeUnitsSnapshot" TEXT,
  ADD COLUMN "overrideReasonSnapshot" TEXT,
  ADD COLUMN "baseAmountPaiseSnapshot" INTEGER,
  ADD COLUMN "amountMeaningSnapshot" TEXT,
  ADD COLUMN "finalAmountPaiseSnapshot" INTEGER,
  ADD COLUMN "pricingEngineVersion" TEXT,
  ADD COLUMN "snapshotSchemaVersion" TEXT;

ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_eventDays_check" CHECK ("eventDays" IS NULL OR "eventDays" > 0);
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_normalized_snapshot_check" CHECK (
  "commercialOfferingId" IS NULL OR (
    "catalogueItemId" IS NULL AND
    "configurationSnapshot" IS NOT NULL AND
    "quantityBasisSnapshot" IS NOT NULL AND
    "billableQuantitySnapshot" IS NOT NULL AND
    "billableQuantityNumeratorSnapshot" IS NOT NULL AND
    "billableQuantityDenominatorSnapshot" IS NOT NULL AND
    "rateSideSnapshot" IS NOT NULL AND
    "priceIdSnapshot" IS NOT NULL AND
    "rateScopeSnapshot" = 'GLOBAL' AND
    "marketIdSnapshot" IS NULL AND
    "currencySnapshot" IS NOT NULL AND
    "durationPolicyIdSnapshot" IS NOT NULL AND
    "durationPolicyCodeSnapshot" IS NOT NULL AND
    "durationPolicyModeSnapshot" IS NOT NULL AND
    "chargeUnitsSnapshot" IS NOT NULL AND
    "durationResolutionProvenanceSnapshot" IS NOT NULL AND
    "baseAmountPaiseSnapshot" IS NOT NULL AND
    "finalAmountPaiseSnapshot" IS NOT NULL AND
    "pricingEngineVersion" IS NOT NULL AND
    "snapshotSchemaVersion" IS NOT NULL
  )
);
CREATE INDEX "QuoteLine_commercialOfferingId_idx" ON "QuoteLine"("commercialOfferingId");
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_commercialOfferingId_fkey" FOREIGN KEY ("commercialOfferingId") REFERENCES "CommercialOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;
