import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { createCatalogueElement, ElementInputError } from "../lib/element-admin";
import { inferMeasurement, normalizeElementCode, suggestElementCode, UNIT_OPTIONS, MEASUREMENT_OPTIONS, ELEMENT_KIND_OPTIONS } from "../lib/element-options";
import { searchSelectableComponents } from "../lib/component-search";
import { RESET_TABLES } from "../lib/catalogue-reset";

const ALL_UNIT_CODES = ["M", "FT", "SQ_M", "SQ_FT", "RFT", "CBM", "NOS", "DAY", "DUTY", "LITRE", "SET", "LUMPSUM"];

test("element vocabulary preserves the existing domain units and never guesses ambiguous measurements", () => {
  assert.deepEqual(UNIT_OPTIONS.map((option) => option.value).sort(), [...ALL_UNIT_CODES].sort());
  assert.equal(inferMeasurement("NOS"), "COUNT");
  assert.equal(inferMeasurement("SET"), "COUNT");
  assert.equal(inferMeasurement("LUMPSUM"), "FIXED");
  assert.equal(inferMeasurement("CBM"), "VOLUME");
  assert.equal(inferMeasurement("DUTY"), "HEADCOUNT_DUTY");
  // Ambiguous units must not be inferred; the operator chooses.
  assert.equal(inferMeasurement("SQ_M"), null);
  assert.equal(inferMeasurement("SQ_FT"), null);
  assert.equal(inferMeasurement("DAY"), null);
  assert.equal(inferMeasurement("LITRE"), null);
  // MANUAL and GENERATOR stay out of the picker because they are deferred.
  assert.deepEqual(MEASUREMENT_OPTIONS.map((option) => option.value), ["COUNT", "LINEAR", "AREA_LW", "AREA_LH", "VOLUME", "FIXED", "HEADCOUNT_DUTY"]);
  assert.equal(MEASUREMENT_OPTIONS.some((option) => option.value === "MANUAL"), false);
  assert.equal(MEASUREMENT_OPTIONS.some((option) => option.value === "GENERATOR"), false);
  assert.deepEqual(ELEMENT_KIND_OPTIONS.map((option) => option.value), ["ITEM", "SERVICE", "PACKAGE"]);
});

test("element codes normalize and reject unsupported characters", () => {
  assert.equal(normalizeElementCode("  chr bamboo ", "Element code"), "CHR_BAMBOO");
  assert.equal(suggestElementCode("Bamboo Chair (large)"), "BAMBOO_CHAIR_LARGE");
  for (const invalid of ["", "   ", "BAD-CODE", "CODE!", "_LEADING"]) {
    assert.throws(() => normalizeElementCode(invalid, "Element code"), ElementInputError, invalid);
  }
});

test("element creation validates required fields before touching the database", async () => {
  const base = { actorId: "actor", name: "Chair", code: "CHR_X", parentCode: "CHR_GROUP", parentName: "Seating", parentCategory: "VC" as const, billingUnit: "NOS" as const, measurement: "COUNT" as const };
  await assert.rejects(createCatalogueElement({ ...base, name: "  " }), ElementInputError);
  await assert.rejects(createCatalogueElement({ ...base, parentName: "" }), ElementInputError);
  await assert.rejects(createCatalogueElement({ ...base, parentCategory: "NOPE" as never }), ElementInputError);
  await assert.rejects(createCatalogueElement({ ...base, billingUnit: "NOPE" as never }), ElementInputError);
  await assert.rejects(createCatalogueElement({ ...base, measurement: "MANUAL" as never }), ElementInputError);
  await assert.rejects(createCatalogueElement({ ...base, kind: "NOPE" as never }), ElementInputError);
  await assert.rejects(createCatalogueElement({ ...base, toClientRupees: "not-money" }), ElementInputError);
});

const databaseUrl = process.env.ELEMENT_TEST_DATABASE_URL;

async function wipeCatalogue(db: PrismaClient) {
  // Reuses the guarded reset order, which also proves the order is FK-safe.
  const client = db as unknown as Record<string, { deleteMany: () => Promise<unknown> }>;
  for (const table of RESET_TABLES) await client[table].deleteMany();
}

