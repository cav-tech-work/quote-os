import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { createPackageVersion, PackageDefinitionError, previewPackageDefinition } from "../lib/package-admin";
import { calculatePackage, listReadyPackages, PackageCalculationError, packageLineSnapshot, resolvePackageComponentQuantity } from "../lib/package-engine";
import { persistNormalizedQuote } from "../lib/normalized-quotes";
import { createRevisionFromIssued, getRetainedDocument, issueRevision } from "../lib/quote-lifecycle";

test("bounded package quantity rules use exact arithmetic", () => {
  assert.equal(resolvePackageComponentQuantity("FIXED", "2.5", "3"), "2.5");
  assert.equal(resolvePackageComponentQuantity("FIXED_PER_PACKAGE", "2", "3"), "6");
  assert.equal(resolvePackageComponentQuantity("PARENT_QUANTITY_MULTIPLIER", "1.5", "2"), "3");
  assert.throws(() => resolvePackageComponentQuantity("FIXED", "0", "1"), /positive/);
});

test("package snapshot counts the package once and retains included composition", () => {
  const snapshot = packageLineSnapshot({ packageTemplateId: "pkg", packageCode: "DEV_PACKAGE", packageName: "Development package", packageVersion: 1, pricingMode: "COMPONENT_SUM", packageQuantity: "2", packageLevelCalculation: null, componentSubtotalPaise: 12500, packageLevelAmountPaise: 0, finalAmountPaise: 12500, componentResults: [{ sortOrder: 1, offering: { id: "one", code: "ONE", name: "One", quantityBasis: "COUNT" }, billingMode: "BILLABLE", quantityRuleType: "FIXED_PER_PACKAGE", quantityValue: "1", resolvedQuantity: "2", configuration: { quantity: "2" }, calculation: { priceId: "price", rateSide: "TO_CLIENT", unitRatePaise: 6250, billableQuantity: "2", chargeUnits: "1" }, policy: null, finalAmountPaise: 12500 }, { sortOrder: 2, offering: { id: "two", code: "TWO", name: "Two", quantityBasis: "COUNT" }, billingMode: "INCLUDED", quantityRuleType: "FIXED", quantityValue: "1", resolvedQuantity: "1", configuration: { quantity: "1" }, calculation: null, finalAmountPaise: 0 }] } as any, 0);
  assert.equal(snapshot.finalAmountPaiseSnapshot, 12500);
  assert.equal(snapshot.packageComponents.create.reduce((sum, item) => sum + item.finalAmountPaiseSnapshot, 0), 12500);
  assert.equal(snapshot.packageComponents.create[1].includedSnapshot, true);
});

