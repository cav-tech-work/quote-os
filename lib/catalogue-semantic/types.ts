import type { QuantityBasis } from "@prisma/client";

export type ReviewDecision = "APPROVE" | "DEFER" | "REJECT";
export type FieldDecision<T> = { decision: ReviewDecision; value?: T; reason: string };
export type SemanticDecisionFile = {
  schemaVersion: "1.0.0";
  sourceImportFileHash: string;
  catalogueFingerprint: string;
  decisions: Record<string, { quantityBasis?: FieldDecision<QuantityBasis>; durationPolicy?: FieldDecision<string> }>;
};
export type SemanticReviewRow = {
  code: string; name: string; canonical: string | null; domain: string | null; billingUnit: string;
  sourceDescription: string | null; daysApplies: string | null; durationBasis: string | null;
  currentQuantityBasis: string | null; candidateQuantityBasis: string | null; quantityReason: string;
  currentDurationPolicy: string | null; candidateDurationPolicy: string | null; durationReason: string;
  family: string; blockers: string[];
};
