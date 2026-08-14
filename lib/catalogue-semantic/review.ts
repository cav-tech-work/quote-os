import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { stableJson } from "@/lib/catalogue-import/normalize";
import type { SemanticDecisionFile, SemanticReviewRow } from "./types";

function family(code: string, name: string) { const text = `${code} ${name}`.toLowerCase(); for (const [key, terms] of Object.entries({ platform: ["plat", "riser"], carpet: ["carp"], masking_backdrop: ["mask", "backdrop", "bkdp"], scaffolding: ["scaf"], railing: ["rail"], furniture: ["chair", "table", "furn"], cctv: ["cctv"], security_personnel: ["guard", "security personnel"], vanity: ["vanity"] })) if (terms.some((term) => text.includes(term))) return key; return "other"; }
function quantityCandidate(code: string, name: string) { const text = `${code} ${name}`.toLowerCase(); if (text.includes("plat") || text.includes("carp")) return { value: "AREA_LW", reason: "Reviewed horizontal platform/floor/carpet geometry uses length × width." }; if (text.includes("mask") || text.includes("backdrop") || code.startsWith("BKDP_")) return { value: "AREA_LH", reason: "Reviewed vertical masking/backdrop face uses length × height." }; return { value: null, reason: "Geometry remains ambiguous; billing unit alone is insufficient." }; }
export function classifyDurationCandidate(offering: { code: string; name: string; quantityBasis: string | null; kind: string | null; canonicalItem: { name: string; domain: string } | null }, sourceDescription: string | null, days: string | null) {
  const text = `${offering.code} ${offering.name} ${offering.canonicalItem?.name ?? ""} ${sourceDescription ?? ""}`.toLowerCase();
  const specialized = offering.quantityBasis === "HEADCOUNT_DUTY" || offering.quantityBasis === "GENERATOR" || offering.quantityBasis === "MANUAL" || offering.kind === "PACKAGE";
  const personnel = /staff|supervisor|attendant|doctor|nurs|marshal|crew|volunteer|manpower|usher|personnel|bouncer|guard|host/.test(text);
  const security = /security|baggage scanner|dfmd|hhmd|quick response|traffic marshal|bouncer|guard|parking supervisor/.test(text);
  const ordinaryVcElement = /exit|bollard|rail|barricad|ballast|carpet|chair|platform|marquee|cooler|fan|fridge|ice box|hanger rack|light|halogen|mirror|octonorm|door|pagoda|cable manager|plug point|scaff|sofa|stool|table|tent/.test(text);
  let reviewBucket = "OTHER_UNCERTAIN";
  if (text.includes("vanity")) reviewBucket = "VANITY";
  else if (text.includes("cctv")) reviewBucket = "CCTV";
  else if (security && personnel) reviewBucket = "SECURITY_PERSONNEL";
  else if (security) reviewBucket = "SECURITY_EQUIPMENT";
  else if (specialized && personnel) reviewBucket = "HEADCOUNT_DUTY";
  else if (offering.canonicalItem?.domain === "OPS") reviewBucket = "OPS";
  else if (offering.canonicalItem?.domain === "VC" && days === "Y" && !specialized && ordinaryVcElement) reviewBucket = "ORDINARY_VC_RENTAL";
  else if (offering.kind === "PACKAGE") reviewBucket = "PACKAGE_OR_COMPOSITE";
  else if (specialized) reviewBucket = "MANUAL_OR_BESPOKE";
  const candidate = reviewBucket === "ORDINARY_VC_RENTAL" || (reviewBucket === "CCTV" && !specialized) ? "HALF_USE_DAYS_MIN_1" : null;
  const reason = candidate ? reviewBucket === "CCTV" ? "Explicit CAV commercial knowledge permits reviewed CCTV equipment to share the half-use-days policy without domain routing." : "Explicit CAV commercial rule: this reviewed reusable ordinary VC element uses half usage days with a one-unit minimum." : reviewBucket === "CCTV" ? "CCTV may share the ordinary policy only for equipment; this row is specialized duty/personnel and remains deferred." : reviewBucket === "OPS" ? "OPS duration arithmetic has not been approved; Days Applies Y alone is insufficient." : reviewBucket.startsWith("SECURITY") ? "Security duration behavior remains commercially unresolved and conservative." : reviewBucket === "VANITY" ? "Vanity is an explicit exception to the ordinary VC default." : "Specialized or uncertain commercial duration behavior remains deferred.";
  return { reviewBucket, specialized, candidate, reason, confidence: candidate ? "HIGH" as const : "DEFER" as const };
}
export async function loadSemanticContext(db: PrismaClient) {
  const batch = await db.importBatch.findFirst({ where: { sourceType: "ACTIVE_COMMERCIAL_MASTER", status: "APPLIED" }, orderBy: { appliedAt: "desc" }, include: { rows: { where: { sheet: "RateChart" } } } });
  if (!batch) throw new Error("No applied active-commercial-master import exists.");
  const evidence = new Map<string, { description: string | null; days: string | null }>();
  for (const row of batch.rows) { const raw = row.rawData as Record<string, unknown>; const code = String(raw.Code ?? "").trim(); if (code) evidence.set(code, { description: typeof raw.Element === "string" ? raw.Element : null, days: typeof raw["Days Applies?"] === "string" ? raw["Days Applies?"].trim().toUpperCase() : null }); }
  const offerings = await db.commercialOffering.findMany({ orderBy: { code: "asc" }, include: { canonicalItem: true, durationPolicy: { include: { points: { orderBy: { sortOrder: "asc" } } } }, prices: { where: { active: true, scopeType: "GLOBAL", marketId: null }, select: { side: true } } } });
  const policies = await db.durationPolicy.findMany({ orderBy: { code: "asc" }, include: { points: { orderBy: { sortOrder: "asc" } } } });
  const fingerprintData = { sourceImportFileHash: batch.fileHash, offerings: offerings.map((o) => ({ code: o.code, name: o.name, canonicalCode: o.canonicalItem?.code ?? null, domain: o.canonicalItem?.domain ?? null, billingUnit: o.billingUnit, quantityBasis: o.quantityBasis, durationBasis: o.durationBasis, durationPolicy: o.durationPolicy?.code ?? null, daysApplies: evidence.get(o.code)?.days ?? null })), policies: policies.map((p) => ({ code: p.code, mode: p.mode, authority: p.authority, multiplier: [p.chargeMultiplierNumerator, p.chargeMultiplierDenominator], minimum: [p.minimumChargeNumerator, p.minimumChargeDenominator], rounding: p.roundingMode, points: p.points.map((x) => [x.usageDays, x.chargeUnitsNumerator, x.chargeUnitsDenominator]) })) };
  const catalogueFingerprint = createHash("sha256").update(stableJson(fingerprintData)).digest("hex");
  return { batch, evidence, offerings, policies, catalogueFingerprint };
}

