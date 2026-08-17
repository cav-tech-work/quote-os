import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { PrismaClient } from "@prisma/client";
import { calculatePersonnelWithRate } from "../lib/catalogue-calculation/personnel";
import { changeCurrentRate } from "../lib/catalogue-rates";
import { calculateNormalizedLine, listNormalizedOfferings, persistNormalizedQuote } from "../lib/normalized-quotes";
import { QuotePdf } from "../lib/quote-pdf";

test("personnel arithmetic validates exact commercial inputs and ignores event duration", () => {
  const rate = { state: "RATE_FOUND" as const, priceId: "price", amountPaise: 150000, side: "TO_CLIENT" as const, scope: "GLOBAL" as const };
  for (const headcount of ["0", "-1", "1.5", "x"]) assert.equal(calculatePersonnelWithRate({ headcount, dutyUnitsPerPerson: "2" }, "TO_CLIENT", rate).issues[0].code, "INVALID_HEADCOUNT");
  for (const duties of ["0", "-1", "x"]) assert.equal(calculatePersonnelWithRate({ headcount: "5", dutyUnitsPerPerson: duties }, "TO_CLIENT", rate).issues[0].code, "INVALID_DUTY_UNITS");
  const result = calculatePersonnelWithRate({ headcount: "6", dutyUnitsPerPerson: "3" }, "TO_CLIENT", rate); assert.equal(result.billableQuantity, "18"); assert.equal(result.finalAmountPaise, 2700000);
  const fractional = calculatePersonnelWithRate({ headcount: "5", dutyUnitsPerPerson: "0.5" }, "TO_CLIENT", rate); assert.equal(fractional.billableQuantity, "2.5"); assert.equal(fractional.finalAmountPaise, 375000);
  const zero = calculatePersonnelWithRate({ headcount: "2", dutyUnitsPerPerson: "3" }, "TO_CLIENT", { ...rate, amountPaise: 0 }); assert.equal(zero.pricingState, "READY"); assert.equal(zero.finalAmountPaise, 0);
});

test("normalized client and vendor APIs preserve the established quote-user authorization", () => {
  for (const file of ["app/api/normalized-offerings/route.ts", "app/api/quotes/route.ts"]) {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    assert.match(source, /requireRole\("ADMIN", "QUOTE_USER"\)/);
  }
});

