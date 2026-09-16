import { COMPONENT_RECONCILIATION_VERSION, type CciLabelDecision, type ComponentReconciliationPreview, type DestinationOffering, type LookupComponent, type SourceProfile } from "./types";
import { normalizeComponentText } from "./source";

function tokenScore(left: string, right: string) {
  const a = new Set(left.split(" ").filter(Boolean));
  const b = new Set(right.split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  const overlap = [...a].filter((token) => b.has(token)).length;
  return (2 * overlap) / (a.size + b.size);
}

function values(row: LookupComponent) {
  return {
    descriptions: new Set([normalizeComponentText(row.description)]),
    mapsTo: new Set([normalizeComponentText(row.mapsTo)]),
    codes: new Set([normalizeComponentText(row.elementCode)]),
    aliases: new Set(row.tags.map(normalizeComponentText).filter(Boolean)),
  };
}

function cciDecision(label: SourceProfile["cciLabels"][number], lookupRows: LookupComponent[]): CciLabelDecision {
  const indexed = lookupRows.map((row) => ({ row, ...values(row) }));
  const exactDescription = indexed.filter((item) => item.descriptions.has(label.normalizedText));
  const exactMapsTo = indexed.filter((item) => item.mapsTo.has(label.normalizedText));
  const exactCode = indexed.filter((item) => item.codes.has(label.normalizedText));
  const exact = [...new Map([...exactDescription, ...exactMapsTo, ...exactCode].map((item) => [item.row.elementCode, item])).values()];
  const aliased = indexed.filter((item) => item.aliases.has(label.normalizedText));
  const candidates = (items: typeof indexed) => items.map(({ row }) => ({ elementCode: row.elementCode, parentCode: row.parentCode, description: row.description }));
  if (exact.length === 1) return { ...label, matchType: "EXACT_MATCH", matchedElementCode: exact[0].row.elementCode, parentCode: exact[0].row.parentCode, candidates: candidates(exact), reason: "Unique exact Description, Maps_To, or element-code match." };
  if (exact.length > 1) return { ...label, matchType: "AMBIGUOUS", matchedElementCode: null, parentCode: null, candidates: candidates(exact), reason: "The source label exactly matches more than one LookUp element." };
  if (aliased.length === 1) return { ...label, matchType: "ALIAS_MATCH", matchedElementCode: aliased[0].row.elementCode, parentCode: aliased[0].row.parentCode, candidates: candidates(aliased), reason: "Unique exact LookUp tag match." };
  if (aliased.length > 1) return { ...label, matchType: "AMBIGUOUS", matchedElementCode: null, parentCode: null, candidates: candidates(aliased), reason: "The source label is shared by tags on more than one LookUp element." };

  const scored = indexed.map((item) => {
    const evidence = [...item.descriptions, ...item.mapsTo, ...item.aliases];
    const score = Math.max(...evidence.map((value) => tokenScore(label.normalizedText, value)), 0);
    return { ...item, score };
  }).filter((item) => item.score >= 0.5).sort((a, b) => b.score - a.score || a.row.elementCode.localeCompare(b.row.elementCode));
  const top = scored[0]?.score ?? 0;
  const nearTop = scored.filter((item) => top - item.score < 0.08);
  if (nearTop.length === 1) return { ...label, matchType: "PROPOSED_MATCH", matchedElementCode: nearTop[0].row.elementCode, parentCode: nearTop[0].row.parentCode, candidates: nearTop.map(({ row, score }) => ({ elementCode: row.elementCode, parentCode: row.parentCode, description: row.description, score })), reason: "A text-similarity candidate requires human confirmation." };
  if (nearTop.length > 1) return { ...label, matchType: "AMBIGUOUS", matchedElementCode: null, parentCode: null, candidates: nearTop.map(({ row, score }) => ({ elementCode: row.elementCode, parentCode: row.parentCode, description: row.description, score })), reason: "Several text-similarity candidates require human selection." };
  return { ...label, matchType: "UNMATCHED", matchedElementCode: null, parentCode: null, candidates: [], reason: "No deterministic LookUp identity was found." };
}

export function buildComponentReconciliationPreview(profile: SourceProfile, destination: DestinationOffering[]): ComponentReconciliationPreview {
  const duplicateElementCodes = [...new Set(profile.lookupRows.map((row) => row.elementCode).filter((code, index, all) => all.indexOf(code) !== index))].sort();
  const byCode = new Map(destination.map((offering) => [offering.code, offering]));
  const catalogue = profile.lookupRows.map((row) => {
    const exact = byCode.get(row.elementCode);
    if (exact) {
      if (exact.canonicalCode === row.parentCode) return { row, state: "ALREADY_MATCHED" as const, offeringId: exact.id, offeringCode: exact.code, reason: "Element code and parent code already match." };
      return { row, state: "CONFLICT" as const, offeringId: exact.id, offeringCode: exact.code, reason: `Element code exists under parent ${exact.canonicalCode ?? "none"}, not ${row.parentCode}.` };
    }
    const targetTexts = new Set([normalizeComponentText(row.description), normalizeComponentText(row.mapsTo)]);
    // Canonical names describe the shared parent identity. They are not evidence
    // that one of its existing element offerings is the same LookUp element.
    const candidates = destination.filter((offering) => [offering.name, ...offering.aliases, ...offering.sourceDescriptions].some((value) => value && targetTexts.has(normalizeComponentText(value))));
    if (candidates.length === 1 && candidates[0].canonicalCode === row.parentCode) return { row, state: "NEEDS_CODE_LINK" as const, offeringId: candidates[0].id, offeringCode: candidates[0].code, reason: "One existing offering under the same parent has exact textual evidence." };
    if (candidates.length > 0) return { row, state: "AMBIGUOUS" as const, offeringId: null, offeringCode: null, reason: "Text evidence matches multiple or differently parented existing offerings." };
    return { row, state: "NEEDS_NEW_ELEMENT" as const, offeringId: null, offeringCode: null, reason: "No existing offering represents this element code." };
  });
  return {
    version: COMPONENT_RECONCILIATION_VERSION,
    lookupFile: profile.lookupFile,
    lookupFileHash: profile.lookupFileHash,
    cciFile: profile.cciFile,
    cciFileHash: profile.cciFileHash,
    lookupRowsConsidered: profile.lookupRows.length,
    lookupFirstRow: 2,
    lookupLastRow: 165,
    uniqueElementCodes: new Set(profile.lookupRows.map((row) => row.elementCode)).size,
    uniqueParentCodes: new Set(profile.lookupRows.map((row) => row.parentCode)).size,
    duplicateElementCodes,
    catalogue,
    cci: profile.cciLabels.map((label) => cciDecision(label, profile.lookupRows)),
    excludedCciLabels: profile.excludedCciLabels,
  };
}