test("manual element creation reuses parents, keeps blank rates price-free and audits supplied rates", { skip: !databaseUrl }, async () => {
  const db = new PrismaClient({ datasourceUrl: databaseUrl! });
  const suffix = Date.now().toString(36).toUpperCase().slice(-6);
  const parentCode = `CHR_GROUP_${suffix}`;
  const createdIds: string[] = [];
  let actorId = "";
  try {
    await wipeCatalogue(db);
    const actor = await db.user.create({ data: { email: `element-${suffix.toLowerCase()}@quoteos.test`, role: "ADMIN" } });
    actorId = actor.id;

    // 1. New parent + element, blank TO_CLIENT price.
    const blank = await createCatalogueElement({
      actorId, name: "Bamboo Chair", code: `CHR_BAMBOO_${suffix}`,
      parentCode, parentName: "Seating", parentCategory: "VC", billingUnit: "NOS", measurement: "COUNT", toClientRupees: "",
    }, db);
    createdIds.push(blank.offering.id);
    assert.equal(blank.parentCreated, true);
    assert.equal(blank.toClientAmountPaise, null);
    assert.equal(await db.price.count({ where: { commercialOfferingId: blank.offering.id } }), 0);
    const stored = await db.commercialOffering.findUniqueOrThrow({ where: { id: blank.offering.id } });
    assert.equal(stored.pricingFamily, "ORDINARY");
    assert.equal(stored.quantityBasis, "COUNT");
    assert.equal(stored.kind, "ITEM");
    assert.equal(stored.active, true);

    // 2. Reuse the same parent by Parent Code; never duplicate it.
    const reused = await createCatalogueElement({
      actorId, name: "Bamboo Chair XL", code: `CHR_BAMBOO_XL_${suffix}`,
      parentCode, parentName: "Seating", parentCategory: "VC", billingUnit: "NOS", measurement: "COUNT", toClientRupees: null,
    }, db);
    createdIds.push(reused.offering.id);
    assert.equal(reused.parentCreated, false);
    assert.equal(reused.parent.id, blank.parent.id);
    assert.equal(await db.canonicalItem.count({ where: { code: parentCode } }), 1);

    // 3. Explicit zero stays an explicit, audited zero rate.
    const zero = await createCatalogueElement({
      actorId, name: "Free Chair", code: `CHR_FREE_${suffix}`,
      parentCode, parentName: "Seating", parentCategory: "VC", billingUnit: "NOS", measurement: "COUNT", toClientRupees: "0",
    }, db);
    createdIds.push(zero.offering.id);
    const zeroPrice = await db.price.findFirstOrThrow({ where: { commercialOfferingId: zero.offering.id, side: "TO_CLIENT" } });
    assert.equal(zeroPrice.amountPaise, 0);
    assert.equal(zeroPrice.scopeType, "GLOBAL");
    assert.equal(zeroPrice.marketId, null);
    assert.equal(zeroPrice.currency, "INR");
    assert.equal(zeroPrice.active, true);
    const zeroAudit = await db.priceAuditEvent.findMany({ where: { commercialOfferingId: zero.offering.id } });
    assert.equal(zeroAudit.length, 1);
    assert.equal(zeroAudit[0].action, "CREATE");
    assert.equal(zeroAudit[0].actorId, actor.id);
    assert.equal(zeroAudit[0].newPriceId, zeroPrice.id);
    assert.equal(zeroAudit[0].oldPriceId, null);

    // 4. A supplied TO_CLIENT rate creates the normal audited GLOBAL price.
    const priced = await createCatalogueElement({
      actorId, name: "Priced Chair", code: `CHR_PRICED_${suffix}`,
      parentCode, parentName: "Seating", parentCategory: "VC", billingUnit: "NOS", measurement: "COUNT", toClientRupees: "1250.50",
    }, db);
    createdIds.push(priced.offering.id);
    assert.equal(priced.toClientAmountPaise, 125050);
    assert.equal((await db.price.findFirstOrThrow({ where: { commercialOfferingId: priced.offering.id, side: "TO_CLIENT" } })).amountPaise, 125050);

    // 5. Duplicate Element Code is rejected with a clear message.
    await assert.rejects(
      createCatalogueElement({ actorId, name: "Duplicate", code: `CHR_BAMBOO_${suffix}`, parentCode, parentName: "Seating", parentCategory: "VC", billingUnit: "NOS", measurement: "COUNT" }, db),
      (error: unknown) => error instanceof ElementInputError && /already exists/.test(error.message),
    );

    // 6. No vendor rate, no markup and no city price is ever derived.
    assert.equal(await db.price.count({ where: { commercialOfferingId: { in: createdIds }, side: "TO_VENDOR" } }), 0);
    assert.equal(await db.price.count({ where: { commercialOfferingId: { in: createdIds }, scopeType: "CITY" } }), 0);

    // 7. Rate-missing elements stay valid, searchable catalogue master data.
    for (const search of ["Bamboo Chair", `CHR_BAMBOO_${suffix}`, "Seating", parentCode]) {
      const results = await searchSelectableComponents({ search }, db);
      assert.equal(results.some((item) => item.elementCode === `CHR_BAMBOO_${suffix}`), true, search);
    }
    const rateMissing = (await searchSelectableComponents({ search: `CHR_BAMBOO_${suffix}` }, db))[0];
    assert.deepEqual(rateMissing.rates, {});
    assert.equal(rateMissing.parentCode, parentCode);

    // 8. A blank-rate element is still listed by the catalogue admin loader.
    const listed = await db.commercialOffering.findMany({ where: { id: blank.offering.id }, include: { prices: true } });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].prices.length, 0);
  } finally {
    await wipeCatalogue(db).catch(() => undefined);
    if (actorId) await db.user.delete({ where: { id: actorId } }).catch(() => undefined);
    await db.$disconnect();
  }
});
