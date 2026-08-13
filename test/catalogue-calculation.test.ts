import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient, type DurationBasis, type QuantityBasis, type UnitCode } from "@prisma/client";
import { calculateOfferingPricing, calculateOfferingWithRate, calculateBillableQuantity, convertUnit, ExactDecimal, resolveCurrentGlobalRate, UNIT_DIMENSIONS } from "../lib/catalogue-calculation/index";
import { changeCurrentRate, RateConflictError } from "../lib/catalogue-rates";

const offering = (quantityBasis: QuantityBasis | null, billingUnit: UnitCode | null, durationBasis: DurationBasis | null = "ONE_OFF") => ({ id: `fixture-${quantityBasis}`, code: `FIX_${quantityBasis}`, quantityBasis, billingUnit, durationBasis });
const found = (amountPaise = 100) => ({ state: "RATE_FOUND" as const, side: "TO_CLIENT" as const, scope: "GLOBAL" as const, priceId: "price-1", amountPaise });
const oneOff = { id: "one-off", code: "ONE_OFF", name: "One off", mode: "ONE_OFF" as const, chargeMultiplierNumerator: 1, chargeMultiplierDenominator: 1, minimumChargeNumerator: 1, minimumChargeDenominator: 1, roundingMode: "NONE" as const, active: true };

test("bounded unit model documents compatible dimensions and exact constants", () => {
  assert.equal(UNIT_DIMENSIONS.M, "LENGTH"); assert.equal(UNIT_DIMENSIONS.SQ_FT, "AREA"); assert.equal(UNIT_DIMENSIONS.RFT, "LINEAR_LENGTH");
  assert.equal(new ExactDecimal(381n, 1250n).toFixed(), "0.3048");
  const feet = convertUnit("1", "M", "FT"), metres = convertUnit("1", "FT", "M"), area = convertUnit("1", "SQ_M", "SQ_FT");
  assert.equal(feet.state === "CONVERTED" && feet.value.toFixed(), "3.280839895013"); assert.equal(metres.state === "CONVERTED" && metres.value.toFixed(), "0.3048"); assert.equal(area.state === "CONVERTED" && area.value.toFixed(), "10.76391041671");
  assert.equal(convertUnit("1", "NOS", "SQ_FT").state, "INCOMPATIBLE_UNIT");
});

test("COUNT and FIXED require whole non-negative quantities", () => {
  assert.equal(calculateBillableQuantity(offering("COUNT", "NOS"), { quantity: "20" }).state, "QUANTITY_CALCULATED");
  assert.equal(calculateBillableQuantity(offering("FIXED", "LUMPSUM"), { quantity: "2" }).state, "QUANTITY_CALCULATED");
  assert.equal(calculateBillableQuantity(offering("COUNT", "NOS"), { quantity: "1.5" }).state, "CONFIGURATION_INCOMPLETE");
  const negative = calculateBillableQuantity(offering("COUNT", "NOS"), { quantity: "-1" });
  assert.equal(negative.state, "CONFIGURATION_INCOMPLETE");
});

test("AREA_LW and AREA_LH use their distinct dimensions and convert without early rounding", () => {
  const platform = calculateBillableQuantity(offering("AREA_LW", "SQ_FT"), { quantity: "1", length: { value: "32", unit: "FT" }, width: { value: "20", unit: "FT" } });
  assert.equal(platform.state === "QUANTITY_CALCULATED" && platform.billableQuantity, "640");
  const metric = calculateBillableQuantity(offering("AREA_LW", "SQ_FT"), { quantity: "1", length: { value: "3", unit: "M" }, width: { value: "3", unit: "M" } });
  assert.equal(metric.state === "QUANTITY_CALCULATED" && metric.billableQuantity, "96.875193750388");
  const backdrop = calculateBillableQuantity(offering("AREA_LH", "SQ_M"), { quantity: "2", length: { value: "3", unit: "M" }, width: { value: "99", unit: "M" }, height: { value: "4", unit: "M" } });
  assert.equal(backdrop.state === "QUANTITY_CALCULATED" && backdrop.billableQuantity, "24");
});

