import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { stableJson } from "@/lib/catalogue-import/normalize";
import type { SemanticDecisionFile, SemanticReviewRow } from "./types";

function family(code: string, name: string) { const text = `${code} ${name}`.toLowerCase(); for (const [key, terms] of Object.entries({ platform: ["plat", "riser"], carpet: ["carp"], masking_backdrop: ["mask", "backdrop", "bkdp"], scaffolding: ["scaf"], railing: ["rail"], furniture: ["chair", "table", "furn"], cctv: ["cctv"], security_personnel: ["guard", "security personnel"], vanity: ["vanity"] })) if (terms.some((term) => text.includes(term))) return key; return "other"; }
function quantityCandidate(code: string, name: string) { const text = `${code} ${name}`.toLowerCase(); if (text.includes("plat") || text.includes("carp")) return { value: "AREA_LW", reason: "Reviewed horizontal platform/floor/carpet geometry uses length × width." }; if (text.includes("mask") || text.includes("backdrop") || code.startsWith("BKDP_")) return { value: "AREA_LH", reason: "Reviewed vertical masking/backdrop face uses length × height." }; return { value: null, reason: "Geometry remains ambiguous; billing unit alone is insufficient." }; }
export async function loadSemanticContext(db: PrismaClient) {
  const batch = await db.importBatch.findFirst({ where: { sourceType: "ACTIVE_COMMERCIAL_MASTER", status: "APPLIED" }, orderBy: { appliedAt: "desc" }, include: { rows: { where: { sheet: "RateChart" } } } });
  if (!batch) throw new Error("No applied active-commercial-master import exists.");
  const evidence = new Map<string, { description: string | null; days: string | null }>();
  for (const row of batch.rows) { const raw = row.rawData as Record<string, unknown>; const code = String(raw.Code ?? "").trim(); if (code) evidence.set(code, { description: typeof raw.Element === "string" ? raw.Element : null, days: typeof raw["Days Applies?"] === "string" ? raw["Days Applies?"].trim().toUpperCase() : null }); }
  const offerings = await db.commercialOffering.findMany({ orderBy: { code: "asc" }, include: { canonicalItem: true, durationPolicy: { include: { points: { orderBy: { sortOrder: "asc" } } } } } });
  const policies = await db.durationPolicy.findMany({ orderBy: { code: "asc" }, include: { points: { orderBy: { sortOrder: "asc" } } } });
  const fingerprintData = { sourceImportFileHash: batch.fileHash, offerings: offerings.map((o) => ({ code: o.code, name: o.name, canonicalCode: o.canonicalItem?.code ?? null, domain: o.canonicalItem?.domain ?? null, billingUnit: o.billingUnit, quantityBasis: o.quantityBasis, durationBasis: o.durationBasis, daysApplies: evidence.get(o.code)?.days ?? null })), policies: policies.map((p) => ({ code: p.code, mode: p.mode, authority: p.authority, multiplier: [p.chargeMultiplierNumerator, p.chargeMultiplierDenominator], minimum: [p.minimumChargeNumerator, p.minimumChargeDenominator], rounding: p.roundingMode, points: p.points.map((x) => [x.usageDays, x.chargeUnitsNumerator, x.chargeUnitsDenominator]) })) };
  const catalogueFingerprint = createHash("sha256").update(stableJson(fingerprintData)).digest("hex");
  return { batch, evidence, offerings, policies, catalogueFingerprint };
}

export async function buildSemanticReview(db: PrismaClient, decisions?: SemanticDecisionFile) {
  const context = await loadSemanticContext(db); const rows: SemanticReviewRow[] = context.offerings.map((offering) => {
    const source = context.evidence.get(offering.code); const candidate = !offering.quantityBasis ? quantityCandidate(offering.code, offering.name) : { value: offering.quantityBasis, reason: "Existing reviewed quantity basis retained." };
    const durationCandidate = source?.days === "N" ? "ONE_OFF" : null; const blockers: string[] = [];
    if (!offering.quantityBasis && !candidate.value) blockers.push("QUANTITY"); if (!offering.durationPolicyId) blockers.push("DURATION"); if (["HEADCOUNT_DUTY", "GENERATOR", "MANUAL"].includes(offering.quantityBasis ?? "")) blockers.push("SPECIALIZED");
    return { code: offering.code, name: offering.name, canonical: offering.canonicalItem?.name ?? null, domain: offering.canonicalItem?.domain ?? null, billingUnit: offering.billingUnit, sourceDescription: source?.description ?? null, daysApplies: source?.days ?? null, durationBasis: offering.durationBasis, currentQuantityBasis: offering.quantityBasis, candidateQuantityBasis: candidate.value, quantityReason: candidate.reason, currentDurationPolicy: offering.durationPolicy?.code ?? null, candidateDurationPolicy: durationCandidate, durationReason: durationCandidate ? "Authoritative Days Applies N is strong one-off evidence; explicit approval is still required." : source?.days === "Y" ? "Duration-sensitive evidence does not determine mathematical policy." : "No deterministic duration-policy evidence.", family: family(offering.code, offering.name), blockers };
  });
  return { schemaVersion: "1.0.0", sourceImportFileHash: context.batch.fileHash, catalogueFingerprint: context.catalogueFingerprint, rows, decisions: decisions?.decisions ?? {} };
}
