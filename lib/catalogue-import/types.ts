export const MASTER_PARSER_VERSION = "1.0.0";

export type CellValue = string | number | boolean | Date | null;
export type NormalizedUnit =
  | "M"
  | "FT"
  | "SQ_M"
  | "SQ_FT"
  | "RFT"
  | "CBM"
  | "NOS"
  | "DAY"
  | "DUTY"
  | "LITRE"
  | "SET"
  | "LUMPSUM";
export type CatalogueDomain = "VC" | "OPS" | "POWER" | "TECH" | "OTHER";
export type MappingState = "MAPPED" | "UNMAPPED" | "AMBIGUOUS" | "INVALID";
export type RateState = "POSITIVE" | "ZERO" | "BLANK" | "INVALID";
export type CandidateAction = "CREATE" | "UPDATE" | "UNCHANGED" | "CONFLICT" | "NOT_COMPARED";
export type Severity = "WARNING" | "ERROR";

export interface WorkbookSheet {
  name: string;
  rows: CellValue[][];
}

export interface RawSourceRow {
  sheet: string;
  rowNumber: number;
  values: Record<string, CellValue>;
  rowHash: string;
}

export interface ParsedRate {
  raw: CellValue;
  state: RateState;
  amountPaise: number | null;
}

export interface UnitPreview {
  raw: string | null;
  normalized: NormalizedUnit | null;
  state: "NORMALIZED" | "UNKNOWN_UNIT" | "BLANK";
}

export interface RateChartRow {
  sourceCode: string | null;
  sourceDescription: string | null;
  category: string | null;
  sourceSection: string | null;
  candidateDomain: CatalogueDomain;
  rawDaysApplies: CellValue;
  candidateDurationBasis: "ONE_OFF" | "VC_CHARGE_DAYS" | "OPS_CHARGE_DAYS" | "POWER_CHARGE_DAYS" | null;
  durationWarning: string | null;
  unit: UnitPreview;
  toClient: ParsedRate;
  toVendor: ParsedRate;
  cityValues: Record<string, ParsedRate>;
  source: RawSourceRow;
}

export interface LookupRow {
  sourceCode: string | null;
  sourceDescription: string | null;
  mapsTo: string | null;
  parentCode: string | null;
  tags: string | null;
  category: string | null;
  source: RawSourceRow;
}

export interface CanonicalCandidate {
  sourceCode: string | null;
  canonicalCode: string | null;
  canonicalName: string | null;
  state: MappingState;
  reason: string;
  domain: CatalogueDomain;
  lookupRows: number[];
  action: CandidateAction;
}

export interface SourceMappingCandidate {
  sourceSystem: "CAV_MASTER_WORKBOOK";
  sourceSheet: "RateChart";
  sourceRow: number;
  sourceCode: string | null;
  sourceDescription: string | null;
  canonicalCode: string | null;
  mappingState: MappingState;
  action: CandidateAction;
}

export interface AliasCandidate {
  targetCanonicalCode: string;
  originalText: string;
  normalizedText: string;
  sourceCode: string;
  conflict: boolean;
}

export interface OfferingCandidate {
  code: string;
  name: string;
  canonicalCode: string | null;
  mappingState: MappingState;
  billingUnit: NormalizedUnit | null;
  candidateQuantityBasis: "COUNT" | "AREA_LW" | "AREA_LH" | "LINEAR" | "VOLUME" | "HEADCOUNT_DUTY" | "FIXED" | "MANUAL" | "GENERATOR" | null;
  candidateDurationBasis: RateChartRow["candidateDurationBasis"];
  sourceRow: number;
  action: CandidateAction;
}

export interface PriceCandidate {
  offeringCode: string;
  side: "TO_CLIENT" | "TO_VENDOR";
  scopeType: "GLOBAL";
  amountPaise: number;
  sourceRow: number;
}

export interface CityObservationCandidate {
  offeringCode: string;
  city: string;
  observedRatePaise: number;
  rateState: "POSITIVE" | "ZERO";
  sourceRow: number;
  disposition: "RATE_OBSERVATION_LATER";
}

export interface PreviewIssue {
  code: string;
  severity: Severity;
  message: string;
  sheet?: string;
  rowNumber?: number;
  sourceCode?: string | null;
}

export interface WorkbookCellIssue {
  code: "FORMULA_ERROR" | "FORMULA_MISSING_CACHED_VALUE";
  sheet: string;
  cell: string;
  value: string | null;
}

export interface DestinationSnapshot {
  canonicalItems: Map<string, { name: string; domain: CatalogueDomain }>;
  offerings: Map<string, { name: string; canonicalCode: string | null; billingUnit: NormalizedUnit | null }>;
  sourceMappings: Map<string, { canonicalCode: string | null }>;
}

export interface CataloguePreview {
  parserVersion: string;
  authorityType: "ACTIVE_COMMERCIAL_MASTER";
  sourceFile: string;
  fileHash: string;
  detectedSheets: string[];
  rows: { rateChart: number; lookup: number };
  summary: {
    uniqueSourceCodes: number;
    uniqueMappedCanonicalCodes: number;
    canonical: Record<MappingState, number>;
    offeringCandidates: number;
    rates: {
      toClient: Record<RateState, number>;
      toVendor: Record<RateState, number>;
    };
    cityValues: number;
    aliases: number;
    aliasDuplicates: number;
    aliasConflicts: number;
    unknownUnits: number;
    duplicateSourceCodes: number;
    warnings: number;
    errors: number;
    unresolved: number;
  };
  canonicalCandidates: CanonicalCandidate[];
  sourceMappings: SourceMappingCandidate[];
  aliases: AliasCandidate[];
  offeringCandidates: OfferingCandidate[];
  priceCandidates: PriceCandidate[];
  cityObservationCandidates: CityObservationCandidate[];
  warnings: PreviewIssue[];
  errors: PreviewIssue[];
  unresolved: PreviewIssue[];
  sourceRows: { rateChart: RawSourceRow[]; lookup: RawSourceRow[] };
}
