CREATE TYPE "BusinessReviewStatus" AS ENUM ('UNREVIEWED','APPROVED','CHANGE_REQUIRED','DEFERRED','REJECTED');
CREATE TYPE "BusinessReviewField" AS ENUM ('IDENTITY','CATEGORY','BILLING_UNIT','QUANTITY_SEMANTICS','DURATION_POLICY','TO_CLIENT_RATE','TO_VENDOR_RATE','ACTIVE_INCLUSION','PACKAGE_TREATMENT');
CREATE TYPE "CatalogueReleaseStatus" AS ENUM ('DRAFT','READY_FOR_APPROVAL','APPROVED','SUPERSEDED');
CREATE TABLE "OfferingBusinessReview" (
  "id" TEXT NOT NULL, "commercialOfferingId" TEXT NOT NULL, "status" "BusinessReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
  "reviewNote" TEXT, "requiredChanges" TEXT, "reviewedById" TEXT, "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OfferingBusinessReview_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OfferingBusinessFieldReview" (
  "id" TEXT NOT NULL, "businessReviewId" TEXT NOT NULL, "field" "BusinessReviewField" NOT NULL,
  "status" "BusinessReviewStatus" NOT NULL DEFAULT 'UNREVIEWED', "proposedValue" TEXT, "reason" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "OfferingBusinessFieldReview_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BusinessReviewAudit" (
  "id" TEXT NOT NULL, "businessReviewId" TEXT NOT NULL, "actorId" TEXT NOT NULL, "field" "BusinessReviewField",
  "oldStatus" "BusinessReviewStatus" NOT NULL, "newStatus" "BusinessReviewStatus" NOT NULL,
  "oldValue" TEXT, "newValue" TEXT, "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessReviewAudit_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CatalogueRelease" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "status" "CatalogueReleaseStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT NOT NULL, "approvedById" TEXT, "approvedAt" TIMESTAMP(3),
  "catalogueFingerprint" TEXT NOT NULL, "releaseFingerprint" TEXT NOT NULL, "decisionSetHash" TEXT NOT NULL, "sourceWorkbookHash" TEXT,
  "technicalDecisionHashes" JSONB NOT NULL, "contents" JSONB NOT NULL, "summary" JSONB NOT NULL,
  "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CatalogueRelease_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CatalogueReleaseAudit" (
  "id" TEXT NOT NULL, "releaseId" TEXT NOT NULL, "actorId" TEXT NOT NULL,
  "oldStatus" "CatalogueReleaseStatus" NOT NULL, "newStatus" "CatalogueReleaseStatus" NOT NULL,
  "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CatalogueReleaseAudit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OfferingBusinessReview_commercialOfferingId_key" ON "OfferingBusinessReview"("commercialOfferingId");
CREATE INDEX "OfferingBusinessReview_status_idx" ON "OfferingBusinessReview"("status");
CREATE UNIQUE INDEX "OfferingBusinessFieldReview_businessReviewId_field_key" ON "OfferingBusinessFieldReview"("businessReviewId","field");
CREATE INDEX "BusinessReviewAudit_businessReviewId_createdAt_idx" ON "BusinessReviewAudit"("businessReviewId","createdAt");
CREATE UNIQUE INDEX "CatalogueRelease_code_key" ON "CatalogueRelease"("code");
CREATE INDEX "CatalogueRelease_status_createdAt_idx" ON "CatalogueRelease"("status","createdAt");
CREATE INDEX "CatalogueReleaseAudit_releaseId_createdAt_idx" ON "CatalogueReleaseAudit"("releaseId","createdAt");
ALTER TABLE "OfferingBusinessReview" ADD CONSTRAINT "OfferingBusinessReview_commercialOfferingId_fkey" FOREIGN KEY ("commercialOfferingId") REFERENCES "CommercialOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfferingBusinessReview" ADD CONSTRAINT "OfferingBusinessReview_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfferingBusinessFieldReview" ADD CONSTRAINT "OfferingBusinessFieldReview_businessReviewId_fkey" FOREIGN KEY ("businessReviewId") REFERENCES "OfferingBusinessReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessReviewAudit" ADD CONSTRAINT "BusinessReviewAudit_businessReviewId_fkey" FOREIGN KEY ("businessReviewId") REFERENCES "OfferingBusinessReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BusinessReviewAudit" ADD CONSTRAINT "BusinessReviewAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CatalogueRelease" ADD CONSTRAINT "CatalogueRelease_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CatalogueRelease" ADD CONSTRAINT "CatalogueRelease_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CatalogueReleaseAudit" ADD CONSTRAINT "CatalogueReleaseAudit_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "CatalogueRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CatalogueReleaseAudit" ADD CONSTRAINT "CatalogueReleaseAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE OR REPLACE FUNCTION prevent_approved_catalogue_release_mutation() RETURNS trigger AS $$ BEGIN IF OLD."status" = 'APPROVED' THEN RAISE EXCEPTION 'Approved catalogue releases are immutable'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "CatalogueRelease_approved_immutable" BEFORE UPDATE OR DELETE ON "CatalogueRelease" FOR EACH ROW EXECUTE FUNCTION prevent_approved_catalogue_release_mutation();
