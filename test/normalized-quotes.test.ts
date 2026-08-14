import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { PrismaClient } from "@prisma/client";
import { assignDurationPolicy } from "../lib/duration-policies";
import { changeCurrentRate } from "../lib/catalogue-rates";
import { calculateNormalizedLine, listNormalizedOfferings, NormalizedQuoteError, persistNormalizedQuote } from "../lib/normalized-quotes";
import { QuotePdf } from "../lib/quote-pdf";

const databaseUrl = process.env.PHASE6_TEST_DATABASE_URL;
test("normalized search, immutable snapshot, master changes, totals and PDF remain isolated", { skip: !databaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = Date.now(); const actor = await db.user.create({ data: { email: `phase6-${suffix}@clockwork-av.com`, role: "ADMIN" } }); const quoteIds: string[] = [];
  const platform = await db.commercialOffering.findUniqueOrThrow({ where: { code: "PLAT_MAINGREY" }, include: { prices: true } }); const originalName = platform.name; const originalPolicyId = platform.durationPolicyId; const originalPrices = platform.prices.map((price) => ({ ...price }));
  let marketId: string | null = null;
  try {
    const client = await listNormalizedOfferings("TO_CLIENT", "", db); const vendor = await listNormalizedOfferings("TO_VENDOR", "", db);
    assert.equal(client.length, 124); assert.equal(vendor.length, 118); assert.notEqual(client.length, vendor.length);
    const headcount = await db.commercialOffering.findFirstOrThrow({ where: { quantityBasis: "HEADCOUNT_DUTY", durationPolicyId: null } });
    await assert.rejects(calculateNormalizedLine({ commercialOfferingId: headcount.id, configuration: { quantity: "1" }, usageDays: "4" }, "TO_CLIENT", db), (error: unknown) => error instanceof NormalizedQuoteError && error.code === "OFFERING_NOT_QUOTE_READY");
    const codes = ["PLAT_MAINGREY", "CHR_BANQCHAI", "BAR_METARAIL", "SCAF_MAINPA", "CARP_ITEM"];
    const offerings = new Map((await db.commercialOffering.findMany({ where: { code: { in: codes } } })).map((item) => [item.code, item]));
    const lines = [
      { code: "PLAT_MAINGREY", configuration: { quantity: "1", length: { value: "32", unit: "FT" as const }, width: { value: "20", unit: "FT" as const } } },
      { code: "CHR_BANQCHAI", configuration: { quantity: "20" }, usageDays: "2" },
      { code: "BAR_METARAIL", configuration: { quantity: "1", length: { value: "100", unit: "FT" as const } } },
      { code: "SCAF_MAINPA", configuration: { quantity: "1", length: { value: "10", unit: "FT" as const }, width: { value: "10", unit: "FT" as const }, height: { value: "10", unit: "FT" as const } } },
      { code: "CARP_ITEM", configuration: { quantity: "1", length: { value: "20", unit: "FT" as const }, width: { value: "10", unit: "FT" as const } } },
    ].map((line) => ({ commercialOfferingId: offerings.get(line.code)!.id, configuration: line.configuration, usageDays: line.usageDays, discountPercent: 0 }));
    const first = await persistNormalizedQuote({ type: "CLIENT", company: "Phase 6 Fixture", eventDays: 4, taxPercentage: 0, lines }, actor.id, db); quoteIds.push(first.id);
    assert.equal(first.revision.lines.length, 5); assert.equal(first.revision.subtotalPaise, first.revision.lines.reduce((sum, line) => sum + line.finalAmountPaiseSnapshot!, 0)); assert.equal(first.revision.grandTotalPaise, first.revision.subtotalPaise);
    const oldPlatform = first.revision.lines.find((line) => line.itemCodeSnapshot === "PLAT_MAINGREY")!; const chair = first.revision.lines.find((line) => line.itemCodeSnapshot === "CHR_BANQCHAI")!; const carpet = first.revision.lines.find((line) => line.itemCodeSnapshot === "CARP_ITEM")!;
    assert.equal(oldPlatform.usageDaysSnapshot, "4"); assert.equal(oldPlatform.chargeUnitsSnapshot, "2"); assert.equal(oldPlatform.billableQuantitySnapshot, "640"); assert.equal(oldPlatform.billableQuantityNumeratorSnapshot, "640"); assert.equal(chair.usageDaysSnapshot, "2"); assert.equal(chair.chargeUnitsSnapshot, "1"); assert.equal(carpet.chargeUnitsSnapshot, "1"); assert.equal(oldPlatform.rateScopeSnapshot, "GLOBAL"); assert.equal(oldPlatform.marketIdSnapshot, null); assert.ok(oldPlatform.priceIdSnapshot); assert.equal(oldPlatform.pricingEngineVersion, "quoteos-exact-v1");
    const overridden = await calculateNormalizedLine({ commercialOfferingId: platform.id, configuration: lines[0].configuration, usageDays: "4", overrideChargeUnits: "3", overrideReason: "Negotiated fixture" }, "TO_CLIENT", db); assert.equal(overridden.calculation.chargeUnits, "3"); assert.equal(overridden.calculation.chargeUnitProvenance, "OVERRIDE_USED");
    const overrideQuote = await persistNormalizedQuote({ type: "CLIENT", company: "Override Fixture", eventDays: 4, taxPercentage: 0, lines: [{ commercialOfferingId: platform.id, configuration: lines[0].configuration, overrideChargeUnits: "3", overrideReason: "Negotiated fixture", discountPercent: 0 }] }, actor.id, db); quoteIds.push(overrideQuote.id); assert.equal(overrideQuote.revision.lines[0].overrideChargeUnitsSnapshot, "3"); assert.equal(overrideQuote.revision.lines[0].overrideReasonSnapshot, "Negotiated fixture"); assert.equal(overrideQuote.revision.lines[0].durationResolutionProvenanceSnapshot, "OVERRIDE_USED");
    const pdfQuote = await db.quote.findUniqueOrThrow({ where: { id: first.id }, include: { revisions: { include: { lines: true } } } }); const pdf = await renderToBuffer(createElement(QuotePdf, { quote: { ...pdfQuote, revision: pdfQuote.revisions[0] } }) as never); assert.ok(pdf.byteLength > 1000);
    const legacy = await db.quote.findFirst({ where: { revisions: { some: { lines: { some: { catalogueItemId: { not: null }, commercialOfferingId: null } } } } }, include: { revisions: { orderBy: { revisionNumber: "desc" }, take: 1, include: { lines: true } } } }); assert.ok(legacy); assert.equal(legacy!.revisions[0].lines[0].snapshotSchemaVersion, null); const legacyPdf = await renderToBuffer(createElement(QuotePdf, { quote: { ...legacy!, revision: legacy!.revisions[0] } }) as never); assert.ok(legacyPdf.byteLength > 1000);
    const current = await db.price.findFirstOrThrow({ where: { commercialOfferingId: platform.id, side: "TO_CLIENT", scopeType: "GLOBAL", marketId: null, active: true } });
    const market = await db.rateMarket.create({ data: { code: `P6-${suffix}`, cityName: "Phase 6 City", country: "India" } }); marketId = market.id; await db.price.create({ data: { commercialOfferingId: platform.id, side: "TO_CLIENT", scopeType: "CITY", marketId: market.id, amountPaise: current.amountPaise * 100 } });
    await changeCurrentRate({ actorId: actor.id, offeringId: platform.id, side: "TO_CLIENT", scopeType: "GLOBAL", marketId: null, expectedCurrentPriceId: current.id, amountPaise: current.amountPaise + 1000, reason: "Phase 6 immutability test" }, db);
    const full = await db.durationPolicy.findUniqueOrThrow({ where: { code: "FULL_USE_DAYS" } }); await assignDurationPolicy({ actorId: actor.id, offeringId: platform.id, policyId: full.id, reason: "Phase 6 future policy test" }, db); await db.commercialOffering.update({ where: { id: platform.id }, data: { name: "Renamed future platform" } });
    const historical = await db.quoteLine.findUniqueOrThrow({ where: { id: oldPlatform.id } }); assert.equal(historical.itemNameSnapshot, originalName); assert.equal(historical.rateUsedPaise, oldPlatform.rateUsedPaise); assert.equal(historical.durationPolicyCodeSnapshot, "HALF_USE_DAYS_MIN_1"); assert.equal(historical.finalAmountPaiseSnapshot, oldPlatform.finalAmountPaiseSnapshot);
    const second = await persistNormalizedQuote({ type: "CLIENT", company: "Phase 6 Future Fixture", eventDays: 4, taxPercentage: 0, lines: [{ commercialOfferingId: platform.id, configuration: lines[0].configuration, discountPercent: 0 }] }, actor.id, db); quoteIds.push(second.id); const future = second.revision.lines[0]; assert.equal(future.itemNameSnapshot, "Renamed future platform"); assert.equal(future.rateUsedPaise, current.amountPaise + 1000); assert.equal(future.durationPolicyCodeSnapshot, "FULL_USE_DAYS"); assert.equal(future.chargeUnitsSnapshot, "4");
  } finally {
    await db.generatedDocument.deleteMany({ where: { revision: { quoteId: { in: quoteIds } } } }); await db.quoteEvent.deleteMany({ where: { quoteId: { in: quoteIds } } }); await db.quoteLine.deleteMany({ where: { revision: { quoteId: { in: quoteIds } } } }); await db.quoteRevision.deleteMany({ where: { quoteId: { in: quoteIds } } }); await db.quote.deleteMany({ where: { id: { in: quoteIds } } });
    await db.priceAuditEvent.deleteMany({ where: { actorId: actor.id } }); await db.durationPolicyAssignmentAudit.deleteMany({ where: { actorId: actor.id } }); await db.price.deleteMany({ where: { commercialOfferingId: platform.id, id: { notIn: originalPrices.map((price) => price.id) } } }); for (const price of originalPrices) await db.price.update({ where: { id: price.id }, data: { active: price.active, effectiveFrom: price.effectiveFrom, effectiveTo: price.effectiveTo } }); await db.commercialOffering.update({ where: { id: platform.id }, data: { name: originalName, durationPolicyId: originalPolicyId } }); if (marketId) await db.rateMarket.delete({ where: { id: marketId } }); await db.user.delete({ where: { id: actor.id } }); await db.$disconnect();
  }
});
