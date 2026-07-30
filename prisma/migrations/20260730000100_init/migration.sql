CREATE SCHEMA IF NOT EXISTS "public";
CREATE TYPE "Role" AS ENUM ('ADMIN', 'QUOTE_USER');
CREATE TYPE "QuoteType" AS ENUM ('CLIENT', 'VENDOR');
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'GENERATED', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');
CREATE TYPE "AuditAction" AS ENUM ('CREATED', 'UPDATED', 'ARCHIVED', 'RESTORED', 'GENERATED', 'SENT', 'STATUS_CHANGED', 'IMPORTED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "email" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'QUOTE_USER', "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CatalogueCategory" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "parentId" TEXT,
  CONSTRAINT "CatalogueCategory_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CatalogueItem" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "categoryId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "description" TEXT, "manufacturer" TEXT, "model" TEXT, "vendorRatePaise" INTEGER NOT NULL,
  "clientRatePaise" INTEGER NOT NULL, "unit" TEXT NOT NULL DEFAULT 'Per Day',
  "discountEligible" BOOLEAN NOT NULL DEFAULT true, "taxCategory" TEXT, "active" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "CatalogueItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Quote" (
  "id" TEXT NOT NULL, "number" TEXT NOT NULL, "type" "QuoteType" NOT NULL,
  "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT', "company" TEXT NOT NULL, "project" TEXT,
  "venue" TEXT, "city" TEXT, "salesperson" TEXT, "currency" TEXT NOT NULL DEFAULT 'INR',
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "QuoteRevision" (
  "id" TEXT NOT NULL, "quoteId" TEXT NOT NULL, "revisionNumber" INTEGER NOT NULL,
  "preparedDate" TIMESTAMP(3) NOT NULL, "validUntil" TIMESTAMP(3), "taxPercentage" DECIMAL(5,2) NOT NULL,
  "notes" TEXT, "termsSnapshot" TEXT, "settingsSnapshot" JSONB NOT NULL, "subtotalPaise" INTEGER NOT NULL,
  "discountTotalPaise" INTEGER NOT NULL, "taxTotalPaise" INTEGER NOT NULL, "grandTotalPaise" INTEGER NOT NULL,
  "lockedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteRevision_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "QuoteLine" (
  "id" TEXT NOT NULL, "revisionId" TEXT NOT NULL, "catalogueItemId" TEXT, "itemCodeSnapshot" TEXT NOT NULL,
  "itemNameSnapshot" TEXT NOT NULL, "descriptionSnapshot" TEXT, "unitSnapshot" TEXT NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL, "days" DECIMAL(12,2) NOT NULL, "rateUsedPaise" INTEGER NOT NULL,
  "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0, "discountPaise" INTEGER NOT NULL,
  "lineTotalPaise" INTEGER NOT NULL, "remarks" TEXT, CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "QuoteEvent" (
  "id" TEXT NOT NULL, "quoteId" TEXT NOT NULL, "actorId" TEXT, "action" "AuditAction" NOT NULL,
  "fromValue" TEXT, "toValue" TEXT, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "GeneratedDocument" (
  "id" TEXT NOT NULL, "revisionId" TEXT NOT NULL, "templateVersion" TEXT NOT NULL, "storageKey" TEXT NOT NULL,
  "checksum" TEXT NOT NULL, "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "emailedAt" TIMESTAMP(3), CONSTRAINT "GeneratedDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "CatalogueCategory_name_parentId_key" ON "CatalogueCategory"("name", "parentId");
CREATE UNIQUE INDEX "CatalogueItem_code_key" ON "CatalogueItem"("code");
CREATE UNIQUE INDEX "Quote_number_key" ON "Quote"("number");
CREATE UNIQUE INDEX "QuoteRevision_quoteId_revisionNumber_key" ON "QuoteRevision"("quoteId", "revisionNumber");
CREATE UNIQUE INDEX "GeneratedDocument_storageKey_key" ON "GeneratedDocument"("storageKey");

ALTER TABLE "CatalogueCategory" ADD CONSTRAINT "CatalogueCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CatalogueCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CatalogueItem" ADD CONSTRAINT "CatalogueItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CatalogueCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "QuoteRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_catalogueItemId_fkey" FOREIGN KEY ("catalogueItemId") REFERENCES "CatalogueItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuoteEvent" ADD CONSTRAINT "QuoteEvent_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteEvent" ADD CONSTRAINT "QuoteEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "QuoteRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
