import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { normalizeAlias, sha256, stableJson } from "./normalize";
import { MASTER_PARSER_VERSION } from "./types";
import type { CatalogueDomain, CataloguePreview, NormalizedUnit } from "./types";

export const REVIEW_SCHEMA_VERSION = "1.0.0";
export type ReviewDecisionState = "APPROVE" | "DEFER" | "REJECT";

const decisionState = z.enum(["APPROVE", "DEFER", "REJECT"]);
const unitCode = z.enum(["M", "FT", "SQ_M", "SQ_FT", "RFT", "CBM", "NOS", "DAY", "DUTY", "LITRE", "SET", "LUMPSUM"]);
const domain = z.enum(["VC", "OPS", "POWER", "TECH", "OTHER"]);

export const reviewDecisionsSchema = z.object({
  schemaVersion: z.literal(REVIEW_SCHEMA_VERSION),
  parserVersion: z.literal(MASTER_PARSER_VERSION),
  expectedFileSha256: z.string().regex(/^[a-f0-9]{64}$/),
  authorityType: z.literal("ACTIVE_COMMERCIAL_MASTER"),
  policy: z.object({
    deterministicConflictFree: z.literal("APPROVE"),
    reviewRequiredDefault: z.literal("DEFER"),
  }).strict(),
  sourceMappings: z.record(z.string(), z.object({
    decision: decisionState,
    canonicalCode: z.string().regex(/^[A-Z0-9][A-Z0-9_.-]*$/).optional(),
    canonicalName: z.string().trim().min(1).optional(),
    domain: domain.optional(),
    note: z.string().trim().min(1).optional(),
  }).strict()),
  unitOverrides: z.record(z.string(), z.object({
    decision: decisionState,
    billingUnit: unitCode.optional(),
    note: z.string().trim().min(1).optional(),
  }).strict()),
  sourceRows: z.record(z.string(), z.object({
    decision: decisionState,
    note: z.string().trim().min(1).optional(),
  }).strict()),
  aliasConflicts: z.record(z.string(), z.object({
    decision: decisionState,
    targetCanonicalCode: z.string().regex(/^[A-Z0-9][A-Z0-9_.-]*$/).optional(),
    note: z.string().trim().min(1).optional(),
  }).strict()),
}).strict();

export type ReviewDecisions = z.infer<typeof reviewDecisionsSchema>;

function sortedRecord<T>(entries: Array<[string, T]>): Record<string, T> {
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
}

export function generateReviewDecisions(preview: CataloguePreview): ReviewDecisions {
  const sourceMappings: Array<[string, ReviewDecisions["sourceMappings"][string]]> = [];
  preview.canonicalCandidates.forEach((candidate) => {
    if (candidate.state !== "MAPPED" && candidate.sourceCode) {
      sourceMappings.push([candidate.sourceCode, { decision: "DEFER", note: candidate.reason }]);
    }
  });

  const unknownUnitCodes = new Set(preview.warnings.filter((issue) => issue.code === "UNKNOWN_UNIT").map((issue) => issue.sourceCode).filter((code): code is string => Boolean(code)));
  const sourceRows = new Map<string, { decision: "DEFER"; note: string }>();
  for (const issue of [...preview.errors, ...preview.warnings]) {
    if (!issue.sourceCode) continue;
    if (["INVALID_SOURCE_CODE", "DUPLICATE_SOURCE_CODE", "INVALID_RATE"].includes(issue.code)) {
      sourceRows.set(issue.sourceCode, { decision: "DEFER", note: issue.message });
    }
  }

  const conflicts = new Map<string, Set<string>>();
  for (const alias of preview.aliases.filter((candidate) => candidate.conflict)) {
    const targets = conflicts.get(alias.normalizedText) ?? new Set<string>();
    targets.add(alias.targetCanonicalCode);
    conflicts.set(alias.normalizedText, targets);
  }

  return {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    parserVersion: MASTER_PARSER_VERSION,
    expectedFileSha256: preview.fileHash,
    authorityType: "ACTIVE_COMMERCIAL_MASTER",
    policy: { deterministicConflictFree: "APPROVE", reviewRequiredDefault: "DEFER" },
    sourceMappings: sortedRecord(sourceMappings),
    unitOverrides: sortedRecord([...unknownUnitCodes].map((code) => [code, { decision: "DEFER" as const, note: "Unknown billing unit requires an explicit human mapping" }])),
    sourceRows: sortedRecord([...sourceRows]),
    aliasConflicts: sortedRecord([...conflicts].map(([text, targets]) => [text, { decision: "DEFER" as const, note: `Conflicting targets: ${[...targets].sort().join(", ")}` }])),
  };
}

export function reviewDecisionsJson(decisions: ReviewDecisions): string {
  return `${JSON.stringify(JSON.parse(stableJson(decisions)), null, 2)}\n`;
}

export function reviewDecisionHash(decisions: ReviewDecisions): string {
  return sha256(stableJson(decisions));
}

export function reviewDecisionFileHash(decisions: ReviewDecisions): string {
  return sha256(reviewDecisionsJson(decisions));
}

