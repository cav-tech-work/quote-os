import { isValidSourceCode, normalizeAlias, splitAliases, stableJson } from "./normalize";
import { MASTER_PARSER_VERSION } from "./types";
import type {
  AliasCandidate,
  CandidateAction,
  CanonicalCandidate,
  CataloguePreview,
  DestinationSnapshot,
  LookupRow,
  MappingState,
  OfferingCandidate,
  PreviewIssue,
  RateChartRow,
  WorkbookCellIssue,
} from "./types";

function frequency(values: Array<string | null>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function canonicalAction(candidate: CanonicalCandidate, destination?: DestinationSnapshot): CandidateAction {
  if (!destination || !candidate.canonicalCode || candidate.state !== "MAPPED") return destination ? "CONFLICT" : "NOT_COMPARED";
  const current = destination.canonicalItems.get(candidate.canonicalCode);
  if (!current) return "CREATE";
  if (current.name === candidate.canonicalName && current.domain === candidate.domain) return "UNCHANGED";
  return "UPDATE";
}

function offeringAction(candidate: OfferingCandidate, destination?: DestinationSnapshot): CandidateAction {
  if (!destination) return "NOT_COMPARED";
  const current = destination.offerings.get(candidate.code);
  if (!current) return "CREATE";
  if (current.name === candidate.name && current.canonicalCode === candidate.canonicalCode && current.billingUnit === candidate.billingUnit) return "UNCHANGED";
  return "UPDATE";
}

function quantityBasis(row: RateChartRow): OfferingCandidate["candidateQuantityBasis"] {
  switch (row.unit.normalized) {
    case "NOS": return "COUNT";
    case "RFT": return "LINEAR";
    case "CBM": return "VOLUME";
    case "DUTY": return "HEADCOUNT_DUTY";
    case "LUMPSUM": return "FIXED";
    case "LITRE":
    case "SET":
    case "DAY": return "COUNT";
    default: return null;
  }
}

function buildCanonicalCandidate(
  row: RateChartRow,
  lookupMatches: LookupRow[],
  conflictingParentNames: Set<string>,
  destination?: DestinationSnapshot,
): CanonicalCandidate {
  let candidate: CanonicalCandidate;
  if (!isValidSourceCode(row.sourceCode)) {
    candidate = { sourceCode: row.sourceCode, canonicalCode: null, canonicalName: null, state: "INVALID", reason: "Source code is missing or invalid", domain: row.candidateDomain, lookupRows: [], action: "NOT_COMPARED" };
  } else if (lookupMatches.length === 0) {
    candidate = { sourceCode: row.sourceCode, canonicalCode: null, canonicalName: null, state: "UNMAPPED", reason: "No LookUp row exists for the source code", domain: row.candidateDomain, lookupRows: [], action: "NOT_COMPARED" };
  } else {
    const interpretations = new Map<string, { canonicalCode: string; canonicalName: string }>();
    for (const lookup of lookupMatches) {
      const canonicalCode = lookup.parentCode ?? (lookup.mapsTo ? lookup.sourceCode : null);
      const canonicalName = lookup.mapsTo ?? (lookup.parentCode ? lookup.sourceDescription : null);
      if (canonicalCode && canonicalName) interpretations.set(`${canonicalCode}\u0000${normalizeAlias(canonicalName)}`, { canonicalCode, canonicalName });
    }
    const interpretation = interpretations.size === 1 ? [...interpretations.values()][0] : null;
    if (!interpretation) {
      candidate = {
        sourceCode: row.sourceCode,
        canonicalCode: null,
        canonicalName: null,
        state: interpretations.size > 1 ? "AMBIGUOUS" : "UNMAPPED",
        reason: interpretations.size > 1 ? "LookUp rows disagree on canonical interpretation" : "LookUp has no usable Parent_Code/Maps_To interpretation",
        domain: row.candidateDomain,
        lookupRows: lookupMatches.map((lookup) => lookup.source.rowNumber),
        action: "NOT_COMPARED",
      };
    } else if (conflictingParentNames.has(interpretation.canonicalCode)) {
      candidate = {
        sourceCode: row.sourceCode,
        ...interpretation,
        state: "AMBIGUOUS",
        reason: `Parent_Code ${interpretation.canonicalCode} is associated with conflicting Maps_To names`,
        domain: row.candidateDomain,
        lookupRows: lookupMatches.map((lookup) => lookup.source.rowNumber),
        action: "NOT_COMPARED",
      };
    } else {
      candidate = {
        sourceCode: row.sourceCode,
        ...interpretation,
        state: "MAPPED",
        reason: lookupMatches.some((lookup) => lookup.parentCode) ? "Explicit Parent_Code and Maps_To evidence" : "Explicit Maps_To evidence; source code retained as canonical candidate code",
        domain: row.candidateDomain,
        lookupRows: lookupMatches.map((lookup) => lookup.source.rowNumber),
        action: "NOT_COMPARED",
      };
    }
  }
  candidate.action = canonicalAction(candidate, destination);
  return candidate;
}

function issueSort(a: PreviewIssue, b: PreviewIssue): number {
  return (a.sheet ?? "").localeCompare(b.sheet ?? "") || (a.rowNumber ?? 0) - (b.rowNumber ?? 0) || a.code.localeCompare(b.code) || a.message.localeCompare(b.message);
}

export function buildCataloguePreview(input: {
  sourceFile: string;
  fileHash: string;
  detectedSheets: string[];
  rateChartRows: RateChartRow[];
  lookupRows: LookupRow[];
  workbookCellIssues?: WorkbookCellIssue[];
  destination?: DestinationSnapshot;
}): CataloguePreview {
  const warnings: PreviewIssue[] = [];
  const errors: PreviewIssue[] = [];
  const unresolved: PreviewIssue[] = [];
  for (const issue of input.workbookCellIssues ?? []) {
    const previewIssue: PreviewIssue = {
      code: issue.code,
      severity: issue.code === "FORMULA_ERROR" ? "ERROR" : "WARNING",
      message: issue.code === "FORMULA_ERROR"
        ? `Formula error ${issue.value ?? "(unknown)"} at ${issue.cell}`
        : `Formula at ${issue.cell} has no cached value`,
      sheet: issue.sheet,
      rowNumber: Number(issue.cell.match(/\d+/)?.[0] ?? 0) || undefined,
    };
    (previewIssue.severity === "ERROR" ? errors : warnings).push(previewIssue);
  }
  const lookupByCode = new Map<string, LookupRow[]>();
  for (const row of input.lookupRows) {
    if (!row.sourceCode) continue;
    const rows = lookupByCode.get(row.sourceCode) ?? [];
    rows.push(row);
    lookupByCode.set(row.sourceCode, rows);
  }

  const parentNames = new Map<string, Set<string>>();
  for (const row of input.lookupRows) {
    if (!row.parentCode || !row.mapsTo) continue;
    const names = parentNames.get(row.parentCode) ?? new Set<string>();
    names.add(normalizeAlias(row.mapsTo));
    parentNames.set(row.parentCode, names);
  }
  const conflictingParentNames = new Set([...parentNames].filter(([, names]) => names.size > 1).map(([code]) => code));
  const sourceCodeCounts = frequency(input.rateChartRows.map((row) => row.sourceCode));
  const duplicateSourceCodes = new Set([...sourceCodeCounts].filter(([, count]) => count > 1).map(([code]) => code));

  const canonicalCandidates = input.rateChartRows.map((row) => {
    const candidate = buildCanonicalCandidate(row, row.sourceCode ? lookupByCode.get(row.sourceCode) ?? [] : [], conflictingParentNames, input.destination);
    if (candidate.state !== "MAPPED") {
      unresolved.push({ code: `CANONICAL_${candidate.state}`, severity: candidate.state === "INVALID" ? "ERROR" : "WARNING", message: candidate.reason, sheet: "RateChart", rowNumber: row.source.rowNumber, sourceCode: row.sourceCode });
    }
    return candidate;
  });

  input.rateChartRows.forEach((row) => {
    if (!isValidSourceCode(row.sourceCode)) errors.push({ code: "INVALID_SOURCE_CODE", severity: "ERROR", message: "Source code is missing or has an unsupported format", sheet: "RateChart", rowNumber: row.source.rowNumber, sourceCode: row.sourceCode });
    if (row.sourceCode && duplicateSourceCodes.has(row.sourceCode)) warnings.push({ code: "DUPLICATE_SOURCE_CODE", severity: "WARNING", message: `Source code ${row.sourceCode} occurs ${sourceCodeCounts.get(row.sourceCode)} times in RateChart`, sheet: "RateChart", rowNumber: row.source.rowNumber, sourceCode: row.sourceCode });
    if (row.unit.state === "UNKNOWN_UNIT") warnings.push({ code: "UNKNOWN_UNIT", severity: "WARNING", message: `Unknown unit: ${row.unit.raw}`, sheet: "RateChart", rowNumber: row.source.rowNumber, sourceCode: row.sourceCode });
    if (row.durationWarning) warnings.push({ code: "UNCERTAIN_DURATION", severity: "WARNING", message: row.durationWarning, sheet: "RateChart", rowNumber: row.source.rowNumber, sourceCode: row.sourceCode });
    for (const [side, rate] of [["ToClients", row.toClient], ["ToVendors", row.toVendor]] as const) {
      if (rate.state === "INVALID") errors.push({ code: "INVALID_RATE", severity: "ERROR", message: `${side} contains an invalid or negative rate: ${String(rate.raw)}`, sheet: "RateChart", rowNumber: row.source.rowNumber, sourceCode: row.sourceCode });
    }
    for (const [city, rate] of Object.entries(row.cityValues)) {
      if (rate.state === "INVALID") warnings.push({ code: "INVALID_CITY_VALUE", severity: "WARNING", message: `${city} contains an invalid observational value: ${String(rate.raw)}`, sheet: "RateChart", rowNumber: row.source.rowNumber, sourceCode: row.sourceCode });
    }
  });

  const offeringCandidates = input.rateChartRows.map((row, index) => {
    const canonical = canonicalCandidates[index];
    const candidate: OfferingCandidate = {
      code: row.sourceCode ?? `INVALID_ROW_${row.source.rowNumber}`,
      name: row.sourceDescription ?? row.sourceCode ?? `Invalid RateChart row ${row.source.rowNumber}`,
      canonicalCode: canonical.state === "MAPPED" ? canonical.canonicalCode : null,
      mappingState: canonical.state,
      billingUnit: row.unit.normalized,
      candidateQuantityBasis: quantityBasis(row),
      candidateDurationBasis: row.candidateDurationBasis,
      sourceRow: row.source.rowNumber,
      action: "NOT_COMPARED",
    };
    candidate.action = offeringAction(candidate, input.destination);
    return candidate;
  });

  const priceCandidates = input.rateChartRows.flatMap((row, index) => {
    const offeringCode = offeringCandidates[index].code;
    return ([
      ["TO_CLIENT", row.toClient],
      ["TO_VENDOR", row.toVendor],
    ] as const).flatMap(([side, rate]) => rate.amountPaise === null || rate.state === "INVALID" ? [] : [{ offeringCode, side, scopeType: "GLOBAL" as const, amountPaise: rate.amountPaise, sourceRow: row.source.rowNumber }]);
  });

  const cityObservationCandidates = input.rateChartRows.flatMap((row, index) => Object.entries(row.cityValues).flatMap(([city, rate]) =>
    rate.amountPaise === null || rate.state === "INVALID" ? [] : [{ offeringCode: offeringCandidates[index].code, city, observedRatePaise: rate.amountPaise, rateState: rate.state as "POSITIVE" | "ZERO", sourceRow: row.source.rowNumber, disposition: "RATE_OBSERVATION_LATER" as const }],
  ));

  const aliasOccurrences: Array<Omit<AliasCandidate, "conflict">> = [];
  input.rateChartRows.forEach((rateRow, index) => {
    const canonical = canonicalCandidates[index];
    if (canonical.state !== "MAPPED" || !canonical.canonicalCode || !rateRow.sourceCode) return;
    for (const lookup of lookupByCode.get(rateRow.sourceCode) ?? []) {
      const sourceAliases = [
        ...(lookup.sourceDescription ? [{ originalText: lookup.sourceDescription, normalizedText: normalizeAlias(lookup.sourceDescription) }] : []),
        ...splitAliases(lookup.tags),
      ];
      for (const alias of sourceAliases) aliasOccurrences.push({ targetCanonicalCode: canonical.canonicalCode, sourceCode: rateRow.sourceCode, ...alias });
    }
  });
  const aliasTargets = new Map<string, Set<string>>();
  for (const alias of aliasOccurrences) {
    const targets = aliasTargets.get(alias.normalizedText) ?? new Set<string>();
    targets.add(alias.targetCanonicalCode);
    aliasTargets.set(alias.normalizedText, targets);
  }
  const aliasDuplicates = aliasOccurrences.length - new Set(aliasOccurrences.map((alias) => `${alias.targetCanonicalCode}\u0000${alias.normalizedText}`)).size;
  const aliasConflicts = new Set([...aliasTargets].filter(([, targets]) => targets.size > 1).map(([text]) => text));
  const aliases = [...new Map(aliasOccurrences.map((alias) => [`${alias.targetCanonicalCode}\u0000${alias.normalizedText}`, { ...alias, conflict: aliasConflicts.has(alias.normalizedText) }])).values()]
    .sort((a, b) => a.targetCanonicalCode.localeCompare(b.targetCanonicalCode) || a.normalizedText.localeCompare(b.normalizedText));
  for (const normalizedText of [...aliasConflicts].sort()) warnings.push({ code: "ALIAS_CONFLICT", severity: "WARNING", message: `Alias “${normalizedText}” points to multiple canonical candidates: ${[...(aliasTargets.get(normalizedText) ?? [])].sort().join(", ")}`, sheet: "LookUp" });

  const sourceMappings = input.rateChartRows.map((row, index) => ({
    sourceSystem: "CAV_MASTER_WORKBOOK" as const,
    sourceSheet: "RateChart" as const,
    sourceRow: row.source.rowNumber,
    sourceCode: row.sourceCode,
    sourceDescription: row.sourceDescription,
    canonicalCode: canonicalCandidates[index].state === "MAPPED" ? canonicalCandidates[index].canonicalCode : null,
    mappingState: canonicalCandidates[index].state,
    action: input.destination && row.sourceCode
      ? (() => {
          const current = input.destination!.sourceMappings.get(`CAV_MASTER_WORKBOOK\u0000RateChart\u0000${row.sourceCode}`);
          if (!current) return "CREATE";
          return current.canonicalCode === (canonicalCandidates[index].state === "MAPPED" ? canonicalCandidates[index].canonicalCode : null) ? "UNCHANGED" : "CONFLICT";
        })() as CandidateAction
      : "NOT_COMPARED" as CandidateAction,
  }));

  warnings.sort(issueSort);
  errors.sort(issueSort);
  unresolved.sort(issueSort);
  const rateCount = (side: "toClient" | "toVendor") => Object.fromEntries(["POSITIVE", "ZERO", "BLANK", "INVALID"].map((state) => [state, input.rateChartRows.filter((row) => row[side].state === state).length])) as CataloguePreview["summary"]["rates"][typeof side];
  const canonicalCount = Object.fromEntries(["MAPPED", "UNMAPPED", "AMBIGUOUS", "INVALID"].map((state) => [state, canonicalCandidates.filter((candidate) => candidate.state === state).length])) as Record<MappingState, number>;

  return {
    parserVersion: MASTER_PARSER_VERSION,
    authorityType: "ACTIVE_COMMERCIAL_MASTER",
    sourceFile: input.sourceFile,
    fileHash: input.fileHash,
    detectedSheets: [...input.detectedSheets],
    rows: { rateChart: input.rateChartRows.length, lookup: input.lookupRows.length },
    summary: {
      uniqueSourceCodes: new Set(input.rateChartRows.map((row) => row.sourceCode).filter(Boolean)).size,
      uniqueMappedCanonicalCodes: new Set(canonicalCandidates.filter((candidate) => candidate.state === "MAPPED").map((candidate) => candidate.canonicalCode).filter(Boolean)).size,
      canonical: canonicalCount,
      offeringCandidates: offeringCandidates.length,
      rates: { toClient: rateCount("toClient"), toVendor: rateCount("toVendor") },
      cityValues: cityObservationCandidates.length,
      aliases: aliases.length,
      aliasDuplicates,
      aliasConflicts: aliasConflicts.size,
      unknownUnits: input.rateChartRows.filter((row) => row.unit.state === "UNKNOWN_UNIT").length,
      duplicateSourceCodes: duplicateSourceCodes.size,
      warnings: warnings.length,
      errors: errors.length,
      unresolved: unresolved.length,
    },
    canonicalCandidates,
    sourceMappings,
    aliases,
    offeringCandidates,
    priceCandidates,
    cityObservationCandidates,
    warnings,
    errors,
    unresolved,
    sourceRows: { rateChart: input.rateChartRows.map((row) => row.source), lookup: input.lookupRows.map((row) => row.source) },
  };
}

export function semanticPreviewJson(preview: CataloguePreview): string {
  return `${stableJson(preview)}\n`;
}

export function formatPreviewSummary(preview: CataloguePreview): string {
  const { summary } = preview;
  return [
    `QuoteOS catalogue preview (parser ${preview.parserVersion})`,
    `Source: ${preview.sourceFile}`,
    `SHA-256: ${preview.fileHash}`,
    `Authority: ${preview.authorityType}`,
    `Sheets: ${preview.detectedSheets.join(", ")}`,
    "",
    `RateChart rows: ${preview.rows.rateChart}`,
    `LookUp rows: ${preview.rows.lookup}`,
    `Unique source codes: ${summary.uniqueSourceCodes}`,
    `Unique mapped canonical codes: ${summary.uniqueMappedCanonicalCodes}`,
    `Canonical candidates: ${summary.canonical.MAPPED} mapped, ${summary.canonical.UNMAPPED} unmapped, ${summary.canonical.AMBIGUOUS} ambiguous, ${summary.canonical.INVALID} invalid`,
    `Offering candidates: ${summary.offeringCandidates}`,
    `TO_CLIENT: ${summary.rates.toClient.POSITIVE} positive, ${summary.rates.toClient.ZERO} zero, ${summary.rates.toClient.BLANK} blank, ${summary.rates.toClient.INVALID} invalid`,
    `TO_VENDOR: ${summary.rates.toVendor.POSITIVE} positive, ${summary.rates.toVendor.ZERO} zero, ${summary.rates.toVendor.BLANK} blank, ${summary.rates.toVendor.INVALID} invalid`,
    `City values detected (observation later): ${summary.cityValues}`,
    `Aliases: ${summary.aliases} (${summary.aliasDuplicates} duplicate occurrences, ${summary.aliasConflicts} conflicts)`,
    `Unknown units: ${summary.unknownUnits}`,
    `Duplicate source codes: ${summary.duplicateSourceCodes}`,
    `Warnings: ${summary.warnings}; errors: ${summary.errors}; unresolved mappings: ${summary.unresolved}`,
    "",
    "PREVIEW ONLY — no database writes or catalogue mutations were performed.",
  ].join("\n");
}
