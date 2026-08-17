CREATE TYPE "PriceAuditAction" AS ENUM ('CREATE', 'REPLACE', 'CLEAR');

CREATE TABLE "PriceAuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "commercialOfferingId" TEXT NOT NULL,
    "side" "PriceSide" NOT NULL,
    "scopeType" "PriceScopeType" NOT NULL,
    "marketId" TEXT,
    "action" "PriceAuditAction" NOT NULL,
    "oldPriceId" TEXT,
    "newPriceId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceAuditEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PriceAuditEvent_scope_market_check" CHECK (
      ("scopeType" = 'GLOBAL' AND "marketId" IS NULL)
      OR ("scopeType" = 'CITY' AND "marketId" IS NOT NULL)
    ),
    CONSTRAINT "PriceAuditEvent_action_prices_check" CHECK (
      ("action" = 'CREATE' AND "oldPriceId" IS NULL AND "newPriceId" IS NOT NULL)
      OR ("action" = 'REPLACE' AND "oldPriceId" IS NOT NULL AND "newPriceId" IS NOT NULL)
      OR ("action" = 'CLEAR' AND "oldPriceId" IS NOT NULL AND "newPriceId" IS NULL)
    )
);

CREATE INDEX "PriceAuditEvent_commercialOfferingId_createdAt_idx" ON "PriceAuditEvent"("commercialOfferingId", "createdAt");
CREATE INDEX "PriceAuditEvent_actorId_idx" ON "PriceAuditEvent"("actorId");
CREATE INDEX "PriceAuditEvent_marketId_idx" ON "PriceAuditEvent"("marketId");

CREATE UNIQUE INDEX "Price_one_active_global_per_offering_side" ON "Price"("commercialOfferingId", "side")
WHERE "active" = true AND "scopeType" = 'GLOBAL' AND "marketId" IS NULL;

CREATE UNIQUE INDEX "Price_one_active_city_per_offering_side_market" ON "Price"("commercialOfferingId", "side", "marketId")
WHERE "active" = true AND "scopeType" = 'CITY' AND "marketId" IS NOT NULL;

ALTER TABLE "PriceAuditEvent" ADD CONSTRAINT "PriceAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceAuditEvent" ADD CONSTRAINT "PriceAuditEvent_commercialOfferingId_fkey" FOREIGN KEY ("commercialOfferingId") REFERENCES "CommercialOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceAuditEvent" ADD CONSTRAINT "PriceAuditEvent_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "RateMarket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceAuditEvent" ADD CONSTRAINT "PriceAuditEvent_oldPriceId_fkey" FOREIGN KEY ("oldPriceId") REFERENCES "Price"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceAuditEvent" ADD CONSTRAINT "PriceAuditEvent_newPriceId_fkey" FOREIGN KEY ("newPriceId") REFERENCES "Price"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
