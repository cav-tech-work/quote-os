-- Calculation semantics and entity classification must remain unresolved when
-- the authoritative source does not determine them. This is additive and does
-- not change any existing values.
ALTER TABLE "CanonicalItem" ALTER COLUMN "entityType" DROP NOT NULL;
ALTER TABLE "CommercialOffering" ALTER COLUMN "kind" DROP NOT NULL;
ALTER TABLE "CommercialOffering" ALTER COLUMN "quantityBasis" DROP NOT NULL;
ALTER TABLE "CommercialOffering" ALTER COLUMN "durationBasis" DROP NOT NULL;
