CREATE TYPE "DurationPolicyMode" AS ENUM ('ONE_OFF', 'USAGE_DAYS', 'MANUAL');
CREATE TYPE "DurationRoundingMode" AS ENUM ('NONE', 'CEIL', 'FLOOR', 'HALF_UP');

CREATE TABLE "DurationPolicy" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "mode" "DurationPolicyMode" NOT NULL,
  "chargeMultiplierNumerator" INTEGER NOT NULL, "chargeMultiplierDenominator" INTEGER NOT NULL,
  "minimumChargeNumerator" INTEGER NOT NULL, "minimumChargeDenominator" INTEGER NOT NULL,
  "roundingMode" "DurationRoundingMode" NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  "description" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DurationPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DurationPolicy_math_check" CHECK ("chargeMultiplierNumerator" >= 0 AND "chargeMultiplierDenominator" > 0 AND "minimumChargeNumerator" >= 0 AND "minimumChargeDenominator" > 0)
);
CREATE UNIQUE INDEX "DurationPolicy_code_key" ON "DurationPolicy"("code");

ALTER TABLE "CommercialOffering" ADD COLUMN "durationPolicyId" TEXT;
CREATE INDEX "CommercialOffering_durationPolicyId_idx" ON "CommercialOffering"("durationPolicyId");
ALTER TABLE "CommercialOffering" ADD CONSTRAINT "CommercialOffering_durationPolicyId_fkey" FOREIGN KEY ("durationPolicyId") REFERENCES "DurationPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DurationPolicyAssignmentAudit" (
  "id" TEXT NOT NULL, "actorId" TEXT NOT NULL, "commercialOfferingId" TEXT NOT NULL, "oldPolicyId" TEXT, "newPolicyId" TEXT,
  "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DurationPolicyAssignmentAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DurationPolicyAssignmentAudit_commercialOfferingId_createdAt_idx" ON "DurationPolicyAssignmentAudit"("commercialOfferingId", "createdAt");
CREATE INDEX "DurationPolicyAssignmentAudit_actorId_idx" ON "DurationPolicyAssignmentAudit"("actorId");
ALTER TABLE "DurationPolicyAssignmentAudit" ADD CONSTRAINT "DurationPolicyAssignmentAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DurationPolicyAssignmentAudit" ADD CONSTRAINT "DurationPolicyAssignmentAudit_commercialOfferingId_fkey" FOREIGN KEY ("commercialOfferingId") REFERENCES "CommercialOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DurationPolicyAssignmentAudit" ADD CONSTRAINT "DurationPolicyAssignmentAudit_oldPolicyId_fkey" FOREIGN KEY ("oldPolicyId") REFERENCES "DurationPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DurationPolicyAssignmentAudit" ADD CONSTRAINT "DurationPolicyAssignmentAudit_newPolicyId_fkey" FOREIGN KEY ("newPolicyId") REFERENCES "DurationPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "DurationPolicy" ("id","code","name","mode","chargeMultiplierNumerator","chargeMultiplierDenominator","minimumChargeNumerator","minimumChargeDenominator","roundingMode","description","updatedAt") VALUES
('duration-policy-one-off','ONE_OFF','One off','ONE_OFF',1,1,1,1,'NONE','One commercial charge regardless of usage days',CURRENT_TIMESTAMP),
('duration-policy-full-use-days','FULL_USE_DAYS','Full use days','USAGE_DAYS',1,1,1,1,'NONE','One charge unit per usage day, minimum one',CURRENT_TIMESTAMP),
('duration-policy-half-use-days-min-1','HALF_USE_DAYS_MIN_1','Half use days, minimum one','USAGE_DAYS',1,2,1,1,'NONE','Half a charge unit per usage day, minimum one, fractional units retained',CURRENT_TIMESTAMP),
('duration-policy-manual','MANUAL','Manual charge units','MANUAL',1,1,0,1,'NONE','Caller must supply explicit charge units',CURRENT_TIMESTAMP);
