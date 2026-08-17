import type { UnitCode } from "@prisma/client";
import { exact, ExactDecimal } from "./decimal";

export type UnitDimension = "LENGTH" | "AREA" | "LINEAR_LENGTH" | "VOLUME" | "COUNT" | "TIME" | "VOLUME_LIQUID" | "SET" | "FIXED";

export const UNIT_DIMENSIONS: Record<UnitCode, UnitDimension> = {
  M: "LENGTH", FT: "LENGTH", SQ_M: "AREA", SQ_FT: "AREA", RFT: "LINEAR_LENGTH", CBM: "VOLUME",
  NOS: "COUNT", DAY: "TIME", DUTY: "TIME", LITRE: "VOLUME_LIQUID", SET: "SET", LUMPSUM: "FIXED",
};

// International foot: 1 ft = 0.3048 m exactly. These rational constants avoid rounded intermediate conversions.
export const METRES_PER_FOOT = exact(381n, 1250n);
export const FEET_PER_METRE = exact(1250n, 381n);
export const SQUARE_FEET_PER_SQUARE_METRE = exact(1_562_500n, 145_161n);

export type UnitConversionResult = { state: "CONVERTED"; value: ExactDecimal } | { state: "INVALID_VALUE" | "INCOMPATIBLE_UNIT" };

export function convertUnit(raw: string, from: UnitCode, to: UnitCode): UnitConversionResult {
  const value = ExactDecimal.parse(raw); if (!value || value.isNegative()) return { state: "INVALID_VALUE" };
  if (from === to) return { state: "CONVERTED", value };
  if ((from === "M" || from === "FT") && (to === "M" || to === "FT" || to === "RFT")) {
    const converted = metresToLinearBilling(lengthToMetres(value, from), to); return converted ? { state: "CONVERTED", value: converted } : { state: "INCOMPATIBLE_UNIT" };
  }
  if ((from === "SQ_M" || from === "SQ_FT") && (to === "SQ_M" || to === "SQ_FT")) {
    const squareMetres = from === "SQ_M" ? value : value.divide(SQUARE_FEET_PER_SQUARE_METRE);
    const converted = squareMetresToBilling(squareMetres, to); return converted ? { state: "CONVERTED", value: converted } : { state: "INCOMPATIBLE_UNIT" };
  }
  return { state: "INCOMPATIBLE_UNIT" };
}

export function lengthToMetres(value: ExactDecimal, unit: "M" | "FT") { return unit === "M" ? value : value.multiply(METRES_PER_FOOT); }
export function metresToLinearBilling(value: ExactDecimal, target: UnitCode) {
  if (target === "M") return value;
  if (target === "FT" || target === "RFT") return value.multiply(FEET_PER_METRE);
  return null;
}
export function squareMetresToBilling(value: ExactDecimal, target: UnitCode) {
  if (target === "SQ_M") return value;
  if (target === "SQ_FT") return value.multiply(SQUARE_FEET_PER_SQUARE_METRE);
  return null;
}
export function cubicMetresToBilling(value: ExactDecimal, target: UnitCode) { return target === "CBM" ? value : null; }
