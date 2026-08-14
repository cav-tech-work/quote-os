import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { calculateOfferingPricing, calculateOfferingWithRate, resolveChargeUnits } from "../lib/catalogue-calculation/index";
import { assignDurationPolicy, DurationPolicyInputError } from "../lib/duration-policies";

const policy = (mode: "ONE_OFF" | "USAGE_DAYS" | "CURVE" | "MANUAL", roundingMode: "NONE" | "CEIL" | "FLOOR" | "HALF_UP" = "NONE") => ({ id: `${mode}-${roundingMode}`, code: `${mode}_${roundingMode}`, name: mode, mode, chargeMultiplierNumerator: 1, chargeMultiplierDenominator: mode === "USAGE_DAYS" ? 2 : 1, minimumChargeNumerator: mode === "USAGE_DAYS" ? 1 : 0, minimumChargeDenominator: 1, roundingMode, active: true, authority: "INTERNAL_APPROVED" as const, points: mode === "CURVE" ? [
  { usageDays: 1, chargeUnitsNumerator: 1, chargeUnitsDenominator: 1 },
  { usageDays: 2, chargeUnitsNumerator: 1, chargeUnitsDenominator: 1 },
  { usageDays: 3, chargeUnitsNumerator: 1, chargeUnitsDenominator: 1 },
  { usageDays: 4, chargeUnitsNumerator: 3, chargeUnitsDenominator: 2 },
  { usageDays: 5, chargeUnitsNumerator: 2, chargeUnitsDenominator: 1 },
] : [] });
const charge = (result: ReturnType<typeof resolveChargeUnits>) => result.state === "CHARGE_UNITS_RESOLVED" ? result.chargeUnits : result.state;

test("ONE_OFF ignores usage duration and FULL_USE_DAYS follows usage", () => {
  assert.equal(charge(resolveChargeUnits(policy("ONE_OFF"), { usageDays: "5" })), "1");
  const full = { ...policy("USAGE_DAYS"), chargeMultiplierDenominator: 1 };
  assert.equal(charge(resolveChargeUnits(full, { usageDays: "4" })), "4");
});

test("half-use minimum one retains exact fractional units without implicit rounding", () => {
  const results = ["1", "2", "3", "4"].map((usageDays) => resolveChargeUnits(policy("USAGE_DAYS"), { usageDays }));
  assert.deepEqual(results.map((result) => result.state === "CHARGE_UNITS_RESOLVED" && result.chargeUnits), ["1", "1", "1.5", "2"]);
  assert.equal(charge(resolveChargeUnits(policy("USAGE_DAYS", "CEIL"), { usageDays: "3" })), "2");
  assert.equal(charge(resolveChargeUnits(policy("USAGE_DAYS", "FLOOR"), { usageDays: "3" })), "1");
  assert.equal(charge(resolveChargeUnits(policy("USAGE_DAYS", "HALF_UP"), { usageDays: "3" })), "2");
});

test("manual requires explicit exact charge units", () => {
  assert.equal(resolveChargeUnits(policy("MANUAL"), {}).state, "MANUAL_DURATION_REQUIRED");
  const result = resolveChargeUnits(policy("MANUAL"), { manualChargeUnits: "2.5" }); assert.equal(result.state === "CHARGE_UNITS_RESOLVED" && result.chargeUnits, "2.5");
});

test("CURVE uses exact configured points, never interpolates or extrapolates", () => {
  const curve = policy("CURVE");
  assert.deepEqual(["1", "2", "3", "4", "5"].map((usageDays) => charge(resolveChargeUnits(curve, { usageDays }))), ["1", "1", "1", "1.5", "2"]);
  assert.equal(resolveChargeUnits(curve, { usageDays: "6" }).state, "DURATION_CURVE_VALUE_UNAVAILABLE");
  assert.equal(resolveChargeUnits(curve, { usageDays: "4.5" }).state, "DURATION_CURVE_VALUE_UNAVAILABLE");
});

test("explicit charge-unit override beats a curve and records provenance", () => {
  const curve = policy("CURVE");
  const normal = resolveChargeUnits(curve, { usageDays: "4" });
  const overridden = resolveChargeUnits(curve, { usageDays: "4", overrideChargeUnits: "2" });
  assert.equal(normal.state === "CHARGE_UNITS_RESOLVED" && normal.chargeUnits, "1.5");
  assert.equal(normal.state === "CHARGE_UNITS_RESOLVED" && normal.provenance, "POLICY_RESOLVED");
  assert.equal(overridden.state === "CHARGE_UNITS_RESOLVED" && overridden.chargeUnits, "2");
  assert.equal(overridden.state === "CHARGE_UNITS_RESOLVED" && overridden.provenance, "OVERRIDE_USED");
  assert.equal(curve.points[3].chargeUnitsNumerator, 3);
});

