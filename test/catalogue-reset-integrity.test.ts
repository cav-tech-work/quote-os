import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import { persistNormalizedQuote } from "../lib/normalized-quotes";
import { getRetainedDocument, getRevisionForPreview, issueRevision, renderRevisionPdf } from "../lib/quote-lifecycle";
import { resetCatalogue, RESET_CONFIRMATION_TOKEN, totalCounts, catalogueCounts } from "../lib/catalogue-reset";
import { wipeDatabase } from "./reset-helpers";

const CATALOGUE_FKS = ["commercialOfferingId", "catalogueItemId", "packageTemplateId"] as const;

/** Drops only the convenience catalogue FKs so every commercial snapshot column is compared. */
function withoutCatalogueFks(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !CATALOGUE_FKS.includes(key as never)));
}

/** Relation includes do not guarantee row order, so compare a stable id-sorted projection. */
function stableSnapshot(rows: ReadonlyArray<Record<string, unknown>>) {
  return JSON.stringify([...rows].sort((left, right) => String(left.id).localeCompare(String(right.id))).map(withoutCatalogueFks));
}

const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

const databaseUrl = process.env.RESET_INTEGRITY_TEST_DATABASE_URL;

/**
 * Acceptance proof for allowing catalogue FK nulling on hard reset:
 * every commercial value must survive in immutable snapshots, and retained
 * issued documents must be byte-identical and still retrievable.
 */
