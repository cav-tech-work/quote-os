import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { calculateNormalizedLine, listNormalizedOfferings } from "../lib/normalized-quotes";
import { nosDutySemanticApply, type NosDutyDecisionFile } from "../lib/catalogue-semantic/nos-duty-apply";

const decisions = JSON.parse(readFileSync("catalogue-nos-duty-decisions.json", "utf8")) as NosDutyDecisionFile;
const rows = Object.entries(decisions.decisions);

test("all 39 nos/duty rows are explicitly reviewed without inferring personnel", () => {
  assert.equal(rows.length, 39);
  assert.equal(rows.filter(([, row]) => row.quantityBasis.decision === "APPROVE" && row.quantityBasis.value === "COUNT").length, 22);
  assert.equal(rows.filter(([, row]) => row.pricingFamily.value === "HEADCOUNT_DUTY").length, 0);
  assert.equal(rows.filter(([, row]) => row.reviewBucket.includes("SECURITY") && row.durationPolicy.decision === "APPROVE").length, 0);
  assert.equal(rows.filter(([, row]) => row.reviewBucket === "OPS_EQUIPMENT" && row.durationPolicy.decision === "APPROVE").length, 0);
  assert.equal(rows.filter(([, row]) => row.reviewBucket.includes("COMPOSITE") && row.quantityBasis.decision !== "DEFER").length, 0);
  assert.equal(rows.filter(([, row]) => row.reviewBucket === "CCTV_EQUIPMENT" && row.durationPolicy.value === "ONE_OFF").length, 2);
});

const databaseUrl = process.env.PHASE75_TEST_DATABASE_URL;
test("guarded correction is audited, idempotent, side-safe and calculation-ready", { skip: !databaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const reapplied = await nosDutySemanticApply(db, decisions, { execute: true, actorEmail: "phase2@example.local" });
    assert.equal(reapplied.result, "ALREADY_APPLIED");
    const audits = await db.catalogueSemanticAudit.groupBy({ by: ["field"], where: { decisionSetHash: reapplied.decisionSetHash }, _count: true });
    assert.deepEqual(Object.fromEntries(audits.map((row) => [row.field, row._count])), { billingUnit: 22, pricingFamily: 22, quantityBasis: 22 });
    const client = await listNormalizedOfferings("TO_CLIENT", "", db);
    const vendor = await listNormalizedOfferings("TO_VENDOR", "", db);
    assert.deepEqual([client.length, vendor.length], [152, 142]);
    assert.deepEqual([client.filter((x) => x.pricingFamily === "HEADCOUNT_DUTY").length, vendor.filter((x) => x.pricingFamily === "HEADCOUNT_DUTY").length], [23, 22]);
    const camera = await db.commercialOffering.findUniqueOrThrow({ where: { code: "CCTV_CAME" } });
    const calculation = await calculateNormalizedLine({ commercialOfferingId: camera.id, configuration: { quantity: "2" }, usageDays: "5" }, "TO_CLIENT", db);
    assert.equal(calculation.calculation.finalAmountPaise, 1_200_000);
    const fire = await db.commercialOffering.findUniqueOrThrow({ where: { code: "FIRE_EXTIABC" } });
    await assert.rejects(calculateNormalizedLine({ commercialOfferingId: fire.id, configuration: { quantity: "1" }, usageDays: "2" }, "TO_CLIENT", db), (error: unknown) => error instanceof Error && "code" in error && error.code === "DURATION_POLICY_UNAVAILABLE");
    await assert.rejects(nosDutySemanticApply(db, { ...decisions, catalogueFingerprint: "stale" }, { execute: true, actorEmail: "phase2@example.local" }), /STALE_NOS_DUTY_DECISIONS/);
  } finally {
    await db.$disconnect();
  }
});
