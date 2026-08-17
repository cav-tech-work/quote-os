CREATE TYPE "PricingFamily" AS ENUM ('ORDINARY', 'HEADCOUNT_DUTY');

ALTER TABLE "CommercialOffering" ADD COLUMN "pricingFamily" "PricingFamily";
ALTER TABLE "QuoteLine"
  ADD COLUMN "pricingFamilySnapshot" "PricingFamily",
  ADD COLUMN "headcountSnapshot" INTEGER,
  ADD COLUMN "dutyUnitsPerPersonSnapshot" TEXT;

UPDATE "QuoteLine" SET "pricingFamilySnapshot" = 'ORDINARY'
WHERE "commercialOfferingId" IS NOT NULL AND "snapshotSchemaVersion" = 'normalized-line-v1';

ALTER TABLE "QuoteLine" DROP CONSTRAINT "QuoteLine_normalized_snapshot_check";
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_normalized_snapshot_check" CHECK (
  "commercialOfferingId" IS NULL OR (
    "catalogueItemId" IS NULL AND
    "pricingFamilySnapshot" IS NOT NULL AND
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
    "baseAmountPaiseSnapshot" IS NOT NULL AND
    "finalAmountPaiseSnapshot" IS NOT NULL AND
    "pricingEngineVersion" IS NOT NULL AND
    "snapshotSchemaVersion" IS NOT NULL AND
    (
      ("pricingFamilySnapshot" = 'ORDINARY' AND "durationPolicyIdSnapshot" IS NOT NULL AND "durationPolicyCodeSnapshot" IS NOT NULL AND "durationPolicyModeSnapshot" IS NOT NULL AND "chargeUnitsSnapshot" IS NOT NULL AND "durationResolutionProvenanceSnapshot" IS NOT NULL) OR
      ("pricingFamilySnapshot" = 'HEADCOUNT_DUTY' AND "quantityBasisSnapshot" = 'HEADCOUNT_DUTY' AND "unitSnapshot" = 'DUTY' AND "headcountSnapshot" > 0 AND "dutyUnitsPerPersonSnapshot" IS NOT NULL AND "durationPolicyIdSnapshot" IS NULL AND "durationPolicyCodeSnapshot" IS NULL AND "durationPolicyModeSnapshot" IS NULL AND "chargeUnitsSnapshot" IS NULL)
    )
  )
);