const databaseUrl = process.env.PHASE10_TEST_DATABASE_URL;
test("package calculations, snapshots, versioning, revision clone and retained PDF are immutable", { skip: !databaseUrl }, async () => {
  const db = new PrismaClient({ datasourceUrl: databaseUrl! });
  try {
    await db.quoteEvent.deleteMany(); await db.generatedDocument.deleteMany(); await db.quotePackageComponentSnapshot.deleteMany(); await db.quoteLine.deleteMany(); await db.quoteRevision.deleteMany(); await db.quote.deleteMany();
    await db.packageComponent.deleteMany(); await db.packageTemplate.deleteMany(); await db.price.deleteMany(); await db.commercialOffering.deleteMany(); await db.durationPolicyPoint.deleteMany(); await db.durationPolicy.deleteMany(); await db.user.deleteMany(); await db.quoteNumberCounter.deleteMany();
    const user = await db.user.create({ data: { email: "phase10@quoteos.test", name: "Phase 10", role: "ADMIN" } });
    const oneOff = await db.durationPolicy.create({ data: { code: "P10_ONE_OFF", name: "One off", mode: "ONE_OFF", authority: "INTERNAL_APPROVED", chargeMultiplierNumerator: 1, chargeMultiplierDenominator: 1, minimumChargeNumerator: 1, minimumChargeDenominator: 1, roundingMode: "NONE" } });
    const ordinary = await db.commercialOffering.create({ data: { code: "P10_ORDINARY", name: "Fixture platform", kind: "ITEM", quantityBasis: "COUNT", pricingFamily: "ORDINARY", durationBasis: "ONE_OFF", durationPolicyId: oneOff.id, billingUnit: "NOS" } });
    const personnel = await db.commercialOffering.create({ data: { code: "P10_PERSONNEL", name: "Fixture technician", kind: "SERVICE", quantityBasis: "HEADCOUNT_DUTY", pricingFamily: "HEADCOUNT_DUTY", durationBasis: "DUTY", billingUnit: "DUTY" } });
    const included = await db.commercialOffering.create({ data: { code: "P10_INCLUDED", name: "Fixture operations note", kind: "SERVICE", quantityBasis: "FIXED", pricingFamily: "ORDINARY", durationBasis: "ONE_OFF", durationPolicyId: oneOff.id, billingUnit: "LUMPSUM" } });
    const parent = await db.commercialOffering.create({ data: { code: "P10_FIXED_PARENT", name: "Fixture fixed package", kind: "PACKAGE", quantityBasis: "COUNT", pricingFamily: "ORDINARY", durationBasis: "ONE_OFF", durationPolicyId: oneOff.id, billingUnit: "NOS" } });
    for (const [offeringId, side, amountPaise] of [[ordinary.id, "TO_CLIENT", 10000], [ordinary.id, "TO_VENDOR", 8000], [personnel.id, "TO_CLIENT", 5000], [personnel.id, "TO_VENDOR", 4000], [parent.id, "TO_CLIENT", 50000], [parent.id, "TO_VENDOR", 40000]] as const) await db.price.create({ data: { commercialOfferingId: offeringId, side, scopeType: "GLOBAL", amountPaise } });
    const sum = await createPackageVersion({ code: "P10_COMPONENT_SUM", name: "Controlled component fixture", version: 1, pricingMode: "COMPONENT_SUM", active: true, components: [{ commercialOfferingId: ordinary.id, quantityRuleType: "FIXED_PER_PACKAGE", quantityValue: "2", billingMode: "BILLABLE", sortOrder: 1 }, { commercialOfferingId: personnel.id, quantityRuleType: "PARENT_QUANTITY_MULTIPLIER", quantityValue: "1", billingMode: "BILLABLE", dutyUnitsPerPerson: "2", sortOrder: 2 }, { commercialOfferingId: included.id, quantityRuleType: "FIXED", quantityValue: "1", billingMode: "INCLUDED", sortOrder: 3 }] }, db);
    const calculated = await calculatePackage({ packageTemplateId: sum.id, packageQuantity: "2", side: "TO_CLIENT", usageDays: "1" }, db);
    assert.equal(calculated.componentResults[0].finalAmountPaise, 40000);
    assert.equal(calculated.componentResults[1].finalAmountPaise, 20000);
    assert.equal(calculated.componentResults[2].finalAmountPaise, 0);
    assert.equal(calculated.finalAmountPaise, 60000);
    assert.equal((await listReadyPackages("TO_CLIENT", "P10_", db)).length, 1);
    const fixed = await createPackageVersion({ code: "P10_FIXED", name: "Controlled fixed fixture", version: 1, pricingMode: "FIXED_PACKAGE", parentCommercialOfferingId: parent.id, active: true, components: [{ commercialOfferingId: included.id, quantityRuleType: "FIXED_PER_PACKAGE", quantityValue: "1", billingMode: "INCLUDED", sortOrder: 1 }] }, db);
    assert.equal((await calculatePackage({ packageTemplateId: fixed.id, packageQuantity: "2", side: "TO_CLIENT", usageDays: "1" }, db)).finalAmountPaise, 100000);
    await assert.rejects(() => createPackageVersion({ code: "P10_NESTED", name: "Nested", version: 1, pricingMode: "COMPONENT_SUM", components: [{ commercialOfferingId: parent.id, quantityRuleType: "FIXED", quantityValue: "1", billingMode: "BILLABLE", sortOrder: 1 }] }, db), PackageDefinitionError);
    const quote = await persistNormalizedQuote({ type: "CLIENT", company: "Fixture customer", taxPercentage: 0, eventDays: 1, lines: [], packages: [{ packageTemplateId: sum.id, packageQuantity: "2", discountPercent: 0 }] }, user.id, db as any);
    assert.equal(quote.revision.subtotalPaise, 60000); assert.equal(quote.revision.lines.length, 1); assert.equal(quote.revision.lines[0].packageComponents.length, 3);
    const issuedBytes = Buffer.from("%PDF-1.4\nphase-10-original");
    const issued = await issueRevision(quote.id, quote.revision.id, user.id, db, async () => issuedBytes); assert.equal(issued.document.byteSize, issuedBytes.length);
    await db.price.updateMany({ where: { commercialOfferingId: ordinary.id, side: "TO_CLIENT" }, data: { active: false } });
    await db.price.create({ data: { commercialOfferingId: ordinary.id, side: "TO_CLIENT", scopeType: "GLOBAL", amountPaise: 99999 } });
    await createPackageVersion({ code: "P10_COMPONENT_SUM", name: "Controlled component fixture v2", version: 2, pricingMode: "COMPONENT_SUM", active: true, components: [{ commercialOfferingId: ordinary.id, quantityRuleType: "FIXED_PER_PACKAGE", quantityValue: "3", billingMode: "BILLABLE", sortOrder: 1 }] }, db);
    const historical = await db.quoteRevision.findUniqueOrThrow({ where: { id: quote.revision.id }, include: { lines: { include: { packageComponents: true } } } });
    assert.equal(historical.subtotalPaise, 60000); assert.equal(historical.lines[0].packageVersionSnapshot, 1); assert.equal(historical.lines[0].packageComponents[0].unitRatePaiseSnapshot, 10000);
    assert.deepEqual((await getRetainedDocument(quote.id, quote.revision.id, db)).bytes, issuedBytes);
    const cloned = await createRevisionFromIssued(quote.id, quote.revision.id, user.id, db); const clonedLine = await db.quoteLine.findFirstOrThrow({ where: { revisionId: cloned.revision.id }, include: { packageComponents: true } });
    assert.equal(clonedLine.packageVersionSnapshot, 1); assert.equal(clonedLine.packageComponents.length, 3); assert.equal(clonedLine.finalAmountPaiseSnapshot, 60000);
  } finally { await db.$disconnect(); }
});

