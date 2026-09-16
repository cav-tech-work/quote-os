import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  catalogueCounts,
  databaseIdentity,
  formatResetReport,
  historicalCounts,
  OPERATIONAL_CATALOGUE_TABLES,
  preservedCounts,
  REMOVABLE_RELEASE_STATUSES,
  RETAINED_RELEASE_STATUSES,
  resetCatalogue,
  RESET_CONFIRMATION_TOKEN,
  RESET_SCOPE,
  RESET_TABLES,
  ResetInputError,
  validateResetRequest,
} from "../lib/catalogue-reset";
import { deleteAllReleases, wipeDatabase } from "./reset-helpers";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function total(counts: Record<string, number>) {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

test("catalogue reset refuses ambiguous or unconfirmed execution", () => {
  assert.throws(() => validateResetRequest({ target: null, confirm: null, execute: false }), ResetInputError);
  assert.throws(() => validateResetRequest({ target: "staging", confirm: "RESET_CATALOGUE", execute: false }), ResetInputError);
  assert.throws(() => validateResetRequest({ target: "production", confirm: null, execute: true }), ResetInputError);
  assert.throws(() => validateResetRequest({ target: "production", confirm: "reset_catalogue", execute: true }), ResetInputError);
  assert.throws(() => validateResetRequest({ target: "production", confirm: `${RESET_CONFIRMATION_TOKEN} `, execute: true }), ResetInputError);
  // A dry run needs the explicit production target but no confirmation token.
  assert.doesNotThrow(() => validateResetRequest({ target: "production", confirm: null, execute: false }));
  assert.doesNotThrow(() => validateResetRequest({ target: "production", confirm: RESET_CONFIRMATION_TOKEN, execute: true }));
});

test("reset identity never prints credentials and dry runs are labelled", () => {
  const identity = databaseIdentity("postgresql://quoteos:super-secret@db.example.com:5432/quoteos?schema=public");
  assert.equal(identity.host, "db.example.com:5432");
  assert.equal(identity.database, "quoteos");
  assert.equal(identity.user, "quoteos");
  assert.equal(JSON.stringify(identity).includes("super-secret"), false);
  assert.equal(databaseIdentity("not-a-url").host, "(unparseable DATABASE_URL)");
});

test("reset scope classifies every catalogue-related model explicitly", () => {
  const scope = new Map(RESET_SCOPE.map((entry) => [entry.table, entry.classification]));
  const expected: Record<string, string> = {
    canonicalItem: "REMOVED",
    commercialOffering: "REMOVED",
    price: "REMOVED",
    priceAuditEvent: "REMOVED",
    alias: "REMOVED",
    sourceMapping: "REMOVED",
    rateObservation: "REMOVED",
    importBatch: "REMOVED",
    importRow: "REMOVED",
    catalogueSemanticAudit: "REMOVED",
    catalogueSemanticApply: "REMOVED",
    packageTemplate: "REMOVED",
    packageComponent: "REMOVED",
    offeringBusinessReview: "REMOVED",
    offeringBusinessFieldReview: "REMOVED",
    businessReviewAudit: "REMOVED",
    catalogueRelease: "RETAINED_HISTORICAL",
    catalogueReleaseAudit: "RETAINED_HISTORICAL",
    catalogueItem: "REMOVED",
    catalogueCategory: "REMOVED",
    durationPolicy: "RETAINED_ENGINE_CONFIG",
    durationPolicyPoint: "RETAINED_ENGINE_CONFIG",
    rateMarket: "RETAINED_ENGINE_CONFIG",
    quote: "PRESERVED_APPLICATION_DATA",
    quoteRevision: "PRESERVED_APPLICATION_DATA",
    quoteLine: "PRESERVED_APPLICATION_DATA",
    quotePackageComponentSnapshot: "PRESERVED_APPLICATION_DATA",
    generatedDocument: "PRESERVED_APPLICATION_DATA",
    user: "PRESERVED_APPLICATION_DATA",
  };
  for (const [table, classification] of Object.entries(expected)) assert.equal(scope.get(table), classification, table);
  // Retained/engine tables are never in the destructive plan.
  for (const table of ["catalogueRelease", "catalogueReleaseAudit", "durationPolicy", "durationPolicyPoint", "rateMarket", "quote", "quoteLine", "generatedDocument", "user"]) {
    assert.equal(RESET_TABLES.includes(table as never), false, table);
  }
  // The empty-catalogue invariant is asserted by name.
  for (const table of ["canonicalItem", "commercialOffering", "price", "packageTemplate", "packageComponent", "catalogueItem", "catalogueCategory"]) {
    assert.equal(OPERATIONAL_CATALOGUE_TABLES.includes(table as never), true, table);
  }
});

test("production startup never invokes the catalogue reset", () => {
  const startScript = readFileSync(resolve(repositoryRoot, "scripts/start.sh"), "utf8");
  const dockerfile = readFileSync(resolve(repositoryRoot, "Dockerfile"), "utf8");
  for (const source of [startScript, dockerfile]) {
    assert.equal(/catalogue-reset|catalogue:reset|RESET_CATALOGUE/.test(source), false);
  }
  assert.match(startScript, /migrate deploy/);
});

const databaseUrl = process.env.RESET_TEST_DATABASE_URL;

test("catalogue release immutability: non-approved deletes succeed and APPROVED stays immutable", { skip: !databaseUrl }, async () => {
  const db = new PrismaClient({ datasourceUrl: databaseUrl! });
  const suffix = Date.now().toString(36).toUpperCase().slice(-6);
  let actorId = "";
  try {
    await wipeDatabase(db);
    const actor = await db.user.create({ data: { email: `release-${suffix.toLowerCase()}@quoteos.test`, role: "ADMIN" } });
    actorId = actor.id;
    const base = { createdById: actor.id, catalogueFingerprint: "fp", releaseFingerprint: "rfp", technicalDecisionHashes: {}, contents: {}, summary: {} };
    const draft = await db.catalogueRelease.create({ data: { ...base, code: `REL_DRAFT_${suffix}`, status: "DRAFT", decisionSetHash: `dh-draft-${suffix}` } });
    const ready = await db.catalogueRelease.create({ data: { ...base, code: `REL_READY_${suffix}`, status: "READY_FOR_APPROVAL", decisionSetHash: `dh-ready-${suffix}` } });
    const approved = await db.catalogueRelease.create({ data: { ...base, code: `REL_APPROVED_${suffix}`, status: "APPROVED", decisionSetHash: `dh-approved-${suffix}` } });

    // Non-approved releases now delete for real (the old trigger silently returned 0).
    assert.equal((await db.catalogueRelease.deleteMany({ where: { id: draft.id } })).count, 1);
    assert.equal((await db.catalogueRelease.deleteMany({ where: { id: ready.id } })).count, 1);
    assert.equal(await db.catalogueRelease.count({ where: { id: { in: [draft.id, ready.id] } } }), 0);

    // APPROVED delete is rejected by the trigger, not silently skipped.
    await assert.rejects(db.catalogueRelease.delete({ where: { id: approved.id } }), /Approved catalogue releases are immutable/);
    // APPROVED update protection is unchanged.
    await assert.rejects(db.catalogueRelease.update({ where: { id: approved.id }, data: { notes: "mutate approved" } }), /Approved catalogue releases are immutable/);
    // A permitted update on a non-approved release still works.
    const revived = await db.catalogueRelease.create({ data: { ...base, code: `REL_EDIT_${suffix}`, status: "DRAFT", decisionSetHash: `dh-edit-${suffix}` } });
    assert.equal((await db.catalogueRelease.update({ where: { id: revived.id }, data: { notes: "ok" } })).notes, "ok");
    assert.equal(await db.catalogueRelease.count({ where: { id: approved.id } }), 1);
  } finally {
    await deleteAllReleases(db).catch(() => undefined);
    if (actorId) await db.user.delete({ where: { id: actorId } }).catch(() => undefined);
    await db.$disconnect();
  }
});

test("guarded reset clears the operational catalogue, retains approved releases and is idempotent", { skip: !databaseUrl }, async () => {
  const db = new PrismaClient({ datasourceUrl: databaseUrl! });
  const suffix = Date.now().toString(36).toUpperCase().slice(-6);
  let actorId = "";
  let quoteId = "";

  try {
    await wipeDatabase(db);
    const actor = await db.user.create({ data: { email: `reset-${suffix.toLowerCase()}@quoteos.test`, role: "ADMIN" } });
    actorId = actor.id;

    // Engine configuration: retained.
    const policy = await db.durationPolicy.create({ data: { code: `R_POL_${suffix}`, name: "Reset policy", mode: "ONE_OFF", authority: "INTERNAL_APPROVED", chargeMultiplierNumerator: 1, chargeMultiplierDenominator: 1, minimumChargeNumerator: 1, minimumChargeDenominator: 1, roundingMode: "NONE" } });
    const market = await db.rateMarket.create({ data: { code: `RM${suffix}`.slice(0, 20), cityName: "Reset City" } });

    // Operational catalogue: removed.
    const canonical = await db.canonicalItem.create({ data: { code: `R_CAN_${suffix}`, name: "Reset canonical", domain: "OTHER" } });
    const offering = await db.commercialOffering.create({ data: { code: `R_OFF_${suffix}`, name: "Reset offering", canonicalItemId: canonical.id, kind: "ITEM", billingUnit: "NOS", quantityBasis: "COUNT", pricingFamily: "ORDINARY", durationPolicyId: policy.id } });
    const price = await db.price.create({ data: { commercialOfferingId: offering.id, side: "TO_CLIENT", scopeType: "GLOBAL", amountPaise: 5000 } });
    await db.priceAuditEvent.create({ data: { actorId: actor.id, commercialOfferingId: offering.id, side: "TO_CLIENT", scopeType: "GLOBAL", action: "CREATE", newPriceId: price.id, reason: "fixture" } });
    await db.alias.create({ data: { commercialOfferingId: offering.id, normalizedText: `reset${suffix.toLowerCase()}`, originalText: "Reset alias", source: "fixture" } });
    await db.sourceMapping.create({ data: { sourceSystem: "fixture", sourceDescription: "Reset mapping", commercialOfferingId: offering.id, canonicalItemId: canonical.id } });
    await db.rateObservation.create({ data: { sourceFile: "fixture.xlsx", sourceSheet: "Sheet1", rawDescription: "Reset observation", commercialOfferingId: offering.id, marketId: market.id } });
    const batch = await db.importBatch.create({ data: { sourceType: "ACTIVE_COMMERCIAL_MASTER", filename: "fixture.xlsx", fileHash: `hash-${suffix}` } });
    await db.importRow.create({ data: { importBatchId: batch.id, sheet: "Sheet1", rowNumber: 1, rawData: {}, rowHash: `row-${suffix}` } });
    const template = await db.packageTemplate.create({ data: { code: `R_PKG_${suffix}`, name: "Reset package", version: 1, pricingMode: "COMPONENT_SUM", active: true } });
    await db.packageComponent.create({ data: { packageTemplateId: template.id, commercialOfferingId: offering.id, quantityRuleType: "FIXED_PER_PACKAGE", quantityValue: new Prisma.Decimal("1"), billingMode: "BILLABLE", sortOrder: 1 } });
    const review = await db.offeringBusinessReview.create({ data: { commercialOfferingId: offering.id, status: "UNREVIEWED", reviewedById: actor.id } });
    await db.offeringBusinessFieldReview.create({ data: { businessReviewId: review.id, field: "IDENTITY", status: "UNREVIEWED" } });
    await db.businessReviewAudit.create({ data: { businessReviewId: review.id, actorId: actor.id, oldStatus: "UNREVIEWED", newStatus: "APPROVED", reason: "fixture" } });
    await db.catalogueSemanticApply.create({ data: { decisionSetHash: `sdh-${suffix}`, catalogueFingerprint: "fp", applyIdentity: `ADMIN:${actor.email}` } });
    await db.catalogueSemanticAudit.create({ data: { commercialOfferingId: offering.id, field: "quantityBasis", newValue: "COUNT", reason: "fixture", decisionSetHash: `sdh-${suffix}`, applyIdentity: `ADMIN:${actor.email}` } });
    await db.durationPolicyAssignmentAudit.create({ data: { actorId: actor.id, commercialOfferingId: offering.id, newPolicyId: policy.id, reason: "fixture" } });
    const legacyCategory = await db.catalogueCategory.create({ data: { name: `Legacy ${suffix}` } });
    await db.catalogueItem.create({ data: { code: `LEG_${suffix}`, categoryId: legacyCategory.id, name: "Legacy item", vendorRatePaise: 100, clientRatePaise: 200 } });

    // Release workflow: DRAFT + READY_FOR_APPROVAL removed, APPROVED + SUPERSEDED retained.
    const releaseBase = { createdById: actor.id, catalogueFingerprint: "fp", releaseFingerprint: "rfp", technicalDecisionHashes: {}, contents: {}, summary: {} };
    const draftRelease = await db.catalogueRelease.create({ data: { ...releaseBase, code: `REL_DRAFT_${suffix}`, status: "DRAFT", decisionSetHash: `rd-${suffix}` } });
    const readyRelease = await db.catalogueRelease.create({ data: { ...releaseBase, code: `REL_READY_${suffix}`, status: "READY_FOR_APPROVAL", decisionSetHash: `rr-${suffix}` } });
    const approvedRelease = await db.catalogueRelease.create({ data: { ...releaseBase, code: `REL_APPROVED_${suffix}`, status: "APPROVED", decisionSetHash: `ra-${suffix}` } });
    const supersededRelease = await db.catalogueRelease.create({ data: { ...releaseBase, code: `REL_SUPER_${suffix}`, status: "SUPERSEDED", decisionSetHash: `rs-${suffix}` } });
    for (const release of [draftRelease, readyRelease, approvedRelease, supersededRelease]) {
      await db.catalogueReleaseAudit.create({ data: { releaseId: release.id, actorId: actor.id, oldStatus: "DRAFT", newStatus: release.status, reason: "fixture" } });
    }

    // Preserved history.
    const quote = await db.quote.create({ data: { number: `QT-RESET-${suffix}`, type: "CLIENT", company: "Reset customer", createdById: actor.id } });
    quoteId = quote.id;
    const revision = await db.quoteRevision.create({ data: { quoteId: quote.id, revisionNumber: 1, status: "ISSUED", createdById: actor.id, preparedDate: new Date(), taxPercentage: new Prisma.Decimal("18"), settingsSnapshot: {}, subtotalPaise: 5000, discountTotalPaise: 0, taxTotalPaise: 900, grandTotalPaise: 5900 } });
    const line = await db.quoteLine.create({ data: {
      revisionId: revision.id, commercialOfferingId: offering.id, packageTemplateId: template.id,
      itemCodeSnapshot: "R_OFF", itemNameSnapshot: "Reset offering", unitSnapshot: "NOS",
      quantity: new Prisma.Decimal("1"), days: new Prisma.Decimal("1"), rateUsedPaise: 5000, discountPaise: 0, lineTotalPaise: 5000,
      configurationSnapshot: {}, pricingFamilySnapshot: "ORDINARY", quantityBasisSnapshot: "COUNT",
      billableQuantitySnapshot: "1", billableQuantityNumeratorSnapshot: "1", billableQuantityDenominatorSnapshot: "1",
      rateSideSnapshot: "TO_CLIENT", priceIdSnapshot: price.id, rateScopeSnapshot: "GLOBAL", currencySnapshot: "INR",
      baseAmountPaiseSnapshot: 5000, finalAmountPaiseSnapshot: 5000, pricingEngineVersion: "eng-1", snapshotSchemaVersion: "snap-1",
      durationPolicyIdSnapshot: policy.id, durationPolicyCodeSnapshot: policy.code, durationPolicyModeSnapshot: "ONE_OFF",
      chargeUnitsSnapshot: "1", durationResolutionProvenanceSnapshot: "POLICY_RESOLVED",
    } });

    // Dry run: nothing changes, sections are explicit, approved releases are reported.
    const baseline = await catalogueCounts(db);
    assert.equal(total(baseline) > 0, true);
    const dryRun = await resetCatalogue({ target: "production", confirm: null, execute: false, databaseUrl: "postgresql://quoteos:dry-secret@db.example.com:5432/quoteos" }, db);
    assert.equal(dryRun.executed, false);
    assert.equal(JSON.stringify(dryRun).includes("dry-secret"), false);
    assert.equal(dryRun.releases.removable, 2);
    assert.equal(dryRun.releases.retained, 2);
    const dryReport = formatResetReport(dryRun);
    for (const section of ["WOULD REMOVE", "WOULD RETAIN — ENGINE CONFIGURATION", "WOULD RETAIN — HISTORICAL RECORDS", "WOULD PRESERVE — APPLICATION AND HISTORY DATA"]) {
      assert.equal(dryReport.includes(section), true, section);
    }
    assert.equal(dryReport.includes(`REL_APPROVED_${suffix} — APPROVED`), true);
    assert.equal(dryReport.includes(`REL_SUPER_${suffix} — SUPERSEDED`), true);
    assert.deepEqual(await catalogueCounts(db), baseline);
    assert.equal(await db.catalogueRelease.count({ where: { id: { in: [draftRelease.id, readyRelease.id] } } }), 2);

    // Unconfirmed execution is refused and leaves everything intact.
    await assert.rejects(resetCatalogue({ target: "production", confirm: "not-the-token", execute: true }, db), ResetInputError);
    await assert.rejects(resetCatalogue({ target: null, confirm: RESET_CONFIRMATION_TOKEN, execute: true }, db), ResetInputError);
    assert.equal(await db.commercialOffering.count(), 1);

    // Confirmed execution.
    const result = await resetCatalogue({ target: "production", confirm: RESET_CONFIRMATION_TOKEN, execute: true }, db);
    assert.equal(result.executed, true);

    // Operational catalogue is empty, by name.
    const after = await catalogueCounts(db);
    assert.equal(total(after), 0);
    for (const table of OPERATIONAL_CATALOGUE_TABLES) {
      const count = await (db as unknown as Record<string, { count: () => Promise<number> }>)[table].count();
      assert.equal(count, 0, table);
    }

    // Release workflow state removed; approved/superseded history retained with its audit.
    assert.equal(await db.catalogueRelease.count({ where: { id: { in: [draftRelease.id, readyRelease.id] } } }), 0);
    assert.equal(await db.catalogueRelease.count({ where: { id: { in: [approvedRelease.id, supersededRelease.id] } } }), 2);
    assert.equal(await db.catalogueReleaseAudit.count({ where: { releaseId: { in: [approvedRelease.id, supersededRelease.id] } } }), 2);
    assert.deepEqual(await historicalCounts(db), { catalogueRelease: 2, catalogueReleaseAudit: 2 });
    assert.equal(REMOVABLE_RELEASE_STATUSES.length, 2);
    assert.equal(RETAINED_RELEASE_STATUSES.length, 2);

    // Engine configuration retained.
    assert.equal(await db.durationPolicy.count({ where: { id: policy.id } }), 1);
    assert.equal(await db.rateMarket.count({ where: { id: market.id } }), 1);

    // Application and quote history preserved.
    assert.equal(await db.user.count({ where: { id: actor.id } }), 1);
    assert.equal(await db.quote.count({ where: { id: quoteId } }), 1);
    assert.equal(await db.quoteRevision.count({ where: { id: revision.id } }), 1);
    assert.equal(await db.quoteLine.count({ where: { id: line.id } }), 1);
    assert.deepEqual(await preservedCounts(db), result.preserved);
    const surviving = await db.quoteLine.findUniqueOrThrow({ where: { id: line.id } });
    assert.equal(surviving.commercialOfferingId, null);
    assert.equal(surviving.packageTemplateId, null);
    assert.equal(surviving.finalAmountPaiseSnapshot, 5000);

    // Second run is safe and reports an already-empty operational catalogue.
    const again = await resetCatalogue({ target: "production", confirm: RESET_CONFIRMATION_TOKEN, execute: true }, db);
    assert.equal(again.executed, true);
    assert.equal(total(again.after), 0);
    assert.equal(again.releases.removable, 0);
    assert.equal(again.releases.retained, 2);
    assert.match(formatResetReport(again), /Operational catalogue is now empty\./);
    assert.equal(await db.catalogueRelease.count({ where: { id: approvedRelease.id } }), 1);
    assert.equal(await db.quoteLine.count({ where: { id: line.id } }), 1);
  } finally {
    await wipeDatabase(db).catch(() => undefined);
    await db.$disconnect();
  }
});

test("approved releases survive a reset even when operational catalogue rows remain", { skip: !databaseUrl }, async () => {
  const db = new PrismaClient({ datasourceUrl: databaseUrl! });
  const suffix = Date.now().toString(36).toUpperCase().slice(-6);
  let actorId = "";
  try {
    await wipeDatabase(db);
    const actor = await db.user.create({ data: { email: `retain-${suffix.toLowerCase()}@quoteos.test`, role: "ADMIN" } });
    actorId = actor.id;
    const approved = await db.catalogueRelease.create({ data: { createdById: actor.id, code: `REL_KEEP_${suffix}`, status: "APPROVED", catalogueFingerprint: "fp", releaseFingerprint: "rfp", decisionSetHash: `rk-${suffix}`, technicalDecisionHashes: {}, contents: {}, summary: {} } });
    const canonical = await db.canonicalItem.create({ data: { code: `K_CAN_${suffix}`, name: "Keep canonical", domain: "OTHER" } });
    await db.commercialOffering.create({ data: { code: `K_OFF_${suffix}`, name: "Keep offering", canonicalItemId: canonical.id, kind: "ITEM", billingUnit: "NOS" } });

    const result = await resetCatalogue({ target: "production", confirm: RESET_CONFIRMATION_TOKEN, execute: true }, db);
    assert.equal(total(result.after), 0);
    // The approved release neither blocked the reset nor was deleted.
    assert.equal(await db.catalogueRelease.count({ where: { id: approved.id } }), 1);
    assert.equal(await db.commercialOffering.count(), 0);
  } finally {
    await deleteAllReleases(db).catch(() => undefined);
    if (actorId) await db.user.delete({ where: { id: actorId } }).catch(() => undefined);
    await db.$disconnect();
  }
});