test("catalogue reset preserves quote, revision, line snapshots, totals and retained PDF bytes", { skip: !databaseUrl }, async () => {
  const db = new PrismaClient({ datasourceUrl: databaseUrl! });
  const suffix = Date.now().toString(36).toUpperCase().slice(-6);
  let actorId = "";
  try {
    await wipeDatabase(db);
    const actor = await db.user.create({ data: { email: `integrity-${suffix.toLowerCase()}@quoteos.test`, role: "ADMIN" } });
    actorId = actor.id;

    const policy = await db.durationPolicy.create({ data: { code: `INT_POL_${suffix}`, name: "Integrity one-off", mode: "ONE_OFF", authority: "INTERNAL_APPROVED", chargeMultiplierNumerator: 1, chargeMultiplierDenominator: 1, minimumChargeNumerator: 1, minimumChargeDenominator: 1, roundingMode: "NONE" } });
    const canonical = await db.canonicalItem.create({ data: { code: `INT_CAN_${suffix}`, name: "Integrity canonical", domain: "OTHER" } });
    const ordinary = await db.commercialOffering.create({ data: { code: `INT_OFF_${suffix}`, name: "Integrity ordinary", canonicalItemId: canonical.id, kind: "ITEM", billingUnit: "NOS", quantityBasis: "COUNT", pricingFamily: "ORDINARY", durationPolicyId: policy.id } });
    const parent = await db.commercialOffering.create({ data: { code: `INT_PKG_${suffix}`, name: "Integrity package parent", canonicalItemId: canonical.id, kind: "PACKAGE", billingUnit: "NOS", quantityBasis: "COUNT", pricingFamily: "ORDINARY", durationPolicyId: policy.id } });
    await db.price.create({ data: { commercialOfferingId: ordinary.id, side: "TO_CLIENT", scopeType: "GLOBAL", amountPaise: 10000 } });
    await db.price.create({ data: { commercialOfferingId: parent.id, side: "TO_CLIENT", scopeType: "GLOBAL", amountPaise: 90000 } });
    const template = await db.packageTemplate.create({ data: { code: `INT_PKG_${suffix}`, name: "Integrity package", version: 1, pricingMode: "COMPONENT_SUM", active: true, authority: "INTERNAL_APPROVED", components: { create: [{ commercialOfferingId: ordinary.id, quantityRuleType: "FIXED_PER_PACKAGE", quantityValue: new Prisma.Decimal("2"), billingMode: "BILLABLE", sortOrder: 1 }] } } });

    // A normalized ordinary line and a package line live in one issued revision.
    const quote = await persistNormalizedQuote({
      type: "CLIENT", company: "Integrity customer", project: "Reset integrity", taxPercentage: 18, eventDays: 2,
      lines: [{ commercialOfferingId: ordinary.id, configuration: { quantity: "1" }, usageDays: "2", discountPercent: 0 }],
      packages: [{ packageTemplateId: template.id, packageQuantity: "1", discountPercent: 0 }],
    }, actor.id, db as never);
    const quoteId = quote.id;
    const revisionId = quote.revision.id;

    // A legacy line proves the legacy catalogue FK also survives as a snapshot.
    const legacyCategory = await db.catalogueCategory.create({ data: { name: `Integrity legacy ${suffix}` } });
    const legacyItem = await db.catalogueItem.create({ data: { code: `INT_LEG_${suffix}`, categoryId: legacyCategory.id, name: "Integrity legacy item", vendorRatePaise: 100, clientRatePaise: 200 } });
    const legacyQuote = await db.quote.create({ data: { number: `QT-INTEG-${suffix}`, type: "CLIENT", company: "Integrity legacy customer", createdById: actor.id } });
    const legacyRevision = await db.quoteRevision.create({ data: { quoteId: legacyQuote.id, revisionNumber: 1, status: "DRAFT", createdById: actor.id, preparedDate: new Date(), taxPercentage: new Prisma.Decimal("18"), settingsSnapshot: {}, subtotalPaise: 200, discountTotalPaise: 0, taxTotalPaise: 36, grandTotalPaise: 236 } });
    const legacyLine = await db.quoteLine.create({ data: { revisionId: legacyRevision.id, catalogueItemId: legacyItem.id, itemCodeSnapshot: `INT_LEG_${suffix}`, itemNameSnapshot: "Integrity legacy item", unitSnapshot: "Per Day", quantity: new Prisma.Decimal("1"), days: new Prisma.Decimal("1"), rateUsedPaise: 200, discountPaise: 0, lineTotalPaise: 200 } });

    // Issue the revision with the real renderer and retain the PDF bytes.
    const issued = await issueRevision(quoteId, revisionId, actor.id, db);
    assert.equal(issued.idempotent, false);
    const retainedBefore = await getRetainedDocument(quoteId, revisionId, db);
    const bytesHashBefore = digest(retainedBefore.bytes);
    assert.equal(bytesHashBefore, issued.document.checksum);
    assert.ok(retainedBefore.bytes.byteLength > 0);

    // Record all commercial truth.
    const beforeLines = await db.quoteLine.findMany({ where: { revisionId }, orderBy: { id: "asc" }, include: { packageComponents: { orderBy: { sortOrder: "asc" } } } });
    const beforeRevision = await db.quoteRevision.findUniqueOrThrow({ where: { id: revisionId } });
    const beforeSnapshot = stableSnapshot(beforeLines as unknown as Record<string, unknown>[]);
    const beforeComponents = stableSnapshot(beforeLines.flatMap((line) => line.packageComponents) as unknown as Record<string, unknown>[]);
    const beforeReadback = stableSnapshot((await getRevisionForPreview(quoteId, revisionId, db)).lines as unknown as Record<string, unknown>[]);
    const beforeTotals = { subtotalPaise: beforeRevision.subtotalPaise, discountTotalPaise: beforeRevision.discountTotalPaise, taxTotalPaise: beforeRevision.taxTotalPaise, grandTotalPaise: beforeRevision.grandTotalPaise };
    const quoteCount = await db.quote.count();
    const revisionCount = await db.quoteRevision.count();
    const lineCount = await db.quoteLine.count();
    const componentSnapshotCount = await db.quotePackageComponentSnapshot.count();
    const documentCount = await db.generatedDocument.count();
    assert.equal(beforeLines.length, 2, "one normalized line and one package line");
    assert.equal(beforeLines.some((line) => line.commercialOfferingId === ordinary.id), true);
    assert.equal(beforeLines.some((line) => line.packageTemplateId === template.id), true);
    assert.equal(componentSnapshotCount, 1);

    // Hard reset.
    const result = await resetCatalogue({ target: "production", confirm: RESET_CONFIRMATION_TOKEN, execute: true }, db);
    assert.equal(result.executed, true);
    assert.equal(totalCounts(await catalogueCounts(db)), 0);

    // 1-3. Quote, revision, line and component rows are unchanged in count.
    assert.equal(await db.quote.count(), quoteCount);
    assert.equal(await db.quoteRevision.count(), revisionCount);
    assert.equal(await db.quoteLine.count(), lineCount);
    assert.equal(await db.quotePackageComponentSnapshot.count(), componentSnapshotCount);
    assert.equal(await db.generatedDocument.count(), documentCount);
    assert.equal(await db.quote.findUniqueOrThrow({ where: { id: quoteId } }).then(() => true), true);
    assert.equal(await db.quoteRevision.count({ where: { id: revisionId } }), 1);

    // 4. Only the catalogue-reference FKs are nulled.
    const afterLines = await db.quoteLine.findMany({ where: { revisionId }, orderBy: { id: "asc" }, include: { packageComponents: { orderBy: { sortOrder: "asc" } } } });
    for (const line of afterLines) {
      assert.equal(line.commercialOfferingId, null);
      assert.equal(line.catalogueItemId, null);
      assert.equal(line.packageTemplateId, null);
    }
    const afterLegacy = await db.quoteLine.findUniqueOrThrow({ where: { id: legacyLine.id } });
    assert.equal(afterLegacy.catalogueItemId, null);
    assert.equal(afterLegacy.itemNameSnapshot, "Integrity legacy item");
    assert.equal(afterLegacy.rateUsedPaise, 200);

    // 5-7. Every commercial snapshot, component snapshot, readback and total is byte/value-identical.
    assert.equal(stableSnapshot(afterLines as unknown as Record<string, unknown>[]), beforeSnapshot);
    assert.equal(stableSnapshot(afterLines.flatMap((line) => line.packageComponents) as unknown as Record<string, unknown>[]), beforeComponents);
    assert.equal(stableSnapshot((await getRevisionForPreview(quoteId, revisionId, db)).lines as unknown as Record<string, unknown>[]), beforeReadback);
    const afterRevision = await db.quoteRevision.findUniqueOrThrow({ where: { id: revisionId } });
    assert.deepEqual({ subtotalPaise: afterRevision.subtotalPaise, discountTotalPaise: afterRevision.discountTotalPaise, taxTotalPaise: afterRevision.taxTotalPaise, grandTotalPaise: afterRevision.grandTotalPaise }, beforeTotals);

    // 8. Retained issued document bytes and hash are unchanged.
    const retainedAfter = await getRetainedDocument(quoteId, revisionId, db);
    assert.equal(digest(retainedAfter.bytes), bytesHashBefore);
    assert.equal(retainedAfter.document.checksum, issued.document.checksum);
    assert.deepEqual(retainedAfter.bytes, retainedBefore.bytes);

    // 9. Issued PDF retrieval and re-rendering work with no live catalogue rows.
    const readback = await getRevisionForPreview(quoteId, revisionId, db);
    const rerendered = await renderRevisionPdf(readback.quote, readback);
    assert.ok(rerendered.byteLength > 0);
    assert.equal(rerendered.subarray(0, 4).toString(), "%PDF");
    assert.equal(await db.commercialOffering.count(), 0);
  } finally {
    await wipeDatabase(db).catch(() => undefined);
    await db.$disconnect();
  }
});