const databaseUrl = process.env.PHASE7_TEST_DATABASE_URL;
test("approved personnel is side-safe, immutable, mixed-revision and PDF compatible", { skip: !databaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } }); const stamp = Date.now(); const quoteIds: string[] = [];
  const actor = await db.user.create({ data: { email: `phase7-${stamp}@clockwork-av.com`, role: "ADMIN" } });
  const person = await db.commercialOffering.findUniqueOrThrow({ where: { code: "SEC_MALEGUAR" }, include: { prices: true } }); const originalName = person.name; const originalPolicyId = person.durationPolicyId; const originalPrices = person.prices.map((price) => ({ ...price })); let marketId: string | null = null;
  try {
    const client = await listNormalizedOfferings("TO_CLIENT", "", db); const vendor = await listNormalizedOfferings("TO_VENDOR", "", db);
    assert.equal(client.filter((x) => x.pricingFamily === "HEADCOUNT_DUTY").length, 23); assert.equal(vendor.filter((x) => x.pricingFamily === "HEADCOUNT_DUTY").length, 22);
    const clientOnly = await db.commercialOffering.findUniqueOrThrow({ where: { code: "NET_INTESUPE" } }); await assert.rejects(calculateNormalizedLine({ commercialOfferingId: clientOnly.id, configuration: { headcount: "1", dutyUnitsPerPerson: "1" } }, "TO_VENDOR", db), (error: unknown) => error instanceof Error && "code" in error && error.code === "PERSONNEL_RATE_UNAVAILABLE");
    const accidentalPolicy = await db.durationPolicy.findUniqueOrThrow({ where: { code: "ONE_OFF" } }); await db.commercialOffering.update({ where: { id: person.id }, data: { durationPolicyId: accidentalPolicy.id } });
    const preview = await calculateNormalizedLine({ commercialOfferingId: person.id, configuration: { headcount: "5", dutyUnitsPerPerson: "2" } }, "TO_CLIENT", db); assert.equal(preview.calculation.billableQuantity, "10"); assert.equal(preview.calculation.chargeUnits, null); assert.equal(preview.policy, null);
    const platform = await db.commercialOffering.findUniqueOrThrow({ where: { code: "PLAT_MAINGREY" } }); const carpet = await db.commercialOffering.findUniqueOrThrow({ where: { code: "CARP_ITEM" } }); const medic = await db.commercialOffering.findUniqueOrThrow({ where: { code: "MED_ATTE" } });
    const mixed = await persistNormalizedQuote({ type: "CLIENT", company: "Phase 7 Mixed", eventDays: 4, taxPercentage: 0, lines: [
      { commercialOfferingId: platform.id, configuration: { quantity: "1", length: { value: "10", unit: "FT" }, width: { value: "10", unit: "FT" } }, discountPercent: 0 },
      { commercialOfferingId: carpet.id, configuration: { quantity: "1", length: { value: "10", unit: "FT" }, width: { value: "10", unit: "FT" } }, discountPercent: 0 },
      { commercialOfferingId: person.id, configuration: { headcount: "5", dutyUnitsPerPerson: "2" }, discountPercent: 0 },
      { commercialOfferingId: medic.id, configuration: { headcount: "2", dutyUnitsPerPerson: "1" }, discountPercent: 0 },
    ] }, actor.id, db); quoteIds.push(mixed.id);
    const personnelLines = mixed.revision.lines.filter((line) => line.pricingFamilySnapshot === "HEADCOUNT_DUTY"); assert.equal(personnelLines.length, 2); const personnel = personnelLines.find((line) => line.itemCodeSnapshot === "SEC_MALEGUAR")!; assert.equal(personnel.headcountSnapshot, 5); assert.equal(personnel.dutyUnitsPerPersonSnapshot, "2"); assert.equal(personnel.billableQuantitySnapshot, "10"); assert.equal(personnel.durationPolicyIdSnapshot, null); assert.equal(mixed.revision.subtotalPaise, mixed.revision.lines.reduce((sum, line) => sum + line.finalAmountPaiseSnapshot!, 0));
    const oldRate = await db.price.findFirstOrThrow({ where: { commercialOfferingId: person.id, side: "TO_CLIENT", scopeType: "GLOBAL", marketId: null, active: true } }); const oldAmount = personnel.finalAmountPaiseSnapshot;
    const market = await db.rateMarket.create({ data: { code: `P7-${stamp}`, cityName: "Ignored City" } }); marketId = market.id; await db.price.create({ data: { commercialOfferingId: person.id, side: "TO_CLIENT", scopeType: "CITY", marketId, amountPaise: oldRate.amountPaise * 100 } });
    await changeCurrentRate({ actorId: actor.id, offeringId: person.id, side: "TO_CLIENT", scopeType: "GLOBAL", marketId: null, expectedCurrentPriceId: oldRate.id, amountPaise: oldRate.amountPaise + 20000, reason: "Phase 7 immutability" }, db); await db.commercialOffering.update({ where: { id: person.id }, data: { name: "Future guard name" } });
    const historical = await db.quoteLine.findUniqueOrThrow({ where: { id: personnel.id } }); assert.equal(historical.itemNameSnapshot, originalName); assert.equal(historical.finalAmountPaiseSnapshot, oldAmount);
    const next = await persistNormalizedQuote({ type: "CLIENT", company: "Phase 7 New", eventDays: 99, taxPercentage: 0, lines: [{ commercialOfferingId: person.id, configuration: { headcount: "5", dutyUnitsPerPerson: "2" }, discountPercent: 0 }] }, actor.id, db); quoteIds.push(next.id); assert.equal(next.revision.lines[0].finalAmountPaiseSnapshot, oldAmount! + 200000); assert.equal(next.revision.lines[0].billableQuantitySnapshot, "10");
    const pdfQuote = await db.quote.findUniqueOrThrow({ where: { id: mixed.id }, include: { revisions: { include: { lines: true } } } }); const pdf = await renderToBuffer(createElement(QuotePdf, { quote: { ...pdfQuote, revision: pdfQuote.revisions[0] } }) as never); assert.ok(pdf.byteLength > 1000);
  } finally {
    await db.quoteEvent.deleteMany({ where: { quoteId: { in: quoteIds } } }); await db.quoteLine.deleteMany({ where: { revision: { quoteId: { in: quoteIds } } } }); await db.quoteRevision.deleteMany({ where: { quoteId: { in: quoteIds } } }); await db.quote.deleteMany({ where: { id: { in: quoteIds } } }); await db.priceAuditEvent.deleteMany({ where: { actorId: actor.id } }); await db.price.deleteMany({ where: { commercialOfferingId: person.id, id: { notIn: originalPrices.map((p) => p.id) } } }); for (const price of originalPrices) await db.price.update({ where: { id: price.id }, data: { active: price.active, effectiveFrom: price.effectiveFrom, effectiveTo: price.effectiveTo } }); await db.commercialOffering.update({ where: { id: person.id }, data: { name: originalName, durationPolicyId: originalPolicyId } }); if (marketId) await db.rateMarket.delete({ where: { id: marketId } }); await db.user.delete({ where: { id: actor.id } }); await db.$disconnect();
  }
});
