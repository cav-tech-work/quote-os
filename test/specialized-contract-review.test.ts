import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { semanticApply } from "../lib/catalogue-semantic/apply";
import type { SemanticDecisionFile } from "../lib/catalogue-semantic/types";
import { listNormalizedOfferings } from "../lib/normalized-quotes";

const decisions = JSON.parse(readFileSync("catalogue-specialized-contract-decisions.json", "utf8")) as SemanticDecisionFile;
const expected = ["CCTV_CABL", "CREW_FOOD", "FIRE_TEND", "HK_BIOWDUMP", "HK_DUMP", "HK_DUMPTRUC", "HK_HOUSMATE", "HK_PESTCONT", "HK_POSTCLEA", "MED_ALSIAMBU", "MED_BLSAMBU", "MED_FIRSAID", "NET_FIBECABL", "SEC_QUICRESP", "WC_DRAI", "WC_TOILCONS", "WTR_WATETANK2"];

test("all 17 specialized contracts are explicitly deferred without inventing units or families", () => {
  assert.deepEqual(Object.keys(decisions.decisions).sort(), expected.slice().sort());
  for (const row of Object.values(decisions.decisions)) {
    assert.equal(row.quantityBasis?.decision, "DEFER"); assert.equal(row.pricingFamily?.decision, "DEFER"); assert.equal(row.billingUnit?.decision, "DEFER"); assert.equal(row.durationPolicy?.decision, "DEFER");
    assert.ok(row.quantityBasis.reason && row.pricingFamily.evidence && row.billingUnit.evidence && row.durationPolicy.evidence);
  }
  const schema = readFileSync("prisma/schema.prisma", "utf8"); assert.match(schema, /enum PricingFamily \{\s+ORDINARY\s+HEADCOUNT_DUTY\s+\}/); assert.doesNotMatch(schema, /\b(TRIP|MEAL|VISIT|LOAD|REFILL)\b/);
});

const databaseUrl = process.env.PHASE9_TEST_DATABASE_URL;
test("guarded all-defer review is idempotent, stale-safe and readiness-neutral", { skip: !databaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const result = await semanticApply(db, decisions, { execute: true, actorEmail: "phase2@example.local" }); assert.equal(result.result, "ALREADY_APPLIED"); assert.equal(result.changes.length, 0);
    assert.equal(await db.catalogueSemanticAudit.count({ where: { decisionSetHash: result.decisionSetHash } }), 0); assert.equal(await db.catalogueSemanticApply.count({ where: { decisionSetHash: result.decisionSetHash } }), 1);
    const rows = await db.commercialOffering.findMany({ where: { code: { in: expected } }, select: { code: true, quantityBasis: true, pricingFamily: true, billingUnit: true, durationPolicyId: true } }); assert.equal(rows.length, 17); assert.ok(rows.every((row) => row.quantityBasis === "HEADCOUNT_DUTY" && row.pricingFamily === null && row.billingUnit === "DUTY" && row.durationPolicyId === null));
    const client = await listNormalizedOfferings("TO_CLIENT", "", db); const vendor = await listNormalizedOfferings("TO_VENDOR", "", db); assert.deepEqual([client.length, vendor.length], [164, 153]); assert.ok(expected.every((code) => !client.some((row) => row.code === code) && !vendor.some((row) => row.code === code)));
    await assert.rejects(semanticApply(db, { ...decisions, catalogueFingerprint: "stale" }, { execute: false, actorEmail: "" }), /STALE_SEMANTIC_DECISIONS/);
  } finally { await db.$disconnect(); }
});
