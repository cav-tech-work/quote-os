import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { buildCatalogueApplyPlan } from "../lib/catalogue-import/apply-plan";
import { guardedCatalogueApply } from "../lib/catalogue-import/apply";
import { parseWorkbookSheets, readMasterWorkbook } from "../lib/catalogue-import/master-workbook";
import { buildCataloguePreview } from "../lib/catalogue-import/preview";
import { generateReviewDecisions, readReviewDecisions, validateReviewDecisions } from "../lib/catalogue-import/review";
import type { WorkbookSheet } from "../lib/catalogue-import/types";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(readFileSync(resolve(repositoryRoot, "test/fixtures/master-workbook.json"), "utf8")) as WorkbookSheet[];

function fixturePreview(fileHash = "a".repeat(64)) {
  return buildCataloguePreview({ sourceFile: "fixture.xlsx", fileHash, ...parseWorkbookSheets(fixture) });
}

test("review decisions reject stale workbooks", () => {
  const preview = fixturePreview();
  const decisions = generateReviewDecisions(preview);
  decisions.expectedFileSha256 = "b".repeat(64);
  assert.throws(() => validateReviewDecisions(preview, decisions), /STALE_REVIEW/);
});

test("review-required candidates default to deferred", () => {
  const preview = fixturePreview();
  const decisions = generateReviewDecisions(preview);
  delete decisions.sourceMappings["BAD CODE"];
  delete decisions.unitOverrides.RAIL_B;
  const plan = buildCatalogueApplyPlan(preview, decisions);
  assert.equal(plan.rows.find((row) => row.sourceCode === "BAD CODE")?.disposition, "DEFER");
  assert.equal(plan.rows.find((row) => row.sourceCode === "RAIL_B")?.disposition, "DEFER");
  assert.equal(plan.aliases.some((alias) => alias.normalizedText === "common"), false);
});

const databaseUrl = process.env.TEST_DATABASE_URL;

