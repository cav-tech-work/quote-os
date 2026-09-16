import type { CellValue, NormalizedUnit, WorkbookSheet } from "@/lib/catalogue-import/types";

export const LOOKUP_FIRST_ROW = 2;
export const LOOKUP_LAST_ROW = 165;
export const COMPONENT_RECONCILIATION_VERSION = "quoteos-component-reconciliation-v1";

export type ComponentMatchType = "EXACT_MATCH" | "ALIAS_MATCH" | "PROPOSED_MATCH" | "AMBIGUOUS" | "UNMATCHED";
export type CatalogueReconciliationState = "ALREADY_MATCHED" | "NEEDS_CODE_LINK" | "NEEDS_NEW_ELEMENT" | "AMBIGUOUS" | "CONFLICT";

export type LookupComponent = {
  rowNumber: number;
  elementCode: string;
  parentCode: string;
  description: string;
  mapsTo: string;
  billingUnit: NormalizedUnit | null;
  rawBillingUnit: string | null;
  tags: string[];
};

export type CciComponentLabel = {
  sourceLabel: string;
  normalizedText: string;
  cities: string[];
};

export type SourceProfile = {
  lookupFile: string;
  lookupFileHash: string;
  cciFile: string;
  cciFileHash: string;
  lookupRows: LookupComponent[];
  cciLabels: CciComponentLabel[];
  excludedCciLabels: CciComponentLabel[];
  lookupSheets: WorkbookSheet[];
  cciSheets: WorkbookSheet[];
};

export type DestinationOffering = {
  id: string;
  code: string;
  name: string;
  canonicalCode: string | null;
  canonicalName: string | null;
  aliases: string[];
  sourceDescriptions: string[];
};

export type CatalogueElementDecision = {
  row: LookupComponent;
  state: CatalogueReconciliationState;
  offeringId: string | null;
  offeringCode: string | null;
  reason: string;
};

export type CciLabelDecision = CciComponentLabel & {
  matchType: ComponentMatchType;
  matchedElementCode: string | null;
  parentCode: string | null;
  candidates: Array<{ elementCode: string; parentCode: string; description: string; score?: number }>;
  reason: string;
};

export type ComponentReconciliationPreview = {
  version: string;
  lookupFile: string;
  lookupFileHash: string;
  cciFile: string;
  cciFileHash: string;
  lookupRowsConsidered: number;
  lookupFirstRow: number;
  lookupLastRow: number;
  uniqueElementCodes: number;
  uniqueParentCodes: number;
  duplicateElementCodes: string[];
  catalogue: CatalogueElementDecision[];
  cci: CciLabelDecision[];
  excludedCciLabels: CciComponentLabel[];
};

export type ReconciliationWorkbookSheet = { name: string; rows: CellValue[][] };
