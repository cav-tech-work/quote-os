import { normalizeAlias, stableJson } from "./normalize";
import { resolveMappingDecision, resolveUnitDecision, reviewDecisionFileHash, reviewDecisionHash, validateReviewDecisions } from "./review";
import type { ReviewDecisions } from "./review";
import type { CatalogueDomain, CataloguePreview, NormalizedUnit, OfferingCandidate, PriceCandidate } from "./types";

export type ApplyAction = "CREATE" | "UPDATE" | "UNCHANGED" | "DEFER";

export interface ApplyDestinationSnapshot {
  canonicalItems: Map<string, { name: string; domain: CatalogueDomain; entityType: string | null; defaultUnit: NormalizedUnit | null }>;
  offerings: Map<string, { name: string; canonicalCode: string | null; billingUnit: NormalizedUnit; quantityBasis: string | null; durationBasis: string | null; kind: string | null }>;
  aliases: Set<string>;
  sourceMappings: Map<string, { canonicalCode: string | null; offeringCode: string | null; description: string }>;
  prices: Map<string, { id: string; amountPaise: number }>;
}

export interface ResolvedSourceRow {
  sourceCode: string;
  sourceRow: number;
  disposition: "APPLY" | "DEFER" | "REJECT";
  reason: string;
  canonicalCode: string | null;
  canonicalName: string | null;
  domain: CatalogueDomain;
  billingUnit: NormalizedUnit | null;
  quantityBasis: OfferingCandidate["candidateQuantityBasis"];
  durationBasis: OfferingCandidate["candidateDurationBasis"];
  approval: Array<"DETERMINISTIC_AUTO_APPROVED" | "HUMAN_APPROVED">;
}

export interface CatalogueApplyPlan {
  schemaVersion: "1.0.0";
  mode: "APPLY_PLAN";
  sourceFile: string;
  fileHash: string;
  decisionHash: string;
  decisionFileHash: string;
  parserVersion: string;
  reviewSchemaVersion: string;
  alreadyApplied: boolean;
  summary: {
    canonicalItems: Record<ApplyAction, number>;
    commercialOfferings: Record<ApplyAction, number>;
    aliases: Record<ApplyAction, number>;
    sourceMappings: Record<ApplyAction, number>;
    prices: Record<ApplyAction, number>;
    deferredSourceRows: number;
    rejectedSourceRows: number;
    deferredAliases: number;
    rejectedAliases: number;
    warnings: number;
    errors: number;
    cityValuesIgnored: number;
  };
  rows: ResolvedSourceRow[];
  canonicalItems: Array<{ code: string; name: string; domain: CatalogueDomain; action: ApplyAction }>;
  commercialOfferings: Array<{ code: string; name: string; canonicalCode: string; billingUnit: NormalizedUnit; quantityBasis: OfferingCandidate["candidateQuantityBasis"]; durationBasis: OfferingCandidate["candidateDurationBasis"]; action: ApplyAction }>;
  aliases: Array<{ targetCanonicalCode: string; normalizedText: string; originalText: string; sourceCode: string; action: ApplyAction }>;
  sourceMappings: Array<{ sourceCode: string; sourceDescription: string; sourceRow: number; canonicalCode: string; offeringCode: string; approval: string[]; action: ApplyAction }>;
  prices: Array<PriceCandidate & { action: ApplyAction; existingPriceId: string | null }>;
  rejections: Array<{ type: "SOURCE_ROW" | "ALIAS"; identity: string; reason: string }>;
  unresolved: Array<{ type: "SOURCE_ROW" | "ALIAS"; identity: string; reason: string }>;
}

function counts<T extends { action: ApplyAction }>(items: T[], deferred = 0): Record<ApplyAction, number> {
  return {
    CREATE: items.filter((item) => item.action === "CREATE").length,
    UPDATE: items.filter((item) => item.action === "UPDATE").length,
    UNCHANGED: items.filter((item) => item.action === "UNCHANGED").length,
    DEFER: deferred + items.filter((item) => item.action === "DEFER").length,
  };
}