test("guarded apply is atomic, exact, isolated, and idempotent", { skip: !databaseUrl }, async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const preview = fixturePreview();
  const decisions = generateReviewDecisions(preview);
  const appliedCodes = ["CHAIR_C", "SERVICE_E"];
  const canonicalCodes = ["CAN_C", "CAN_E"];
  const normalizedCounts = async () => {
    const batch = await prisma.importBatch.findUnique({ where: { sourceType_fileHash: { sourceType: "ACTIVE_COMMERCIAL_MASTER", fileHash: preview.fileHash } } });
    return Promise.all([
      prisma.canonicalItem.count({ where: { code: { in: canonicalCodes } } }),
      prisma.commercialOffering.count({ where: { code: { in: appliedCodes } } }),
      prisma.alias.count({ where: { source: "CAV_MASTER_WORKBOOK", canonicalItem: { code: { in: canonicalCodes } } } }),
      prisma.sourceMapping.count({ where: { sourceSystem: "CAV_MASTER_WORKBOOK", sourceCode: { in: appliedCodes } } }),
      prisma.price.count({ where: { commercialOffering: { code: { in: appliedCodes } } } }),
      prisma.rateObservation.count({ where: { commercialOffering: { code: { in: appliedCodes } } } }),
      batch ? 1 : 0,
      batch ? prisma.importRow.count({ where: { importBatchId: batch.id } }) : 0,
    ]);
  };
  const legacyState = async () => ({
    items: await prisma.catalogueItem.count(),
    quotes: await prisma.quote.count(),
    lines: await prisma.quoteLine.count(),
    rates: await prisma.catalogueItem.aggregate({ _sum: { vendorRatePaise: true, clientRatePaise: true } }),
  });
  const beforeNormalized = await normalizedCounts();
  const beforeLegacy = await legacyState();

  try {
    await assert.rejects(
      guardedCatalogueApply(prisma, preview, decisions, { execute: true, induceFailureAfterOfferings: true }),
      /INDUCED_APPLY_FAILURE/,
    );
    assert.deepEqual(await normalizedCounts(), beforeNormalized);

    const dryRun = await guardedCatalogueApply(prisma, preview, decisions, { execute: false });
    assert.equal(dryRun.report.result, "DRY_RUN");
    assert.equal(dryRun.plan.summary.cityValuesIgnored, 3);

    const first = await guardedCatalogueApply(prisma, preview, decisions, { execute: true });
    assert.equal(first.report.result, "APPLIED");
    assert.equal(first.report.applied.commercialOfferings, 2);
    assert.equal(first.report.priceCompleteness.both, 1);
    assert.equal(first.report.priceCompleteness.toClientOnly, 1);

    const chair = await prisma.commercialOffering.findUnique({ where: { code: "CHAIR_C" }, include: { prices: true } });
    assert.deepEqual(chair?.prices.map((price) => [price.side, price.amountPaise]), [["TO_CLIENT", 0]]);
    assert.equal(await prisma.rateObservation.count(), beforeNormalized[5]);
    assert.equal(await prisma.alias.count({ where: { normalizedText: "common", source: "CAV_MASTER_WORKBOOK" } }), 0);

    const afterFirst = await normalizedCounts();
    const second = await guardedCatalogueApply(prisma, preview, decisions, { execute: true });
    assert.equal(second.report.result, "ALREADY_APPLIED");
    assert.deepEqual(await normalizedCounts(), afterFirst);
    assert.deepEqual(await legacyState(), beforeLegacy);
  } finally {
    const batch = await prisma.importBatch.findUnique({ where: { sourceType_fileHash: { sourceType: "ACTIVE_COMMERCIAL_MASTER", fileHash: preview.fileHash } } });
    if (batch) {
      await prisma.sourceMapping.deleteMany({ where: { importBatchId: batch.id } });
      await prisma.price.deleteMany({ where: { sourceImportId: batch.id } });
      await prisma.importBatch.delete({ where: { id: batch.id } });
    }
    await prisma.alias.deleteMany({ where: { source: "CAV_MASTER_WORKBOOK", canonicalItem: { code: { in: canonicalCodes } } } });
    await prisma.commercialOffering.deleteMany({ where: { code: { in: appliedCodes } } });
    await prisma.canonicalItem.deleteMany({ where: { code: { in: canonicalCodes } } });
    await prisma.$disconnect();
  }
});

const realWorkbook = process.env.QUOTEOS_MASTER_WORKBOOK;
const applyDatabaseUrl = process.env.QUOTEOS_APPLY_DATABASE_URL;

test("real workbook guarded apply and repeated no-op", { skip: !realWorkbook || !applyDatabaseUrl }, async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: applyDatabaseUrl } } });
  try {
    const preview = buildCataloguePreview(await readMasterWorkbook(realWorkbook!));
    const decisions = await readReviewDecisions(resolve(repositoryRoot, "catalogue-import-decisions.json"));
    const dryRun = await guardedCatalogueApply(prisma, preview, decisions, { execute: false });
    assert.equal(dryRun.plan.summary.deferredSourceRows, 26);
    const first = await guardedCatalogueApply(prisma, preview, decisions, { execute: true });
    assert.equal(first.report.result, "APPLIED");
    const counts = await Promise.all([
      prisma.canonicalItem.count(), prisma.commercialOffering.count(), prisma.alias.count(),
      prisma.sourceMapping.count(), prisma.price.count(), prisma.importBatch.count(), prisma.importRow.count(),
    ]);
    const second = await guardedCatalogueApply(prisma, preview, decisions, { execute: true });
    assert.equal(second.report.result, "ALREADY_APPLIED");
    assert.deepEqual(await Promise.all([
      prisma.canonicalItem.count(), prisma.commercialOffering.count(), prisma.alias.count(),
      prisma.sourceMapping.count(), prisma.price.count(), prisma.importBatch.count(), prisma.importRow.count(),
    ]), counts);
  } finally {
    await prisma.$disconnect();
  }
});