export async function buildSemanticReview(db: PrismaClient, decisions?: SemanticDecisionFile) {
  const context = await loadSemanticContext(db); const rows: SemanticReviewRow[] = context.offerings.map((offering) => {
    const source = context.evidence.get(offering.code); const candidate = !offering.quantityBasis ? quantityCandidate(offering.code, offering.name) : { value: offering.quantityBasis, reason: "Existing reviewed quantity basis retained." };
    const classification = classifyDurationCandidate(offering, source?.description ?? null, source?.days ?? null); const durationCandidate = source?.days === "N" ? "ONE_OFF" : classification.candidate; const blockers: string[] = [];
    if (!offering.quantityBasis && !candidate.value) blockers.push("QUANTITY"); if (!offering.durationPolicyId) blockers.push("DURATION"); if (["HEADCOUNT_DUTY", "GENERATOR", "MANUAL"].includes(offering.quantityBasis ?? "")) blockers.push("SPECIALIZED");
    return { code: offering.code, name: offering.name, canonical: offering.canonicalItem?.name ?? null, domain: offering.canonicalItem?.domain ?? null, billingUnit: offering.billingUnit, sourceDescription: source?.description ?? null, daysApplies: source?.days ?? null, durationBasis: offering.durationBasis, currentQuantityBasis: offering.quantityBasis, candidateQuantityBasis: candidate.value, quantityReason: candidate.reason, currentDurationPolicy: offering.durationPolicy?.code ?? null, candidateDurationPolicy: durationCandidate, durationReason: source?.days === "N" ? "Authoritative Days Applies N is strong one-off evidence; explicit approval is still required." : classification.reason, family: family(offering.code, offering.name), reviewBucket: classification.reviewBucket, reviewConfidence: source?.days === "N" ? "HIGH" : classification.confidence, globalToClientAvailable: offering.prices.some((p) => p.side === "TO_CLIENT"), globalToVendorAvailable: offering.prices.some((p) => p.side === "TO_VENDOR"), specialized: classification.specialized, blockers };
  });
  return { schemaVersion: "1.0.0", sourceImportFileHash: context.batch.fileHash, catalogueFingerprint: context.catalogueFingerprint, rows, decisions: decisions?.decisions ?? {} };
}
