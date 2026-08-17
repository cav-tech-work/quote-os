import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { semanticApply } from "../lib/catalogue-semantic/apply";
import type { SemanticDecisionFile } from "../lib/catalogue-semantic/types";
import { assignDurationPolicy } from "../lib/duration-policies";
import { calculateNormalizedLine, listNormalizedOfferings, persistNormalizedQuote } from "../lib/normalized-quotes";

const decisions = JSON.parse(readFileSync("catalogue-full-use-decisions.json", "utf8")) as SemanticDecisionFile;
const deferred = ["CCTV_CABL", "CREW_FOOD", "FIRE_TEND", "HK_BIOWDUMP", "HK_DUMP", "HK_DUMPTRUC", "HK_HOUSMATE", "HK_PESTCONT", "HK_POSTCLEA", "MED_ALSIAMBU", "MED_BLSAMBU", "MED_FIRSAID", "NET_FIBECABL", "SEC_QUICRESP", "WC_DRAI", "WC_TOILCONS", "WTR_WATETANK2"];

test("the exact reviewed equipment population explicitly approves FULL_USE_DAYS", () => {
  const rows = Object.values(decisions.decisions);
  assert.equal(rows.length, 17);
  assert.ok(rows.every((row) => row.durationPolicy?.decision === "APPROVE" && row.durationPolicy.value === "FULL_USE_DAYS" && row.durationPolicy.evidence));
  assert.ok(deferred.every((code) => !(code in decisions.decisions)));
});

const databaseUrl = process.env.PHASE76_TEST_DATABASE_URL;
test("full-use assignments are guarded, independent, snapshot-safe and side-safe", { skip: !databaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const stamp = Date.now();
  const actor = await db.user.create({ data: { email: `phase76-${stamp}@clockwork-av.com`, role: "ADMIN" } });
  const quoteIds: string[] = [];
  const fire = await db.commercialOffering.findUniqueOrThrow({ where: { code: "FIRE_EXTIABC" } });
  const originalPolicyId = fire.durationPolicyId;
  try {
    const reapplied = await semanticApply(db, decisions, { execute: true, actorEmail: "phase2@example.local" });
    assert.equal(reapplied.result, "ALREADY_APPLIED");
    assert.equal(await db.catalogueSemanticAudit.count({ where: { decisionSetHash: reapplied.decisionSetHash } }), 17);
    assert.equal(await db.durationPolicyAssignmentAudit.count({ where: { commercialOffering: { catalogueSemanticAudits: { some: { decisionSetHash: reapplied.decisionSetHash } } } } }), 17);

    const client = await listNormalizedOfferings("TO_CLIENT", "", db);
    const vendor = await listNormalizedOfferings("TO_VENDOR", "", db);
    assert.deepEqual([client.length, vendor.length], [164, 153]);
    assert.ok(deferred.every((code) => !client.some((item) => item.code === code) && !vendor.some((item) => item.code === code)));

    const platform = await db.commercialOffering.findUniqueOrThrow({ where: { code: "PLAT_MAINGREY" } });
    const camera = await db.commercialOffering.findUniqueOrThrow({ where: { code: "CCTV_CAME" } });
    const person = await db.commercialOffering.findUniqueOrThrow({ where: { code: "SEC_MALEGUAR" } });
    const half = await calculateNormalizedLine({ commercialOfferingId: platform.id, configuration: { quantity: "1", length: { value: "10", unit: "FT" }, width: { value: "10", unit: "FT" } }, usageDays: "4" }, "TO_CLIENT", db);
    const full = await calculateNormalizedLine({ commercialOfferingId: fire.id, configuration: { quantity: "2" }, usageDays: "4" }, "TO_CLIENT", db);
    const oneOff = await calculateNormalizedLine({ commercialOfferingId: camera.id, configuration: { quantity: "2" }, usageDays: "4" }, "TO_CLIENT", db);
    const personnel = await calculateNormalizedLine({ commercialOfferingId: person.id, configuration: { headcount: "2", dutyUnitsPerPerson: "4" } }, "TO_CLIENT", db);
    assert.deepEqual([half.calculation.chargeUnits, full.calculation.chargeUnits, oneOff.calculation.chargeUnits, personnel.calculation.chargeUnits], ["2", "4", "1", null]);

    const quote = await persistNormalizedQuote({ type: "CLIENT", company: "Phase 7.6 snapshot", eventDays: 4, taxPercentage: 0, lines: [{ commercialOfferingId: fire.id, configuration: { quantity: "2" }, usageDays: "2", discountPercent: 0 }] }, actor.id, db);
    quoteIds.push(quote.id);
    const oldLine = quote.revision.lines[0];
    assert.equal(oldLine.durationPolicyCodeSnapshot, "FULL_USE_DAYS");
    assert.equal(oldLine.usageDaysSnapshot, "2");
    assert.equal(oldLine.chargeUnitsSnapshot, "2");
    const oneOffPolicy = await db.durationPolicy.findUniqueOrThrow({ where: { code: "ONE_OFF" } });
    await assignDurationPolicy({ actorId: actor.id, offeringId: fire.id, policyId: oneOffPolicy.id, reason: "Phase 7.6 future master-change fixture" }, db);
    const historical = await db.quoteLine.findUniqueOrThrow({ where: { id: oldLine.id } });
    assert.equal(historical.durationPolicyCodeSnapshot, "FULL_USE_DAYS");
    assert.equal(historical.chargeUnitsSnapshot, "2");
    assert.equal(historical.finalAmountPaiseSnapshot, oldLine.finalAmountPaiseSnapshot);

    const clientOnly = await db.commercialOffering.findUniqueOrThrow({ where: { code: "SEC_PLUGPOIN" } });
    await assert.rejects(calculateNormalizedLine({ commercialOfferingId: clientOnly.id, configuration: { quantity: "1" }, usageDays: "1" }, "TO_VENDOR", db), (error: unknown) => error instanceof Error && "code" in error && error.code === "RATE_UNAVAILABLE");
  } finally {
    await db.quoteEvent.deleteMany({ where: { quoteId: { in: quoteIds } } });
    await db.quoteLine.deleteMany({ where: { revision: { quoteId: { in: quoteIds } } } });
    await db.quoteRevision.deleteMany({ where: { quoteId: { in: quoteIds } } });
    await db.quote.deleteMany({ where: { id: { in: quoteIds } } });
    await db.durationPolicyAssignmentAudit.deleteMany({ where: { actorId: actor.id } });
    await db.commercialOffering.update({ where: { id: fire.id }, data: { durationPolicyId: originalPolicyId } });
    await db.user.delete({ where: { id: actor.id } });
    await db.$disconnect();
  }
});