function canonicalAction(code: string, name: string, domain: CatalogueDomain, destination?: ApplyDestinationSnapshot): ApplyAction {
  if (!destination) return "CREATE";
  const current = destination.canonicalItems.get(code);
  if (!current) return "CREATE";
  return current.name === name && current.domain === domain ? "UNCHANGED" : "UPDATE";
}

function offeringAction(item: CatalogueApplyPlan["commercialOfferings"][number], destination?: ApplyDestinationSnapshot): ApplyAction {
  if (!destination) return "CREATE";
  const current = destination.offerings.get(item.code);
  if (!current) return "CREATE";
  return current.name === item.name
    && current.canonicalCode === item.canonicalCode
    && current.billingUnit === item.billingUnit
    && (item.quantityBasis === null || current.quantityBasis === item.quantityBasis)
    && (item.durationBasis === null || current.durationBasis === item.durationBasis)
    ? "UNCHANGED" : "UPDATE";
}

export function buildCatalogueApplyPlan(
  preview: CataloguePreview,
  decisions: ReviewDecisions,
  destination?: ApplyDestinationSnapshot,
): CatalogueApplyPlan {
  validateReviewDecisions(preview, decisions);
  const globalErrors = preview.errors.filter((issue) => !issue.sourceCode);
  if (globalErrors.length) throw new Error(`PREVIEW_ERRORS: ${globalErrors.map((issue) => issue.message).join("; ")}`);

  const rows: ResolvedSourceRow[] = [];
  const unresolved: CatalogueApplyPlan["unresolved"] = [];
  const rejections: CatalogueApplyPlan["rejections"] = [];
  const offeringByCode = new Map(preview.offeringCandidates.map((candidate) => [candidate.code, candidate]));
  const canonicalBySourceCode = new Map(preview.canonicalCandidates.map((candidate) => [candidate.sourceCode, candidate]));
  const sourceMappingByCode = new Map(preview.sourceMappings.map((candidate) => [candidate.sourceCode, candidate]));
  const blockingRowCodes = new Set([...preview.errors, ...preview.warnings]
    .filter((issue) => issue.sourceCode && ["INVALID_SOURCE_CODE", "DUPLICATE_SOURCE_CODE", "INVALID_RATE"].includes(issue.code))
    .map((issue) => issue.sourceCode!));

  for (const offering of preview.offeringCandidates) {
    const code = offering.code;
    const canonical = canonicalBySourceCode.get(code)!;
    const mapping = resolveMappingDecision(canonical.state, code, {
      canonicalCode: canonical.canonicalCode,
      canonicalName: canonical.canonicalName,
      domain: canonical.domain,
    }, decisions);
    const unit = resolveUnitDecision(code, offering.billingUnit, decisions);
    const rowDecision = decisions.sourceRows[code];
    let disposition: ResolvedSourceRow["disposition"] = "APPLY";
    let reason = "Deterministic mapping and billing unit are eligible";
    const approval = [mapping.approval, unit.approval].filter((value): value is "DETERMINISTIC_AUTO_APPROVED" | "HUMAN_APPROVED" => Boolean(value));

    if (blockingRowCodes.has(code) && (!rowDecision || rowDecision.decision === "DEFER")) {
      disposition = "DEFER";
      reason = "Blocking row warning/error has no explicit approval";
    } else if (rowDecision?.decision === "REJECT" || mapping.state === "REJECTED" || unit.state === "REJECTED") {
      disposition = "REJECT";
      reason = "Explicit review rejection";
    } else if (mapping.state !== "APPROVED" || unit.state !== "APPROVED") {
      disposition = "DEFER";
      reason = mapping.state !== "APPROVED" ? "Canonical mapping is unresolved" : "Billing unit is unresolved";
    } else if (rowDecision?.decision === "APPROVE") {
      approval.push("HUMAN_APPROVED");
      reason = "Explicit row approval plus resolved identity and unit";
    }

    const resolved: ResolvedSourceRow = {
      sourceCode: code,
      sourceRow: offering.sourceRow,
      disposition,
      reason,
      canonicalCode: mapping.canonicalCode,
      canonicalName: mapping.canonicalName,
      domain: mapping.domain,
      billingUnit: unit.billingUnit,
      quantityBasis: offering.candidateQuantityBasis,
      durationBasis: offering.candidateDurationBasis,
      approval: [...new Set(approval)],
    };
    rows.push(resolved);
    if (disposition === "DEFER") unresolved.push({ type: "SOURCE_ROW", identity: code, reason });
    if (disposition === "REJECT") rejections.push({ type: "SOURCE_ROW", identity: code, reason });
  }

  const appliedRows = rows.filter((row) => row.disposition === "APPLY");
  const canonicalMap = new Map<string, { code: string; name: string; domain: CatalogueDomain; action: ApplyAction }>();
  for (const row of appliedRows) {
    if (!row.canonicalCode || !row.canonicalName) throw new Error(`INTERNAL_PLAN_ERROR: applied row ${row.sourceCode} has no canonical identity`);
    const existing = canonicalMap.get(row.canonicalCode);
    if (existing && (existing.name !== row.canonicalName || existing.domain !== row.domain)) throw new Error(`CANONICAL_CONFLICT: ${row.canonicalCode} has conflicting approved interpretations`);
    canonicalMap.set(row.canonicalCode, { code: row.canonicalCode, name: row.canonicalName, domain: row.domain, action: canonicalAction(row.canonicalCode, row.canonicalName, row.domain, destination) });
  }
  const canonicalItems = [...canonicalMap.values()].sort((a, b) => a.code.localeCompare(b.code));

  const commercialOfferings = appliedRows.map((row) => {
    const candidate = offeringByCode.get(row.sourceCode)!;
    const item: CatalogueApplyPlan["commercialOfferings"][number] = {
      code: row.sourceCode,
      name: candidate.name,
      canonicalCode: row.canonicalCode!,
      billingUnit: row.billingUnit!,
      quantityBasis: row.quantityBasis,
      durationBasis: row.durationBasis,
      action: "CREATE",
    };
    item.action = offeringAction(item, destination);
    return item;
  }).sort((a, b) => a.code.localeCompare(b.code));

  let deferredAliases = 0;
  let rejectedAliases = 0;
  const aliasConflictDecisions = new Map(Object.entries(decisions.aliasConflicts).map(([text, decision]) => [normalizeAlias(text), decision]));
  const appliedCodeSet = new Set(appliedRows.map((row) => row.sourceCode));
  const aliases: CatalogueApplyPlan["aliases"] = [];
  for (const alias of preview.aliases) {
    if (!appliedCodeSet.has(alias.sourceCode)) {
      deferredAliases += 1;
      continue;
    }
    if (alias.conflict) {
      const decision = aliasConflictDecisions.get(alias.normalizedText);
      if (!decision || decision.decision === "DEFER" || (decision.decision === "APPROVE" && decision.targetCanonicalCode !== alias.targetCanonicalCode)) {
        deferredAliases += 1;
        unresolved.push({ type: "ALIAS", identity: `${alias.normalizedText} → ${alias.targetCanonicalCode}`, reason: "Conflicting alias is not approved for this target" });
        continue;
      }
      if (decision.decision === "REJECT") {
        rejectedAliases += 1;
        rejections.push({ type: "ALIAS", identity: `${alias.normalizedText} → ${alias.targetCanonicalCode}`, reason: "Explicit alias rejection" });
        continue;
      }
    }
    const identity = `${alias.targetCanonicalCode}\u0000${alias.normalizedText}`;
    aliases.push({ ...alias, action: destination?.aliases.has(identity) ? "UNCHANGED" : "CREATE" });
  }

  const sourceMappings = appliedRows.map((row) => {
    const candidate = sourceMappingByCode.get(row.sourceCode)!;
    const current = destination?.sourceMappings.get(row.sourceCode);
    const action: ApplyAction = !current ? "CREATE"
      : current.canonicalCode === row.canonicalCode && current.offeringCode === row.sourceCode && current.description === (candidate.sourceDescription ?? row.sourceCode) ? "UNCHANGED" : "UPDATE";
    return {
      sourceCode: row.sourceCode,
      sourceDescription: candidate.sourceDescription ?? row.sourceCode,
      sourceRow: row.sourceRow,
      canonicalCode: row.canonicalCode!,
      offeringCode: row.sourceCode,
      approval: row.approval,
      action,
    };
  }).sort((a, b) => a.sourceCode.localeCompare(b.sourceCode));

  const prices = preview.priceCandidates.filter((candidate) => appliedCodeSet.has(candidate.offeringCode)).map((candidate) => {
    const identity = `${candidate.offeringCode}\u0000${candidate.side}`;
    const current = destination?.prices.get(identity);
    return { ...candidate, action: !current ? "CREATE" as const : current.amountPaise === candidate.amountPaise ? "UNCHANGED" as const : "UPDATE" as const, existingPriceId: current?.id ?? null };
  }).sort((a, b) => a.offeringCode.localeCompare(b.offeringCode) || a.side.localeCompare(b.side));

  return {
    schemaVersion: "1.0.0",
    mode: "APPLY_PLAN",
    sourceFile: preview.sourceFile,
    fileHash: preview.fileHash,
    decisionHash: reviewDecisionHash(decisions),
    decisionFileHash: reviewDecisionFileHash(decisions),
    parserVersion: preview.parserVersion,
    reviewSchemaVersion: decisions.schemaVersion,
    alreadyApplied: false,
    summary: {
      canonicalItems: counts(canonicalItems, rows.filter((row) => row.disposition === "DEFER").length),
      commercialOfferings: counts(commercialOfferings, rows.filter((row) => row.disposition === "DEFER").length),
      aliases: counts(aliases, deferredAliases),
      sourceMappings: counts(sourceMappings, rows.filter((row) => row.disposition === "DEFER").length),
      prices: counts(prices, preview.priceCandidates.filter((candidate) => !appliedCodeSet.has(candidate.offeringCode)).length),
      deferredSourceRows: rows.filter((row) => row.disposition === "DEFER").length,
      rejectedSourceRows: rows.filter((row) => row.disposition === "REJECT").length,
      deferredAliases,
      rejectedAliases,
      warnings: preview.summary.warnings,
      errors: preview.summary.errors,
      cityValuesIgnored: preview.summary.cityValues,
    },
    rows,
    canonicalItems,
    commercialOfferings,
    aliases,
    sourceMappings,
    prices,
    rejections,
    unresolved,
  };
}

