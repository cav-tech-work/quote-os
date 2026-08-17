import { createHash } from "node:crypto";
import type { PricingFamily, PrismaClient, QuantityBasis } from "@prisma/client";
import { stableJson } from "@/lib/catalogue-import/normalize";
import { loadSemanticContext } from "./review";

export type NosDutyFieldDecision<T extends string> = { decision: "APPROVE" | "DEFER" | "REJECT"; value?: T; reason: string; evidence: string };
export type NosDutyDecisionFile = { schemaVersion: "1.0.0"; sourceImportFileHash: string; catalogueFingerprint: string; decisions: Record<string, { reviewBucket: string; quantityBasis: NosDutyFieldDecision<QuantityBasis>; pricingFamily: NosDutyFieldDecision<PricingFamily>; durationPolicy: NosDutyFieldDecision<string> }> };

export async function nosDutySemanticApply(db: PrismaClient, input: NosDutyDecisionFile, options: { execute: boolean; actorEmail: string }) {
  if (input.schemaVersion !== "1.0.0" || Object.keys(input.decisions).length !== 39) throw new Error("INVALID_NOS_DUTY_DECISIONS");
  const decisionSetHash = createHash("sha256").update(stableJson(input)).digest("hex"); if (await db.catalogueSemanticApply.findUnique({ where: { decisionSetHash } })) return { result: "ALREADY_APPLIED" as const, decisionSetHash, changes: [] };
  const context = await loadSemanticContext(db); if (context.batch.fileHash !== input.sourceImportFileHash || context.catalogueFingerprint !== input.catalogueFingerprint) throw new Error("STALE_NOS_DUTY_DECISIONS");
  const offerings = new Map(context.offerings.map((item) => [item.code, item])); const policies = new Map(context.policies.map((item) => [item.code, item]));
  const changes: Array<{ code: string; offeringId: string; field: "quantityBasis" | "pricingFamily" | "billingUnit" | "durationPolicyId"; oldValue: string | null; newValue: string; reason: string; evidence: string }> = [];
  for (const [code, decision] of Object.entries(input.decisions).sort()) {
    const offering = offerings.get(code); const source = context.evidence.get(code); if (!offering || offering.quantityBasis !== "HEADCOUNT_DUTY" || offering.billingUnit !== "DUTY" || !source) throw new Error(`INVALID_NOS_DUTY_EVIDENCE:${code}`);
    for (const field of ["quantityBasis", "pricingFamily", "durationPolicy"] as const) { const item = decision[field]; if (!item.reason.trim() || !item.evidence.trim()) throw new Error(`MISSING_DECISION_EVIDENCE:${code}:${field}`); if (item.decision !== "APPROVE") continue; if (!item.value) throw new Error(`MISSING_APPROVED_VALUE:${code}:${field}`);
      if (field === "quantityBasis" && offering.quantityBasis !== item.value) changes.push({ code, offeringId: offering.id, field, oldValue: offering.quantityBasis, newValue: item.value, reason: item.reason, evidence: item.evidence });
      if (field === "quantityBasis" && item.value === "COUNT" && String(offering.billingUnit) !== "NOS") changes.push({ code, offeringId: offering.id, field: "billingUnit", oldValue: offering.billingUnit, newValue: "NOS", reason: "COUNT uses the normalized number-of-units billing dimension.", evidence: `${item.evidence} Raw source unit remains preserved in import evidence.` });
      if (field === "pricingFamily" && offering.pricingFamily !== item.value) changes.push({ code, offeringId: offering.id, field, oldValue: offering.pricingFamily, newValue: item.value, reason: item.reason, evidence: item.evidence });
      if (field === "durationPolicy") { const policy = policies.get(item.value); if (!policy?.active || policy.authority !== "INTERNAL_APPROVED") throw new Error(`INVALID_DURATION_POLICY:${code}`); if (offering.durationPolicyId !== policy.id) changes.push({ code, offeringId: offering.id, field: "durationPolicyId", oldValue: offering.durationPolicy?.code ?? null, newValue: policy.code, reason: item.reason, evidence: item.evidence }); }
    }
  }
  if (!options.execute) return { result: "DRY_RUN" as const, decisionSetHash, changes };
  const actor = await db.user.findUnique({ where: { email: options.actorEmail.toLowerCase() } }); if (!actor?.active || actor.role !== "ADMIN") throw new Error("ACTIVE_ADMIN_ACTOR_REQUIRED");
  await db.$transaction(async (tx) => {
    for (const change of changes) {
      const data = change.field === "durationPolicyId"
        ? { durationPolicyId: policies.get(change.newValue)!.id }
        : change.field === "quantityBasis"
          ? { quantityBasis: change.newValue as QuantityBasis }
          : change.field === "billingUnit"
            ? { billingUnit: "NOS" as const }
            : { pricingFamily: change.newValue as PricingFamily };
      await tx.commercialOffering.update({ where: { id: change.offeringId }, data });
      await tx.catalogueSemanticAudit.create({ data: { commercialOfferingId: change.offeringId, field: change.field, oldValue: change.oldValue, newValue: change.newValue, reason: `${change.reason} Evidence: ${change.evidence}`, decisionSetHash, applyIdentity: `ADMIN:${actor.email}` } });
    }
    await tx.catalogueSemanticApply.create({ data: { decisionSetHash, catalogueFingerprint: input.catalogueFingerprint, applyIdentity: `ADMIN:${actor.email}` } });
  });
  return { result: "APPLIED" as const, decisionSetHash, changes };
}
