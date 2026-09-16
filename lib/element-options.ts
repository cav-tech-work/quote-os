import type { CatalogueDomain, OfferingKind, QuantityBasis, UnitCode } from "@prisma/client";

/**
 * Client-safe element vocabulary and validation shared by the Element Creator
 * form and the server-side creation flow. This module must never import Prisma.
 */

export class ElementInputError extends Error {
  constructor(message: string) { super(message); this.name = "ElementInputError"; }
}

export const PARENT_CATEGORY_OPTIONS: CatalogueDomain[] = ["VC", "OPS", "POWER", "TECH", "OTHER"];

export const ELEMENT_KIND_OPTIONS: Array<{ value: OfferingKind; label: string }> = [
  { value: "ITEM", label: "Item — physical catalogue element" },
  { value: "SERVICE", label: "Service — supplied service element" },
  { value: "PACKAGE", label: "Package — parent offering for a fixed package" },
];

export const MEASUREMENT_OPTIONS: Array<{ value: QuantityBasis; label: string }> = [
  { value: "COUNT", label: "Count — whole units" },
  { value: "LINEAR", label: "Running length × quantity" },
  { value: "AREA_LW", label: "Length × width × quantity" },
  { value: "AREA_LH", label: "Length × height × quantity" },
  { value: "VOLUME", label: "Length × width × height × quantity" },
  { value: "FIXED", label: "Fixed quantity" },
  { value: "HEADCOUNT_DUTY", label: "Personnel — headcount × duties (needs approval)" },
];

/**
 * Billing units with human-readable labels. `measurement` is only populated
 * where the unit maps to exactly one existing quantity basis; ambiguous units
 * (area, day, litre) deliberately return null so the operator chooses instead
 * of the system guessing.
 */
export const UNIT_OPTIONS: Array<{ value: UnitCode; label: string; measurement: QuantityBasis | null }> = [
  { value: "NOS", label: "Numbers (nos)", measurement: "COUNT" },
  { value: "SET", label: "Set", measurement: "COUNT" },
  { value: "LUMPSUM", label: "Lump sum", measurement: "FIXED" },
  { value: "M", label: "Metre (m)", measurement: "LINEAR" },
  { value: "FT", label: "Foot (ft)", measurement: "LINEAR" },
  { value: "RFT", label: "Running foot (rft)", measurement: "LINEAR" },
  { value: "CBM", label: "Cubic metre (m³)", measurement: "VOLUME" },
  { value: "SQ_M", label: "Square metre (m²)", measurement: null },
  { value: "SQ_FT", label: "Square foot (ft²)", measurement: null },
  { value: "DAY", label: "Day", measurement: null },
  { value: "LITRE", label: "Litre", measurement: null },
  { value: "DUTY", label: "Duty (personnel)", measurement: "HEADCOUNT_DUTY" },
];

export const ORDINARY_MEASUREMENTS: ReadonlySet<QuantityBasis> = new Set<QuantityBasis>(["COUNT", "FIXED", "AREA_LW", "AREA_LH", "LINEAR", "VOLUME"]);

export function inferMeasurement(billingUnit: string): QuantityBasis | null {
  return UNIT_OPTIONS.find((option) => option.value === billingUnit)?.measurement ?? null;
}

export function normalizeElementCode(raw: string, label: string) {
  const value = raw.trim().toUpperCase().replace(/\s+/g, "_");
  if (!value) throw new ElementInputError(`${label} is required.`);
  if (value.length > 60) throw new ElementInputError(`${label} must be 60 characters or fewer.`);
  if (!/^[A-Z0-9][A-Z0-9_]*$/.test(value)) throw new ElementInputError(`${label} may use only letters, numbers and underscores.`);
  return value;
}

export function suggestElementCode(name: string) {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
}