test("final amount multiplies exact charge units and rounds paise once", () => {
  const offering = { id: "x", code: "X", quantityBasis: "COUNT" as const, durationBasis: "VC_CHARGE_DAYS" as const, billingUnit: "NOS" as const };
  const rate = { state: "RATE_FOUND" as const, side: "TO_CLIENT" as const, scope: "GLOBAL" as const, priceId: "p", amountPaise: 900000 };
  const result = calculateOfferingWithRate(offering, { quantity: "1" }, "TO_CLIENT", rate, policy("USAGE_DAYS"), { usageDays: "3" }); assert.equal(result.baseAmountPaise, 900000); assert.equal(result.chargeUnits, "1.5"); assert.equal(result.finalAmountPaise, 1350000); assert.equal(result.pricingState, "READY");
  const halfPaise = calculateOfferingWithRate(offering, { quantity: "1" }, "TO_CLIENT", { ...rate, amountPaise: 1 }, policy("USAGE_DAYS"), { usageDays: "3" }); assert.equal(halfPaise.finalAmountPaise, 2);
  const volume = { id: "v", code: "V", quantityBasis: "VOLUME" as const, durationBasis: "VC_CHARGE_DAYS" as const, billingUnit: "CBM" as const };
  const fractional = calculateOfferingWithRate(volume, { quantity: "1", length: { value: "10", unit: "FT" }, width: { value: "10", unit: "FT" }, height: { value: "10", unit: "FT" } }, "TO_CLIENT", { ...rate, amountPaise: 20000 }, policy("USAGE_DAYS"), { usageDays: "3" });
  assert.equal(fractional.baseAmountPaise, 566337);
  assert.equal(fractional.finalAmountPaise, 849505);
});

const databaseUrl = process.env.TEST_DATABASE_URL;
test("policy assignment is audited, version-safe, and drives real COUNT/LINEAR/VOLUME calculations", { skip: !databaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } }); const actor = await db.user.create({ data: { email: `duration-${Date.now()}@clockwork-av.com`, role: "ADMIN" } }); const assignments: Array<{ id: string; old: string | null }> = [];
  try {
    const half = await db.durationPolicy.findUniqueOrThrow({ where: { code: "HALF_USE_DAYS_MIN_1" } }); const full = await db.durationPolicy.findUniqueOrThrow({ where: { code: "FULL_USE_DAYS" } });
    for (const [code, configuration] of [["CHR_BANQCHAI", { quantity: "20" }], ["BAR_METARAIL", { quantity: "1", length: { value: "100", unit: "FT" } }], ["SCAF_MAINPA", { quantity: "1", length: { value: "10", unit: "FT" }, width: { value: "10", unit: "FT" }, height: { value: "10", unit: "FT" } }]] as const) {
      const offering = await db.commercialOffering.findUniqueOrThrow({ where: { code } }); assignments.push({ id: offering.id, old: offering.durationPolicyId }); await assignDurationPolicy({ actorId: actor.id, offeringId: offering.id, policyId: half.id, reason: "Phase 5 database test" }, db); const result = await calculateOfferingPricing({ offeringId: offering.id, side: "TO_CLIENT", configuration, duration: { usageDays: "3" } }, db); assert.equal(result?.pricingState, "READY"); assert.equal(result?.chargeUnits, "1.5");
    }
    const first = assignments[0]; await assignDurationPolicy({ actorId: actor.id, offeringId: first.id, policyId: full.id, reason: "Phase 5 policy change" }, db); const changed = await calculateOfferingPricing({ offeringId: first.id, side: "TO_CLIENT", configuration: { quantity: "20" }, duration: { usageDays: "3" } }, db); assert.equal(changed?.chargeUnits, "3"); assert.equal(await db.durationPolicyAssignmentAudit.count({ where: { actorId: actor.id } }), 4);
    await db.durationPolicy.update({ where: { id: half.id }, data: { active: false } }); await assert.rejects(assignDurationPolicy({ actorId: actor.id, offeringId: first.id, policyId: half.id, reason: "Must reject" }, db), DurationPolicyInputError); await db.durationPolicy.update({ where: { id: half.id }, data: { active: true } });
  } finally { for (const item of assignments) await db.commercialOffering.update({ where: { id: item.id }, data: { durationPolicyId: item.old } }); await db.durationPolicyAssignmentAudit.deleteMany({ where: { actorId: actor.id } }); await db.user.delete({ where: { id: actor.id } }); await db.$disconnect(); }
});