export function applyPlanJson(plan: CatalogueApplyPlan): string {
  return `${stableJson(plan)}\n`;
}

export function formatApplyPlan(plan: CatalogueApplyPlan, execute = false): string {
  const line = (label: string, values: Record<ApplyAction, number>) => `${label}: CREATE ${values.CREATE}, UPDATE ${values.UPDATE}, UNCHANGED ${values.UNCHANGED}, DEFER ${values.DEFER}`;
  return [
    `QuoteOS guarded catalogue apply plan`,
    `Source: ${plan.sourceFile}`,
    `Workbook SHA-256: ${plan.fileHash}`,
    `Decision SHA-256: ${plan.decisionHash}`,
    `Decision file SHA-256: ${plan.decisionFileHash}`,
    "",
    line("CanonicalItems", plan.summary.canonicalItems),
    line("CommercialOfferings", plan.summary.commercialOfferings),
    line("Aliases", plan.summary.aliases),
    line("SourceMappings", plan.summary.sourceMappings),
    line("Prices", plan.summary.prices),
    `Deferred source rows: ${plan.summary.deferredSourceRows}`,
    `Rejected source rows: ${plan.summary.rejectedSourceRows}`,
    `Deferred aliases: ${plan.summary.deferredAliases}`,
    `Warnings: ${plan.summary.warnings}; errors: ${plan.summary.errors}`,
    `City values ignored for active pricing: ${plan.summary.cityValuesIgnored}`,
    "",
    execute ? "EXPLICIT --apply PRESENT — this plan was submitted transactionally." : "DRY RUN — pass --apply to execute this plan transactionally.",
  ].join("\n");
}
