import { createHash } from "node:crypto";
import type { PricingFamily, PrismaClient, QuantityBasis, UnitCode } from "@prisma/client";
import { stableJson } from "@/lib/catalogue-import/normalize";
import { loadSemanticContext } from "./review";
import type { SemanticDecisionFile } from "./types";

export function semanticDecisionHash(decisions: SemanticDecisionFile) { return createHash("sha256").update(stableJson(decisions)).digest("hex"); }
export async function semanticApply(db: PrismaClient, decisions: SemanticDecisionFile, options: { execute: boolean; actorEmail: string; applyIdentity?: string }) {
  if (decisions.schemaVersion !== "1.0.0" || !decisions.sourceImportFileHash || !decisions.catalogueFingerprint || !decisions.decisions || typeof decisions.decisions !== "object") throw new Error("UNSUPPORTED_DECISION_SCHEMA");
  const validDecisions = new Set(["APPROVE", "DEFER", "REJECT"]); const validQuantityBases = new Set(["COUNT", "AREA_LW", "AREA_LH", "LINEAR", "VOLUME", "HEADCOUNT_DUTY", "FIXED", "MANUAL", "GENERATOR"]); const validPricingFamilies = new Set(["ORDINARY", "HEADCOUNT_DUTY"]); const validBillingUnits = new Set(["M", "FT", "SQ_M", "SQ_FT", "RFT", "CBM", "NOS", "DAY", "DUTY", "LITRE", "SET", "LUMPSUM"]);
  for (const [code, fields] of Object.entries(decisions.decisions)) for (const [field, decision] of Object.entries(fields)) { if (!validDecisions.has(decision.decision) || !decision.reason?.trim()) throw new Error(`INVALID_DECISION:${code}:${field}`); if (field !== "quantityBasis" && !decision.evidence?.trim()) throw new Error(`MISSING_DECISION_EVIDENCE:${code}:${field}`); if (field === "quantityBasis" && decision.value && !validQuantityBases.has(decision.value)) throw new Error(`INVALID_QUANTITY_VALUE:${code}`); if (field === "pricingFamily" && decision.value && !validPricingFamilies.has(decision.value)) throw new Error(`INVALID_PRICING_FAMILY:${code}`); if (field === "billingUnit" && decision.value && !validBillingUnits.has(decision.value)) throw new Error(`INVALID_BILLING_UNIT:${code}`); }
  const decisionSetHash = semanticDecisionHash(decisions);
  const prior = await db.catalogueSemanticApply.findUnique({ where: { decisionSetHash } }); if (prior) return { result: "ALREADY_APPLIED" as const, decisionSetHash, changes: [] };
  const context = await loadSemanticContext(db); if (context.catalogueFingerprint !== decisions.catalogueFingerprint || context.batch.fileHash !== decisions.sourceImportFileHash) throw new Error("STALE_SEMANTIC_DECISIONS");
  const offeringByCode = new Map(context.offerings.map((o) => [o.code, o])); const policyByCode = new Map(context.policies.map((p) => [p.code, p])); const changes: Array<{ code: string; field: string; oldValue: string | null; newValue: string | null; reason: string }> = [];
  for (const [code, decision] of Object.entries(decisions.decisions).sort()) { const offering = offeringByCode.get(code); if (!offering) throw new Error(`UNKNOWN_OFFERING:${code}`);
    if (decision.quantityBasis?.decision === "APPROVE") { if (!decision.quantityBasis.value) throw new Error(`MISSING_QUANTITY_VALUE:${code}`); if (offering.quantityBasis !== decision.quantityBasis.value) changes.push({ code, field: "quantityBasis", oldValue: offering.quantityBasis, newValue: decision.quantityBasis.value, reason: decision.quantityBasis.reason }); }
    if (decision.pricingFamily?.decision === "APPROVE") { if (!decision.pricingFamily.value) throw new Error(`MISSING_PRICING_FAMILY:${code}`); if (offering.pricingFamily !== decision.pricingFamily.value) changes.push({ code, field: "pricingFamily", oldValue: offering.pricingFamily, newValue: decision.pricingFamily.value, reason: decision.pricingFamily.reason }); }
    if (decision.billingUnit?.decision === "APPROVE") { if (!decision.billingUnit.value) throw new Error(`MISSING_BILLING_UNIT:${code}`); if (offering.billingUnit !== decision.billingUnit.value) changes.push({ code, field: "billingUnit", oldValue: offering.billingUnit, newValue: decision.billingUnit.value, reason: decision.billingUnit.reason }); }
    if (decision.durationPolicy?.decision === "APPROVE") { const policy = decision.durationPolicy.value ? policyByCode.get(decision.durationPolicy.value) : null; if (!policy || !policy.active || policy.authority !== "INTERNAL_APPROVED") throw new Error(`INVALID_DURATION_POLICY:${code}`); if (offering.durationPolicyId !== policy.id) changes.push({ code, field: "durationPolicyId", oldValue: offering.durationPolicy?.code ?? null, newValue: policy.code, reason: decision.durationPolicy.reason }); }
  }
  if (!options.execute) return { result: "DRY_RUN" as const, decisionSetHash, changes };
  const actor = await db.user.findUnique({ where: { email: options.actorEmail.toLowerCase() } }); if (!actor?.active || actor.role !== "ADMIN") throw new Error("ACTIVE_ADMIN_ACTOR_REQUIRED"); const applyIdentity = options.applyIdentity ?? `ADMIN:${actor.email}`;
  await db.$transaction(async (tx) => { for (const change of changes) { const offering = offeringByCode.get(change.code)!;
      if (change.field === "quantityBasis") await tx.commercialOffering.update({ where: { id: offering.id }, data: { quantityBasis: change.newValue as QuantityBasis } });
      else if (change.field === "pricingFamily") await tx.commercialOffering.update({ where: { id: offering.id }, data: { pricingFamily: change.newValue as PricingFamily } });
      else if (change.field === "billingUnit") await tx.commercialOffering.update({ where: { id: offering.id }, data: { billingUnit: change.newValue as UnitCode } });
      else { const policy = policyByCode.get(change.newValue!)!; await tx.commercialOffering.update({ where: { id: offering.id }, data: { durationPolicyId: policy.id } }); await tx.durationPolicyAssignmentAudit.create({ data: { actorId: actor.id, commercialOfferingId: offering.id, oldPolicyId: offering.durationPolicyId, newPolicyId: policy.id, reason: change.reason } }); }
      await tx.catalogueSemanticAudit.create({ data: { commercialOfferingId: offering.id, field: change.field, oldValue: change.oldValue, newValue: change.newValue, reason: change.reason, decisionSetHash, applyIdentity } });
    } await tx.catalogueSemanticApply.create({ data: { decisionSetHash, catalogueFingerprint: decisions.catalogueFingerprint, applyIdentity } }); });
  return { result: "APPLIED" as const, decisionSetHash, changes };
}