test("HYBRID calculation fails closed", async () => {
  const db = { packageTemplate: { findUnique: async () => ({ id: "x", active: true, authority: "INTERNAL_APPROVED", pricingMode: "HYBRID", components: [{}] }) } };
  await assert.rejects(() => calculatePackage({ packageTemplateId: "x", packageQuantity: "1", side: "TO_CLIENT" }, db), (error: unknown) => error instanceof PackageCalculationError && error.code === "PACKAGE_MODE_UNSUPPORTED");
});

test("draft package preview reports missing rates without creating a package", async () => {
  let creates = 0;
  const offering = { id: "cm123456789012345678901234", code: "PREVIEW_COMPONENT", name: "Preview component", active: true, kind: "ITEM", billingUnit: "NOS", quantityBasis: null, canonicalItem: { code: "PREVIEW_PARENT" }, durationPolicy: null };
  const db = {
    commercialOffering: { findMany: async () => [offering] },
    price: { findMany: async () => [] },
    packageTemplate: { create: async () => { creates += 1; } },
  };
  const preview = await previewPackageDefinition({ code: "PREVIEW_PACKAGE", name: "Preview package", version: 1, pricingMode: "COMPONENT_SUM", components: [{ commercialOfferingId: offering.id, quantityRuleType: "FIXED_PER_PACKAGE", quantityValue: "2", billingMode: "BILLABLE", sortOrder: 1 }] }, db);
  assert.equal(preview.rows[0].sides.TO_CLIENT.state, "RATE_MISSING");
  assert.equal(preview.rows[0].sides.TO_VENDOR.state, "RATE_MISSING");
  assert.equal(creates, 0);
});