test("LINEAR treats RFT as running feet and VOLUME converts dimensions before multiplying", () => {
  const railing = calculateBillableQuantity(offering("LINEAR", "RFT"), { quantity: "1", length: { value: "100", unit: "FT" } });
  assert.equal(railing.state === "QUANTITY_CALCULATED" && railing.billableQuantity, "100");
  const scaff = calculateBillableQuantity(offering("VOLUME", "CBM"), { quantity: "1", length: { value: "10", unit: "FT" }, width: { value: "10", unit: "FT" }, height: { value: "10", unit: "FT" } });
  assert.equal(scaff.state === "QUANTITY_CALCULATED" && scaff.billableQuantity, "28.316846592");
});

test("typed validation rejects missing, negative, incompatible, unknown, and deferred semantics", () => {
  const missing = calculateBillableQuantity(offering("AREA_LH", "SQ_FT"), { quantity: "1", length: { value: "2", unit: "M" } });
  assert.deepEqual(missing.state === "CONFIGURATION_INCOMPLETE" && missing.issues.map((value) => value.code), ["MISSING_HEIGHT"]);
  const negative = calculateBillableQuantity(offering("LINEAR", "RFT"), { quantity: "1", length: { value: "-2", unit: "M" } });
  assert.equal(negative.state === "CONFIGURATION_INCOMPLETE" && negative.issues[0].code, "NEGATIVE_DIMENSION");
  const incompatible = calculateBillableQuantity(offering("COUNT", "SQ_FT"), { quantity: "1" });
  assert.equal(incompatible.state === "CONFIGURATION_INCOMPLETE" && incompatible.issues[0].code, "INCOMPATIBLE_UNIT");
  assert.equal(calculateBillableQuantity(offering(null, "SQ_FT"), { quantity: "1" }).state, "CALCULATION_SEMANTICS_UNAVAILABLE");
  assert.equal(calculateBillableQuantity(offering("HEADCOUNT_DUTY", "DUTY"), { quantity: "1" }).state, "MANUAL_REQUIRED");
});

test("same inputs are byte-deterministic and monetary rounding happens once, half-up", () => {
  const input = { quantity: "1", length: { value: "1", unit: "M" as const }, width: { value: "1", unit: "M" as const } };
  const first = calculateOfferingWithRate(offering("AREA_LW", "SQ_FT"), input, "TO_CLIENT", found(1), oneOff);
  const second = calculateOfferingWithRate(offering("AREA_LW", "SQ_FT"), input, "TO_CLIENT", found(1), oneOff);
  assert.equal(JSON.stringify(first), JSON.stringify(second)); assert.equal(first.billableQuantity, "10.76391041671"); assert.equal(first.baseAmountPaise, 11);
});

test("rate states and duration boundary remain explicit", () => {
  const config = { quantity: "20" };
  assert.equal(calculateOfferingWithRate(offering("COUNT", "NOS"), config, "TO_CLIENT", { state: "RATE_UNAVAILABLE", side: "TO_CLIENT", scope: "GLOBAL" }).pricingState, "RATE_UNAVAILABLE");
  const zero = calculateOfferingWithRate(offering("COUNT", "NOS"), config, "TO_CLIENT", found(0), oneOff); assert.equal(zero.pricingState, "READY"); assert.equal(zero.baseAmountPaise, 0);
  const scheduled = calculateOfferingWithRate(offering("COUNT", "NOS", "VC_CHARGE_DAYS"), config, "TO_CLIENT", found(500)); assert.equal(scheduled.pricingState, "DURATION_POLICY_UNAVAILABLE"); assert.equal(scheduled.baseAmountPaise, 10000);
});

