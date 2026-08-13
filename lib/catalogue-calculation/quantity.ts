import type { UnitCode } from "@prisma/client";
import { ExactDecimal, exact } from "./decimal";
import { cubicMetresToBilling, lengthToMetres, metresToLinearBilling, squareMetresToBilling } from "./units";
import type { CalculationIssue, LengthMeasurement, MeasurementConfiguration, OfferingCalculationIdentity, QuantityResult } from "./types";

const issue = (code: CalculationIssue["code"], field: string | undefined, message: string): CalculationIssue => ({ code, field, message });
function decimal(value: string | undefined, field: string, quantity = false): ExactDecimal | CalculationIssue {
  if (value === undefined) return issue(quantity ? "MISSING_QUANTITY" : "INVALID_MEASUREMENT", field, `${field} is required.`);
  const parsed = ExactDecimal.parse(value); if (!parsed) return issue(quantity ? "INVALID_QUANTITY" : "INVALID_MEASUREMENT", field, `${field} must be a non-negative decimal string.`);
  if (parsed.isNegative()) return issue(quantity ? "INVALID_QUANTITY" : "NEGATIVE_DIMENSION", field, `${field} cannot be negative.`);
  return parsed;
}
function measurement(value: LengthMeasurement | undefined, field: "length" | "width" | "height"): ExactDecimal | CalculationIssue {
  if (!value) return issue(`MISSING_${field.toUpperCase()}` as CalculationIssue["code"], field, `${field} is required.`);
  const parsed = decimal(value.value, field); return parsed instanceof ExactDecimal ? lengthToMetres(parsed, value.unit) : parsed;
}
function success(value: ExactDecimal, billingUnit: UnitCode, normalizedConfiguration: Record<string, string>): QuantityResult {
  return { state: "QUANTITY_CALCULATED", billingUnit, billableQuantity: value.toFixed(12), exactNumerator: String(value.numerator), exactDenominator: String(value.denominator), normalizedConfiguration };
}
function incompatible(basis: string, billingUnit: UnitCode): QuantityResult { return { state: "CONFIGURATION_INCOMPLETE", issues: [issue("INCOMPATIBLE_UNIT", "billingUnit", `${basis} is incompatible with ${billingUnit}.`)] }; }
function failed(...values: Array<ExactDecimal | CalculationIssue>) { const issues = values.filter((value): value is CalculationIssue => !(value instanceof ExactDecimal)); return issues.length ? { state: "CONFIGURATION_INCOMPLETE" as const, issues } : null; }

export function calculateBillableQuantity(offering: OfferingCalculationIdentity, input: MeasurementConfiguration): QuantityResult {
  if (!offering.quantityBasis) return { state: "CALCULATION_SEMANTICS_UNAVAILABLE", issues: [issue("CALCULATION_SEMANTICS_UNAVAILABLE", "quantityBasis", `Offering ${offering.code} has no approved quantity basis.`)] };
  if (!offering.billingUnit) return { state: "CALCULATION_SEMANTICS_UNAVAILABLE", issues: [issue("MISSING_BILLING_UNIT", "billingUnit", `Offering ${offering.code} has no billing unit.`)] };
  const quantity = decimal(input.quantity, "quantity", true); const quantityFailure = failed(quantity); if (quantityFailure) return quantityFailure;
  if (["COUNT", "FIXED"].includes(offering.quantityBasis) && !(quantity as ExactDecimal).isInteger()) return { state: "CONFIGURATION_INCOMPLETE", issues: [issue("INVALID_QUANTITY", "quantity", "COUNT and FIXED quantities must be whole units.")] };
  if (offering.quantityBasis === "COUNT") return offering.billingUnit === "NOS" ? success(quantity as ExactDecimal, offering.billingUnit, { quantity: (quantity as ExactDecimal).toFixed() }) : incompatible("COUNT", offering.billingUnit);
  if (offering.quantityBasis === "FIXED") return ["SET", "LUMPSUM", "NOS"].includes(offering.billingUnit) ? success(quantity as ExactDecimal, offering.billingUnit, { quantity: (quantity as ExactDecimal).toFixed() }) : incompatible("FIXED", offering.billingUnit);
  if (["HEADCOUNT_DUTY", "GENERATOR", "MANUAL"].includes(offering.quantityBasis)) return { state: "MANUAL_REQUIRED", issues: [issue("UNSUPPORTED_QUANTITY_BASIS", "quantityBasis", `${offering.quantityBasis} is outside Phase 4 calculation scope.`)] };
  const length = measurement(input.length, "length");
  if (offering.quantityBasis === "LINEAR") { const failure = failed(length); if (failure) return failure; const result = metresToLinearBilling((length as ExactDecimal).multiply(quantity as ExactDecimal), offering.billingUnit); return result ? success(result, offering.billingUnit, { lengthM: (length as ExactDecimal).toFixed(), quantity: (quantity as ExactDecimal).toFixed() }) : incompatible("LINEAR", offering.billingUnit); }
  const widthOrHeight = offering.quantityBasis === "AREA_LH" ? measurement(input.height, "height") : measurement(input.width, "width");
  if (["AREA_LW", "AREA_LH"].includes(offering.quantityBasis)) { const failure = failed(length, widthOrHeight); if (failure) return failure; const area = (length as ExactDecimal).multiply(widthOrHeight as ExactDecimal).multiply(quantity as ExactDecimal); const result = squareMetresToBilling(area, offering.billingUnit); return result ? success(result, offering.billingUnit, { lengthM: (length as ExactDecimal).toFixed(), [offering.quantityBasis === "AREA_LH" ? "heightM" : "widthM"]: (widthOrHeight as ExactDecimal).toFixed(), quantity: (quantity as ExactDecimal).toFixed() }) : incompatible(offering.quantityBasis, offering.billingUnit); }
  if (offering.quantityBasis === "VOLUME") { const width = measurement(input.width, "width"), height = measurement(input.height, "height"); const failure = failed(length, width, height); if (failure) return failure; const volume = (length as ExactDecimal).multiply(width as ExactDecimal).multiply(height as ExactDecimal).multiply(quantity as ExactDecimal); const result = cubicMetresToBilling(volume, offering.billingUnit); return result ? success(result, offering.billingUnit, { lengthM: (length as ExactDecimal).toFixed(), widthM: (width as ExactDecimal).toFixed(), heightM: (height as ExactDecimal).toFixed(), quantity: (quantity as ExactDecimal).toFixed() }) : incompatible("VOLUME", offering.billingUnit); }
  return { state: "MANUAL_REQUIRED", issues: [issue("UNSUPPORTED_QUANTITY_BASIS", "quantityBasis", `${offering.quantityBasis} is not supported.`)] };
}
