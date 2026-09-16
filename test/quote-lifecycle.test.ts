import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { allocateQuoteNumber } from "../lib/quote-number";
import { createRevisionFromIssued, getRetainedDocument, issueRevision, QuoteLifecycleError, recalculateNormalizedDraftLine, renderRevisionPdf } from "../lib/quote-lifecycle";
import { persistNormalizedQuote } from "../lib/normalized-quotes";

const databaseUrl = process.env.PHASE8_TEST_DATABASE_URL;
test("quote and revision lifecycle retains immutable official PDF bytes", { skip: !databaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } }); const stamp = Date.now();
  const actor = await db.user.create({ data: { email: `phase8-${stamp}@clockwork-av.com`, role: "ADMIN" } }); let quoteId: string | null = null;
  const platform = await db.commercialOffering.findUniqueOrThrow({ where: { code: "PLAT_MAINGREY" } }); const camera = await db.commercialOffering.findUniqueOrThrow({ where: { code: "CCTV_CAME" } }); const person = await db.commercialOffering.findUniqueOrThrow({ where: { code: "SEC_MALEGUAR" } });
  const platformPrice = await db.price.findFirstOrThrow({ where: { commercialOfferingId: platform.id, side: "TO_CLIENT", scopeType: "GLOBAL", marketId: null, active: true } }); const originalAmount = platformPrice.amountPaise; const originalName = platform.name; const originalPolicyId = platform.durationPolicyId;
  try {
    const created = await persistNormalizedQuote({ type: "CLIENT", company: "Phase 8 Original Customer", project: "Lifecycle", venue: "Original Venue", city: "Kolkata", eventDays: 4, taxPercentage: 18, lines: [
      { commercialOfferingId: platform.id, configuration: { quantity: "1", length: { value: "10", unit: "FT" }, width: { value: "10", unit: "FT" } }, discountPercent: 0 },
      { commercialOfferingId: camera.id, configuration: { quantity: "2" }, discountPercent: 0 },
      { commercialOfferingId: person.id, configuration: { headcount: "2", dutyUnitsPerPerson: "2" }, discountPercent: 0 },
    ] }, actor.id, db); quoteId = created.id; const revision1 = created.revision;
    assert.equal(revision1.status, "DRAFT"); assert.equal(revision1.companySnapshot, "Phase 8 Original Customer");
    const preview = await renderRevisionPdf(created, revision1); assert.ok(preview.byteLength > 1000); assert.equal(await db.generatedDocument.count({ where: { revisionId: revision1.id } }), 0);

    const issued = await Promise.all([issueRevision(created.id, revision1.id, actor.id, db), issueRevision(created.id, revision1.id, actor.id, db)]);
    assert.equal(issued.filter((item) => !item.idempotent).length, 1); assert.equal(issued.filter((item) => item.idempotent).length, 1);
    assert.equal(await db.generatedDocument.count({ where: { revisionId: revision1.id } }), 1); assert.equal(await db.quoteEvent.count({ where: { quoteId: created.id, action: "REVISION_ISSUED", metadata: { path: ["revisionId"], equals: revision1.id } } }), 1);
    const retained1 = await getRetainedDocument(created.id, revision1.id, db); const hash1 = createHash("sha256").update(retained1.bytes).digest("hex"); assert.equal(hash1, retained1.document.checksum); assert.equal(retained1.bytes.byteLength, retained1.document.byteSize);
    await assert.rejects(recalculateNormalizedDraftLine(created.id, revision1.id, revision1.lines[0].id, { commercialOfferingId: platform.id, configuration: { quantity: "1", length: { value: "12", unit: "FT" }, width: { value: "10", unit: "FT" } }, discountPercent: 0 }, actor.id, db), (error: unknown) => error instanceof QuoteLifecycleError && error.code === "REVISION_IMMUTABLE");

    await db.price.update({ where: { id: platformPrice.id }, data: { amountPaise: originalAmount + 10_000 } }); const full = await db.durationPolicy.findUniqueOrThrow({ where: { code: "FULL_USE_DAYS" } }); await db.commercialOffering.update({ where: { id: platform.id }, data: { name: "Future Platform Name", durationPolicyId: full.id } }); await db.quote.update({ where: { id: created.id }, data: { company: "Changed Live Customer", venue: "Changed Venue" } });
    const historical = await db.quoteRevision.findUniqueOrThrow({ where: { id: revision1.id }, include: { lines: true } }); assert.equal(historical.companySnapshot, "Phase 8 Original Customer"); assert.equal(historical.lines[0].itemNameSnapshot, originalName); assert.equal(historical.lines[0].rateUsedPaise, originalAmount); assert.equal(historical.lines[0].durationPolicyCodeSnapshot, "HALF_USE_DAYS_MIN_1");
    const retainedAgain = await getRetainedDocument(created.id, revision1.id, db); assert.deepEqual(retainedAgain.bytes, retained1.bytes); assert.equal(createHash("sha256").update(retainedAgain.bytes).digest("hex"), hash1);

    const clones = await Promise.all([createRevisionFromIssued(created.id, revision1.id, actor.id, db), createRevisionFromIssued(created.id, revision1.id, actor.id, db)]); assert.equal(clones[0].revision.id, clones[1].revision.id); const revision2 = clones[0].revision; assert.equal(revision2.revisionNumber, 2); assert.equal(revision2.status, "DRAFT"); assert.equal(revision2.lines[0].rateUsedPaise, originalAmount);
    const clonedCamera = revision2.lines.find((line) => line.itemCodeSnapshot === "CCTV_CAME")!; const clonedPerson = revision2.lines.find((line) => line.itemCodeSnapshot === "SEC_MALEGUAR")!; const clonedPlatform = revision2.lines.find((line) => line.itemCodeSnapshot === "PLAT_MAINGREY")!;
    await recalculateNormalizedDraftLine(created.id, revision2.id, clonedPlatform.id, { commercialOfferingId: platform.id, configuration: { quantity: "1", length: { value: "10", unit: "FT" }, width: { value: "10", unit: "FT" } }, usageDays: "4", discountPercent: 0 }, actor.id, db);
    const edited = await db.quoteRevision.findUniqueOrThrow({ where: { id: revision2.id }, include: { lines: true } }); const editedPlatform = edited.lines.find((line) => line.id === clonedPlatform.id)!; assert.equal(editedPlatform.rateUsedPaise, originalAmount + 10_000); assert.equal(editedPlatform.durationPolicyCodeSnapshot, "FULL_USE_DAYS"); assert.equal(edited.lines.find((line) => line.id === clonedCamera.id)!.finalAmountPaiseSnapshot, clonedCamera.finalAmountPaiseSnapshot); assert.equal(edited.lines.find((line) => line.id === clonedPerson.id)!.finalAmountPaiseSnapshot, clonedPerson.finalAmountPaiseSnapshot);
    const issued2 = await issueRevision(created.id, revision2.id, actor.id, db); const retained2 = await getRetainedDocument(created.id, revision2.id, db); assert.notEqual(issued2.document.id, retained1.document.id); assert.notEqual(retained2.document.checksum, retained1.document.checksum);
    assert.equal((await db.quoteRevision.findUniqueOrThrow({ where: { id: revision1.id } })).status, "SUPERSEDED"); assert.equal((await db.quoteRevision.findUniqueOrThrow({ where: { id: revision2.id } })).status, "ISSUED");

    const numbers = await Promise.all(Array.from({ length: 12 }, () => db.$transaction((tx) => allocateQuoteNumber(tx), { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }))); assert.equal(new Set(numbers).size, numbers.length);
  } finally {
    if (quoteId) { await db.generatedDocument.deleteMany({ where: { revision: { quoteId } } }); await db.quoteEvent.deleteMany({ where: { quoteId } }); await db.quoteLine.deleteMany({ where: { revision: { quoteId } } }); await db.quoteRevision.deleteMany({ where: { quoteId } }); await db.quote.delete({ where: { id: quoteId } }); }
    await db.price.update({ where: { id: platformPrice.id }, data: { amountPaise: originalAmount } }); await db.commercialOffering.update({ where: { id: platform.id }, data: { name: originalName, durationPolicyId: originalPolicyId } }); await db.user.delete({ where: { id: actor.id } }); await db.$disconnect();
  }
});
