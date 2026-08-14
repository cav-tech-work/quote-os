import assert from "node:assert/strict";
import test from "node:test";
import { classifyDurationCandidate } from "../lib/catalogue-semantic/review";
import { isOrdinaryQuoteReady } from "../lib/catalogue-semantic/readiness";

const offering = (name: string, domain: string, quantityBasis = "COUNT") => ({
  code: name.toUpperCase().replaceAll(" ", "_"), name, quantityBasis, kind: "ITEM", canonicalItem: { name, domain },
});

test("ordinary reviewed VC evidence proposes the approved half-use policy", () => {
  const result = classifyDurationCandidate(offering("Banquet Chair", "VC"), "Banquet Chair", "Y");
  assert.equal(result.reviewBucket, "ORDINARY_VC_RENTAL");
  assert.equal(result.candidate, "HALF_USE_DAYS_MIN_1");
  assert.equal(result.confidence, "HIGH");
});

test("known exceptions and OPS remain deferred while same-domain offerings can differ", () => {
  assert.equal(classifyDurationCandidate(offering("Vanity Van", "VC"), "Vanity Van", "Y").candidate, null);
  assert.equal(classifyDurationCandidate(offering("Banquet Chair", "VC"), "Banquet Chair", "Y").candidate, "HALF_USE_DAYS_MIN_1");
  const ops = classifyDurationCandidate(offering("Operations Radio", "OPS"), "Operations Radio", "Y");
  assert.equal(ops.reviewBucket, "OPS");
  assert.equal(ops.candidate, null);
});

test("CCTV shares policy through reviewed assignment, not domain routing", () => {
  const equipment = classifyDurationCandidate(offering("CCTV Camera", "OPS"), "CCTV Camera", "Y");
  assert.equal(equipment.reviewBucket, "CCTV");
  assert.equal(equipment.candidate, "HALF_USE_DAYS_MIN_1");
  const duty = classifyDurationCandidate(offering("CCTV Supervisor", "OPS", "HEADCOUNT_DUTY"), "CCTV Supervisor", "Y");
  assert.equal(duty.candidate, null);
});

test("ordinary readiness requires approved policy and excludes headcount", () => {
  const base = { quantityBasis: "COUNT", billingUnit: "NOS", kind: "ITEM", rates: { TO_CLIENT: {}, TO_VENDOR: {} } };
  const before = { ...base, durationPolicy: null };
  const after = { ...base, durationPolicy: { active: true, authority: "INTERNAL_APPROVED", mode: "USAGE_DAYS" } };
  assert.equal(isOrdinaryQuoteReady(before, "TO_CLIENT"), false);
  assert.equal(isOrdinaryQuoteReady(after, "TO_CLIENT"), true);
  assert.equal(isOrdinaryQuoteReady({ ...after, quantityBasis: "HEADCOUNT_DUTY" }, "TO_CLIENT"), false);
  assert.equal(isOrdinaryQuoteReady({ ...after, durationPolicy: { ...after.durationPolicy, authority: "EXTERNAL_REFERENCE" } }, "TO_CLIENT"), false);
});
