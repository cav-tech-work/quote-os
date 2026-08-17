import { createHash } from "node:crypto";
import type { CatalogueDomain, CellValue, NormalizedUnit, ParsedRate, UnitPreview } from "./types";

export function cleanSourceText(value: CellValue): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export function normalizeCode(value: CellValue): string | null {
  const text = cleanSourceText(value);
  return text ? text.toUpperCase() : null;
}

export function isValidSourceCode(code: string | null): boolean {
  return Boolean(code && /^[A-Z0-9][A-Z0-9_.-]*$/.test(code));
}

export function normalizeAlias(value: string): string {
  return value.trim().toLocaleLowerCase("en-IN").replace(/\s+/g, " ");
}

export function splitAliases(value: string | null): Array<{ originalText: string; normalizedText: string }> {
  if (!value) return [];
  const result = new Map<string, string>();
  for (const token of value.split(",")) {
    const originalText = token.trim().replace(/\s+/g, " ");
    if (!originalText) continue;
    const normalizedText = normalizeAlias(originalText);
    if (!result.has(normalizedText)) result.set(normalizedText, originalText);
  }
  return [...result].map(([normalizedText, originalText]) => ({ originalText, normalizedText }));
}

const unitMap = new Map<string, NormalizedUnit>([
  ["m", "M"],
  ["meter", "M"],
  ["metre", "M"],
  ["ft", "FT"],
  ["foot", "FT"],
  ["feet", "FT"],
  ["sq m", "SQ_M"],
  ["sqm", "SQ_M"],
  ["sq mtr", "SQ_M"],
  ["sq metre", "SQ_M"],
  ["sq ft", "SQ_FT"],
  ["sqft", "SQ_FT"],
  ["square feet", "SQ_FT"],
  ["rft", "RFT"],
  ["r ft", "RFT"],
  ["running ft", "RFT"],
  ["cbm", "CBM"],
  ["nos", "NOS"],
  ["no", "NOS"],
  ["number", "NOS"],
  ["day", "DAY"],
  ["days", "DAY"],
  ["duty", "DUTY"],
  ["nos/duty", "DUTY"],
  ["nos per duty", "DUTY"],
  ["litre", "LITRE"],
  ["liter", "LITRE"],
  ["set", "SET"],
  ["lumpsum", "LUMPSUM"],
  ["lump sum", "LUMPSUM"],
]);

export function normalizeUnit(value: CellValue): UnitPreview {
  const raw = cleanSourceText(value);
  if (!raw) return { raw: null, normalized: null, state: "BLANK" };
  const normalized = unitMap.get(raw.toLocaleLowerCase("en-IN").replace(/[._-]+/g, " ").replace(/\s+/g, " ")) ?? null;
  return normalized
    ? { raw, normalized, state: "NORMALIZED" }
    : { raw, normalized: null, state: "UNKNOWN_UNIT" };
}

export function parseRate(value: CellValue): ParsedRate {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    return { raw: value ?? null, state: "BLANK", amountPaise: null };
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return { raw: value, state: "INVALID", amountPaise: null };
  }
  const amountPaise = Math.round((value + Number.EPSILON) * 100);
  return { raw: value, state: value === 0 ? "ZERO" : "POSITIVE", amountPaise };
}

export function domainFromSection(section: string | null): CatalogueDomain {
  const normalized = section?.toUpperCase() ?? "";
  if (normalized.includes("VENUE CONSTRUCTION")) return "VC";
  if (normalized.includes("OPERATION")) return "OPS";
  if (normalized.includes("POWER")) return "POWER";
  if (normalized.includes("TECH")) return "TECH";
  return "OTHER";
}

export function stableValue(value: CellValue): string | number | boolean | null {
  return value instanceof Date ? value.toISOString() : value;
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
