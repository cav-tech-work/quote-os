import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { stableJson } from "@/lib/catalogue-import/normalize";
import { loadSemanticContext } from "./review";

export type PersonnelDecisionFile = { schemaVersion: "1.0.0"; sourceImportFileHash: string; catalogueFingerprint: string; decisions: Record<string, string>; reason: string };

export async function personnelSemanticApply(db: PrismaClient, input: PersonnelDecisionFile, options: { execute: boolean; actorEmail: string }) {
  if (input.schemaVersion !== "1.0.0" || !input.reason.trim() || !Object.keys(input.decisions).length) throw new Error("INVALID_PERSONNEL_DECISIONS");
  const context = await loadSemanticContext(db);
  if (context.batch.fileHash !== input.sourceImportFileHash || context.catalogueFingerprint !== input.catalogueFingerprint) throw new Error("STALE_PERSONNEL_DECISIONS");
  const offerings = new Map(context.offerings.map((item) => [item.code, item]));
  const changes = Object.entries(input.decisions).sort().map(([code, sourceDescription]) => {
    const offering = offerings.get(code); const evidence = context.evidence.get(code);
    if (!offering || offering.quantityBasis !== "HEADCOUNT_DUTY" || offering.billingUnit !== "DUTY" || evidence?.description !== sourceDescription) throw new Error(`INVALID_PERSONNEL_EVIDENCE:${code}`);
    return offering.pricingFamily === "HEADCOUNT_DUTY" ? null : { code, offeringId: offering.id, oldValue: offering.pricingFamily, sourceDescription };
  }).filter((change): change is NonNullable<typeof change> => Boolean(change));
  const decisionSetHash = createHash("sha256").update(stableJson(input)).digest("hex");
  if (await db.catalogueSemanticApply.findUnique({ where: { decisionSetHash } })) return { result: "ALREADY_APPLIED" as const, decisionSetHash, changes: [] };
  if (!options.execute) return { result: "DRY_RUN" as const, decisionSetHash, changes };
  const actor = await db.user.findUnique({ where: { email: options.actorEmail.toLowerCase() } });
  if (!actor?.active || actor.role !== "ADMIN") throw new Error("ACTIVE_ADMIN_ACTOR_REQUIRED");
  await db.$transaction(async (tx) => {
    for (const change of changes) {
      await tx.commercialOffering.update({ where: { id: change.offeringId }, data: { pricingFamily: "HEADCOUNT_DUTY" } });
      await tx.catalogueSemanticAudit.create({ data: { commercialOfferingId: change.offeringId, field: "pricingFamily", oldValue: change.oldValue, newValue: "HEADCOUNT_DUTY", reason: `${input.reason} Evidence: ${change.sourceDescription}.`, decisionSetHash, applyIdentity: `ADMIN:${actor.email}` } });
    }
    await tx.catalogueSemanticApply.create({ data: { decisionSetHash, catalogueFingerprint: input.catalogueFingerprint, applyIdentity: `ADMIN:${actor.email}` } });
  });
  return { result: "APPLIED" as const, decisionSetHash, changes };
}