test("GLOBAL resolver detects unavailable, found, explicit zero, and defensive conflicts without CITY fallback", async () => {
  const makeDb = (rows: Array<{ id: string; amountPaise: number }>) => ({ price: { findMany: async (args: unknown) => { assert.match(JSON.stringify(args), /GLOBAL/); assert.match(JSON.stringify(args), /marketId/); return rows; } } });
  assert.equal((await resolveCurrentGlobalRate("x", "TO_CLIENT", makeDb([]) as never)).state, "RATE_UNAVAILABLE");
  const zero = await resolveCurrentGlobalRate("x", "TO_CLIENT", makeDb([{ id: "zero", amountPaise: 0 }]) as never); assert.equal(zero.state, "RATE_FOUND");
  assert.equal((await resolveCurrentGlobalRate("x", "TO_CLIENT", makeDb([{ id: "a", amountPaise: 1 }, { id: "b", amountPaise: 2 }]) as never)).state, "RATE_DATA_CONFLICT");
});

const databaseUrl = process.env.TEST_DATABASE_URL;
test("real catalogue and Phase 3 mutations share the normalized GLOBAL source of truth", { skip: !databaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } }); const suffix = Date.now().toString(36); let actorId = "", canonicalId = "", offeringId = "", marketId = "", batchId = "";
  try {
    const chair = await db.commercialOffering.findUnique({ where: { code: "CHR_BANQCHAI" } }); assert.equal(chair?.quantityBasis, "COUNT");
    const chairResult = chair && await calculateOfferingPricing({ offeringId: chair.id, side: "TO_CLIENT", configuration: { quantity: "20" } }, db); assert.equal(chairResult?.billableQuantity, "20"); assert.equal(chairResult?.pricingState, "DURATION_POLICY_UNAVAILABLE");
    const platform = await db.commercialOffering.findUnique({ where: { code: "PLAT_MAINGREY" } }); assert.equal(platform?.quantityBasis, null); const platformResult = platform && await calculateOfferingPricing({ offeringId: platform.id, side: "TO_CLIENT", configuration: { quantity: "1", length: { value: "32", unit: "FT" }, width: { value: "20", unit: "FT" } } }, db); assert.equal(platformResult?.pricingState, "CALCULATION_SEMANTICS_UNAVAILABLE");
    const railing = await db.commercialOffering.findUnique({ where: { code: "BAR_METARAIL" } }); const railResult = railing && await calculateOfferingPricing({ offeringId: railing.id, side: "TO_CLIENT", configuration: { quantity: "1", length: { value: "100", unit: "FT" } } }, db); assert.equal(railResult?.billableQuantity, "100");
    const scaff = await db.commercialOffering.findUnique({ where: { code: "SCAF_MAINPA" } }); const scaffResult = scaff && await calculateOfferingPricing({ offeringId: scaff.id, side: "TO_CLIENT", configuration: { quantity: "1", length: { value: "10", unit: "FT" }, width: { value: "10", unit: "FT" }, height: { value: "10", unit: "FT" } } }, db); assert.equal(scaffResult?.billableQuantity, "28.316846592");
    const clientOnly = await db.commercialOffering.findFirst({ where: { prices: { some: { side: "TO_CLIENT", scopeType: "GLOBAL", active: true }, none: { side: "TO_VENDOR", scopeType: "GLOBAL", active: true } } } }); assert.ok(clientOnly); assert.equal((await resolveCurrentGlobalRate(clientOnly!.id, "TO_CLIENT", db)).state, "RATE_FOUND"); assert.equal((await resolveCurrentGlobalRate(clientOnly!.id, "TO_VENDOR", db)).state, "RATE_UNAVAILABLE");
    const unpriced = await db.commercialOffering.findFirst({ where: { prices: { none: { scopeType: "GLOBAL", active: true } } } }); assert.ok(unpriced); assert.equal((await resolveCurrentGlobalRate(unpriced!.id, "TO_CLIENT", db)).state, "RATE_UNAVAILABLE"); assert.equal((await resolveCurrentGlobalRate(unpriced!.id, "TO_VENDOR", db)).state, "RATE_UNAVAILABLE");

    const actor = await db.user.create({ data: { email: `calc-${suffix}@clockwork-av.com`, role: "ADMIN" } }); actorId = actor.id;
    const canonical = await db.canonicalItem.create({ data: { code: `CALC-C-${suffix}`, name: "Calculation fixture", domain: "OTHER" } }); canonicalId = canonical.id;
    const fixture = await db.commercialOffering.create({ data: { code: `CALC-O-${suffix}`, name: "Calculation fixture", canonicalItemId: canonical.id, billingUnit: "NOS", quantityBasis: "COUNT", durationBasis: "ONE_OFF" } }); offeringId = fixture.id;
    const batch = await db.importBatch.create({ data: { sourceType: "ACTIVE_COMMERCIAL_MASTER", filename: "calculation-fixture.xlsx", fileHash: `calc-${suffix}`, status: "APPLIED" } }); batchId = batch.id;
    const imported = await db.price.create({ data: { commercialOfferingId: fixture.id, side: "TO_CLIENT", scopeType: "GLOBAL", amountPaise: 100, sourceImportId: batch.id, active: true } });
    assert.equal((await resolveCurrentGlobalRate(fixture.id, "TO_CLIENT", db)).state, "RATE_FOUND"); assert.equal((await resolveCurrentGlobalRate(fixture.id, "TO_VENDOR", db)).state, "RATE_UNAVAILABLE");
    const market = await db.rateMarket.create({ data: { code: `CC${suffix}`.slice(0, 30), cityName: "Calculation City" } }); marketId = market.id;
    await db.price.create({ data: { commercialOfferingId: fixture.id, side: "TO_VENDOR", scopeType: "CITY", marketId: market.id, amountPaise: 999, active: true } });
    assert.equal((await resolveCurrentGlobalRate(fixture.id, "TO_VENDOR", db)).state, "RATE_UNAVAILABLE");
    const mutate = async (input: Parameters<typeof changeCurrentRate>[0]) => { for (let attempt = 0; ; attempt++) try { return await changeCurrentRate(input, db); } catch (error) { if (!(error instanceof RateConflictError) || attempt === 2) throw error; } };
    const replacement = await mutate({ actorId, offeringId, side: "TO_CLIENT", scopeType: "GLOBAL", marketId: null, expectedCurrentPriceId: imported.id, amountPaise: 250, reason: "Phase 4 replacement" });
    const replaced = await resolveCurrentGlobalRate(fixture.id, "TO_CLIENT", db); assert.equal(replaced.state === "RATE_FOUND" && replaced.amountPaise, 250);
    await mutate({ actorId, offeringId, side: "TO_CLIENT", scopeType: "GLOBAL", marketId: null, expectedCurrentPriceId: replacement.price!.id, amountPaise: null, reason: "Phase 4 clear" }); assert.equal((await resolveCurrentGlobalRate(fixture.id, "TO_CLIENT", db)).state, "RATE_UNAVAILABLE");
    const zero = await mutate({ actorId, offeringId, side: "TO_CLIENT", scopeType: "GLOBAL", marketId: null, expectedCurrentPriceId: null, amountPaise: 0, reason: "Phase 4 zero" }); const zeroResolved = await resolveCurrentGlobalRate(fixture.id, "TO_CLIENT", db); assert.equal(zeroResolved.state === "RATE_FOUND" && zeroResolved.amountPaise, 0); assert.ok(zero.price);
  } finally {
    if (offeringId) { await db.priceAuditEvent.deleteMany({ where: { commercialOfferingId: offeringId } }); await db.price.deleteMany({ where: { commercialOfferingId: offeringId } }); await db.commercialOffering.delete({ where: { id: offeringId } }).catch(() => undefined); }
    if (batchId) await db.importBatch.delete({ where: { id: batchId } }).catch(() => undefined); if (canonicalId) await db.canonicalItem.delete({ where: { id: canonicalId } }).catch(() => undefined); if (marketId) await db.rateMarket.delete({ where: { id: marketId } }).catch(() => undefined); if (actorId) await db.user.delete({ where: { id: actorId } }).catch(() => undefined); await db.$disconnect();
  }
});
