ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REVISION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REVISION_ISSUED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REVISION_SUPERSEDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DOCUMENT_RETAINED';

CREATE TYPE "QuoteRevisionStatus" AS ENUM ('DRAFT', 'ISSUED', 'SUPERSEDED');

CREATE TABLE "QuoteNumberCounter" (
  "year" INTEGER NOT NULL,
  "nextValue" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteNumberCounter_pkey" PRIMARY KEY ("year")
);

ALTER TABLE "QuoteRevision"
  ADD COLUMN "status" "QuoteRevisionStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "issuedById" TEXT,
  ADD COLUMN "issuedAt" TIMESTAMP(3),
  ADD COLUMN "quoteTypeSnapshot" "QuoteType",
  ADD COLUMN "companySnapshot" TEXT,
  ADD COLUMN "projectSnapshot" TEXT,
  ADD COLUMN "venueSnapshot" TEXT,
  ADD COLUMN "citySnapshot" TEXT,
  ADD COLUMN "salespersonSnapshot" TEXT,
  ADD COLUMN "currencySnapshot" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "QuoteRevision" r SET
  "status" = CASE WHEN r."lockedAt" IS NULL THEN 'DRAFT'::"QuoteRevisionStatus" ELSE 'ISSUED'::"QuoteRevisionStatus" END,
  "createdById" = q."createdById",
  "issuedAt" = r."lockedAt",
  "quoteTypeSnapshot" = q."type",
  "companySnapshot" = q."company",
  "projectSnapshot" = q."project",
  "venueSnapshot" = q."venue",
  "citySnapshot" = q."city",
  "salespersonSnapshot" = q."salesperson",
  "currencySnapshot" = q."currency"
FROM "Quote" q WHERE r."quoteId" = q."id";

ALTER TABLE "GeneratedDocument"
  ADD COLUMN "documentType" TEXT NOT NULL DEFAULT 'ISSUED_QUOTE_PDF',
  ADD COLUMN "documentVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "content" BYTEA,
  ADD COLUMN "byteSize" INTEGER,
  ADD COLUMN "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
  ADD COLUMN "filename" TEXT,
  ADD COLUMN "generatedById" TEXT;

CREATE INDEX "QuoteRevision_quoteId_status_idx" ON "QuoteRevision"("quoteId", "status");
CREATE UNIQUE INDEX "QuoteRevision_one_draft_per_quote" ON "QuoteRevision"("quoteId") WHERE "status" = 'DRAFT';
CREATE UNIQUE INDEX "GeneratedDocument_revisionId_documentType_documentVersion_key" ON "GeneratedDocument"("revisionId", "documentType", "documentVersion");

ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
