import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schema = readFileSync(resolve(repositoryRoot, "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  resolve(repositoryRoot, "prisma/migrations/20260812165202_normalized_catalogue_foundation/migration.sql"),
  "utf8",
);

test("normalized catalogue stays additive and prices belong to offerings", () => {
  for (const model of [
    "CatalogueItem",
    "CanonicalItem",
    "CommercialOffering",
    "Alias",
    "SourceMapping",
    "Price",
    "RateMarket",
    "RateObservation",
    "ImportBatch",
    "ImportRow",
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  const priceModel = schema.match(/model Price \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(priceModel, /commercialOfferingId\s+String/);
  assert.doesNotMatch(priceModel, /canonicalItemId/);
  assert.match(migration, /Alias_exactly_one_target_check/);
  assert.match(migration, /Price_scope_market_check/);
  assert.match(migration, /Price_non_negative_amount_check/);
});

const databaseUrl = process.env.TEST_DATABASE_URL;

test("normalized catalogue database semantics", { skip: !databaseUrl }, async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    const canonical = await prisma.canonicalItem.create({
      data: {
        code: `TEST-CANONICAL-${suffix}`,
        name: "Test canonical item",
        domain: "VC",
        entityType: "STRUCTURE",
        defaultUnit: "SQ_FT",
      },
    });

    await assert.rejects(
      prisma.canonicalItem.create({
        data: {
          code: canonical.code,
          name: "Duplicate",
          domain: "VC",
          entityType: "STRUCTURE",
        },
      }),
    );

    const offering = await prisma.commercialOffering.create({
      data: {
        code: `TEST-OFFERING-${suffix}`,
        name: "Test offering",
        kind: "ITEM",
        canonicalItemId: canonical.id,
        quantityBasis: "AREA_LW",
        durationBasis: "VC_CHARGE_DAYS",
        billingUnit: "SQ_FT",
      },
    });

    await assert.rejects(
      prisma.commercialOffering.create({
        data: {
          code: offering.code,
          name: "Duplicate",
          kind: "ITEM",
          quantityBasis: "COUNT",
          durationBasis: "ONE_OFF",
          billingUnit: "NOS",
        },
      }),
    );

    const batch = await prisma.importBatch.create({
      data: {
        sourceType: "ACTIVE_COMMERCIAL_MASTER",
        filename: "test-master.xlsx",
        fileHash: `hash-${suffix}`,
        status: "VALIDATED",
      },
    });
    const market = await prisma.rateMarket.create({
      data: { code: `TEST-CITY-${suffix}`, cityName: "Test City" },
    });

    await prisma.price.createMany({
      data: [
        {
          commercialOfferingId: offering.id,
          side: "TO_CLIENT",
          scopeType: "GLOBAL",
          amountPaise: 100_000,
          sourceImportId: batch.id,
        },
        {
          commercialOfferingId: offering.id,
          side: "TO_VENDOR",
          scopeType: "GLOBAL",
          amountPaise: 70_000,
          sourceImportId: batch.id,
        },
        {
          commercialOfferingId: offering.id,
          side: "TO_CLIENT",
          scopeType: "CITY",
          marketId: market.id,
          amountPaise: 0,
          sourceImportId: batch.id,
        },
      ],
    });

    const prices = await prisma.price.findMany({ where: { commercialOfferingId: offering.id } });
    assert.deepEqual(
      prices.filter((price) => price.scopeType === "GLOBAL").map((price) => [price.side, price.amountPaise]).sort(),
      [["TO_CLIENT", 100_000], ["TO_VENDOR", 70_000]],
    );
    assert.equal(prices.find((price) => price.scopeType === "CITY")?.amountPaise, 0);
    assert.equal(prices.find((price) => price.scopeType === "CITY")?.marketId, market.id);

    const otherOffering = await prisma.commercialOffering.create({
      data: {
        code: `TEST-NO-PRICE-${suffix}`,
        name: "Offering without an approved rate",
        kind: "SERVICE",
        quantityBasis: "FIXED",
        durationBasis: "ONE_OFF",
        billingUnit: "LUMPSUM",
      },
    });
    assert.equal(await prisma.price.count({ where: { commercialOfferingId: otherOffering.id } }), 0);

    const observation = await prisma.rateObservation.create({
      data: {
        sourceFile: "city-history.xlsx",
        sourceSheet: "VC",
        sourceRow: 8,
        rawDescription: "Historic description",
        canonicalItemId: canonical.id,
        commercialOfferingId: offering.id,
        marketId: market.id,
        observedRatePaise: 55_000,
        importBatchId: batch.id,
      },
    });
    await prisma.sourceMapping.create({
      data: {
        sourceSystem: "workbook",
        sourceFile: "test-master.xlsx",
        sourceSheet: "LookUp",
        sourceCode: `SRC-${suffix}`,
        sourceDescription: "Source description",
        canonicalItemId: canonical.id,
        commercialOfferingId: offering.id,
        importBatchId: batch.id,
      },
    });
    assert.equal(await prisma.price.count({ where: { commercialOfferingId: offering.id } }), 3);
    assert.equal(observation.importBatchId, batch.id);
    assert.equal(await prisma.sourceMapping.count({ where: { importBatchId: batch.id } }), 1);
  } finally {
    await prisma.rateObservation.deleteMany({ where: { sourceFile: { in: ["city-history.xlsx"] }, importBatch: { fileHash: `hash-${suffix}` } } });
    await prisma.sourceMapping.deleteMany({ where: { importBatch: { fileHash: `hash-${suffix}` } } });
    await prisma.price.deleteMany({ where: { sourceImport: { fileHash: `hash-${suffix}` } } });
    await prisma.commercialOffering.deleteMany({ where: { code: { in: [`TEST-OFFERING-${suffix}`, `TEST-NO-PRICE-${suffix}`] } } });
    await prisma.canonicalItem.deleteMany({ where: { code: `TEST-CANONICAL-${suffix}` } });
    await prisma.rateMarket.deleteMany({ where: { code: `TEST-CITY-${suffix}` } });
    await prisma.importBatch.deleteMany({ where: { fileHash: `hash-${suffix}` } });
    await prisma.$disconnect();
  }
});