export async function readReviewDecisions(path: string): Promise<ReviewDecisions> {
  const raw = JSON.parse(await readFile(path, "utf8"));
  return reviewDecisionsSchema.parse(raw);
}

export async function writeReviewDecisions(path: string, decisions: ReviewDecisions): Promise<void> {
  await writeFile(path, reviewDecisionsJson(decisions), "utf8");
}

export function validateReviewDecisions(preview: CataloguePreview, decisions: ReviewDecisions): void {
  if (decisions.expectedFileSha256 !== preview.fileHash) throw new Error(`STALE_REVIEW: expected workbook ${decisions.expectedFileSha256}, received ${preview.fileHash}`);
  if (decisions.authorityType !== preview.authorityType) throw new Error("INCOMPATIBLE_REVIEW: authority type does not match preview");
  if (decisions.parserVersion !== preview.parserVersion) throw new Error("INCOMPATIBLE_REVIEW: parser version does not match preview");

  const sourceCodes = new Set(preview.offeringCandidates.map((candidate) => candidate.code));
  for (const [code, decision] of Object.entries(decisions.sourceMappings)) {
    if (!sourceCodes.has(code)) throw new Error(`STALE_REVIEW: source mapping decision references missing code ${code}`);
    if (decision.decision === "APPROVE" && (!decision.canonicalCode || !decision.canonicalName)) throw new Error(`INVALID_REVIEW: approved mapping ${code} requires canonicalCode and canonicalName`);
  }
  for (const [code, decision] of Object.entries(decisions.unitOverrides)) {
    if (!sourceCodes.has(code)) throw new Error(`STALE_REVIEW: unit decision references missing code ${code}`);
    if (decision.decision === "APPROVE" && !decision.billingUnit) throw new Error(`INVALID_REVIEW: approved unit override ${code} requires billingUnit`);
  }
  for (const code of Object.keys(decisions.sourceRows)) if (!sourceCodes.has(code)) throw new Error(`STALE_REVIEW: row decision references missing code ${code}`);

  const aliasTargets = new Map<string, Set<string>>();
  for (const alias of preview.aliases.filter((candidate) => candidate.conflict)) {
    const targets = aliasTargets.get(alias.normalizedText) ?? new Set<string>();
    targets.add(alias.targetCanonicalCode);
    aliasTargets.set(alias.normalizedText, targets);
  }
  for (const [rawText, decision] of Object.entries(decisions.aliasConflicts)) {
    const text = normalizeAlias(rawText);
    const targets = aliasTargets.get(text);
    if (!targets) throw new Error(`STALE_REVIEW: alias decision references non-conflicting alias ${rawText}`);
    if (decision.decision === "APPROVE" && (!decision.targetCanonicalCode || !targets.has(decision.targetCanonicalCode))) {
      throw new Error(`INVALID_REVIEW: alias ${rawText} must approve one of: ${[...targets].sort().join(", ")}`);
    }
  }
}

export function resolveMappingDecision(
  previewState: "MAPPED" | "UNMAPPED" | "AMBIGUOUS" | "INVALID",
  sourceCode: string,
  existing: { canonicalCode: string | null; canonicalName: string | null; domain: CatalogueDomain },
  decisions: ReviewDecisions,
): { state: "APPROVED" | "DEFERRED" | "REJECTED"; canonicalCode: string | null; canonicalName: string | null; domain: CatalogueDomain; approval: "DETERMINISTIC_AUTO_APPROVED" | "HUMAN_APPROVED" | null } {
  if (previewState === "MAPPED") return { state: "APPROVED", ...existing, approval: "DETERMINISTIC_AUTO_APPROVED" };
  const decision = decisions.sourceMappings[sourceCode];
  if (!decision || decision.decision === "DEFER") return { state: "DEFERRED", ...existing, approval: null };
  if (decision.decision === "REJECT") return { state: "REJECTED", ...existing, approval: null };
  return { state: "APPROVED", canonicalCode: decision.canonicalCode!, canonicalName: decision.canonicalName!, domain: decision.domain ?? existing.domain, approval: "HUMAN_APPROVED" };
}

export function resolveUnitDecision(sourceCode: string, unit: NormalizedUnit | null, decisions: ReviewDecisions): { state: "APPROVED" | "DEFERRED" | "REJECTED"; billingUnit: NormalizedUnit | null; approval: "DETERMINISTIC_AUTO_APPROVED" | "HUMAN_APPROVED" | null } {
  if (unit) return { state: "APPROVED", billingUnit: unit, approval: "DETERMINISTIC_AUTO_APPROVED" };
  const decision = decisions.unitOverrides[sourceCode];
  if (!decision || decision.decision === "DEFER") return { state: "DEFERRED", billingUnit: null, approval: null };
  if (decision.decision === "REJECT") return { state: "REJECTED", billingUnit: null, approval: null };
  return { state: "APPROVED", billingUnit: decision.billingUnit!, approval: "HUMAN_APPROVED" };
}
