CREATE TYPE "PackagePricingMode" AS ENUM ('COMPONENT_SUM', 'FIXED_PACKAGE', 'HYBRID');
CREATE TYPE "PackageQuantityRuleType" AS ENUM ('FIXED', 'FIXED_PER_PACKAGE', 'PARENT_QUANTITY_MULTIPLIER');
CREATE TYPE "PackageComponentBillingMode" AS ENUM ('BILLABLE', 'INCLUDED');

CREATE TABLE "PackageTemplate" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT false, "version" INTEGER NOT NULL,
  "authority" "PricingPolicyAuthority" NOT NULL DEFAULT 'INTERNAL_APPROVED',
  "pricingMode" "PackagePricingMode" NOT NULL, "parentCommercialOfferingId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PackageTemplate_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PackageComponent" (
  "id" TEXT NOT NULL, "packageTemplateId" TEXT NOT NULL, "commercialOfferingId" TEXT NOT NULL,
  "quantityRuleType" "PackageQuantityRuleType" NOT NULL, "quantityValue" DECIMAL(12,4) NOT NULL,
  "billingMode" "PackageComponentBillingMode" NOT NULL, "dutyUnitsPerPerson" DECIMAL(12,4),
  "sortOrder" INTEGER NOT NULL, "required" BOOLEAN NOT NULL DEFAULT true, "notes" TEXT,
  CONSTRAINT "PackageComponent_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "QuoteLine" ADD COLUMN "packageTemplateId" TEXT,
ADD COLUMN "packageCodeSnapshot" TEXT, ADD COLUMN "packageNameSnapshot" TEXT,
ADD COLUMN "packageVersionSnapshot" INTEGER, ADD COLUMN "packagePricingModeSnapshot" "PackagePricingMode",
ADD COLUMN "packageQuantitySnapshot" TEXT, ADD COLUMN "packageComponentSubtotalPaiseSnapshot" INTEGER,
ADD COLUMN "packageLevelAmountPaiseSnapshot" INTEGER;
CREATE TABLE "QuotePackageComponentSnapshot" (
  "id" TEXT NOT NULL, "quoteLineId" TEXT NOT NULL, "sortOrder" INTEGER NOT NULL,
  "commercialOfferingIdSnapshot" TEXT NOT NULL, "offeringCodeSnapshot" TEXT NOT NULL,
  "offeringNameSnapshot" TEXT NOT NULL, "billingModeSnapshot" "PackageComponentBillingMode" NOT NULL,
  "quantityRuleTypeSnapshot" "PackageQuantityRuleType" NOT NULL, "quantityValueSnapshot" TEXT NOT NULL,
  "resolvedQuantitySnapshot" TEXT NOT NULL, "configurationSnapshot" JSONB NOT NULL,
  "pricingFamilySnapshot" "PricingFamily", "priceIdSnapshot" TEXT, "rateSideSnapshot" "PriceSide",
  "unitRatePaiseSnapshot" INTEGER, "durationPolicyIdSnapshot" TEXT, "durationPolicyCodeSnapshot" TEXT,
  "durationPolicyDefinitionSnapshot" JSONB, "headcountSnapshot" INTEGER,
  "dutyUnitsPerPersonSnapshot" TEXT, "billableQuantitySnapshot" TEXT, "chargeUnitsSnapshot" TEXT,
  "finalAmountPaiseSnapshot" INTEGER NOT NULL, "includedSnapshot" BOOLEAN NOT NULL,
  CONSTRAINT "QuotePackageComponentSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PackageTemplate_code_version_key" ON "PackageTemplate"("code", "version");
CREATE INDEX "PackageTemplate_active_authority_idx" ON "PackageTemplate"("active", "authority");
CREATE UNIQUE INDEX "PackageComponent_packageTemplateId_sortOrder_key" ON "PackageComponent"("packageTemplateId", "sortOrder");
CREATE INDEX "PackageComponent_commercialOfferingId_idx" ON "PackageComponent"("commercialOfferingId");
CREATE UNIQUE INDEX "QuotePackageComponentSnapshot_quoteLineId_sortOrder_key" ON "QuotePackageComponentSnapshot"("quoteLineId", "sortOrder");
ALTER TABLE "PackageTemplate" ADD CONSTRAINT "PackageTemplate_parentCommercialOfferingId_fkey" FOREIGN KEY ("parentCommercialOfferingId") REFERENCES "CommercialOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PackageComponent" ADD CONSTRAINT "PackageComponent_packageTemplateId_fkey" FOREIGN KEY ("packageTemplateId") REFERENCES "PackageTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PackageComponent" ADD CONSTRAINT "PackageComponent_commercialOfferingId_fkey" FOREIGN KEY ("commercialOfferingId") REFERENCES "CommercialOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_packageTemplateId_fkey" FOREIGN KEY ("packageTemplateId") REFERENCES "PackageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuotePackageComponentSnapshot" ADD CONSTRAINT "QuotePackageComponentSnapshot_quoteLineId_fkey" FOREIGN KEY ("quoteLineId") REFERENCES "QuoteLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
