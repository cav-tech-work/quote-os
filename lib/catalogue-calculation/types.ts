import type { DurationBasis, DurationPolicyMode, DurationRoundingMode, PriceSide, QuantityBasis, UnitCode } from "@prisma/client";

export type DecimalInput = string;
export type LengthMeasurement = { value: DecimalInput; unit: "M" | "FT" };
export type MeasurementConfiguration = {
  quantity?: DecimalInput;
  length?: LengthMeasurement;
  width?: LengthMeasurement;
  height?: LengthMeasurement;
};
export type DurationInput = { usageDays?: DecimalInput; manualChargeUnits?: DecimalInput; overrideChargeUnits?: DecimalInput };
export type DurationPolicyDefinition = { id: string; code: string; name: string; mode: DurationPolicyMode; chargeMultiplierNumerator: number; chargeMultiplierDenominator: number; minimumChargeNumerator: number; minimumChargeDenominator: number; roundingMode: DurationRoundingMode; active: boolean; authority?: "INTERNAL_APPROVED" | "HISTORICAL_INTERNAL" | "EXTERNAL_REFERENCE"; points?: Array<{ usageDays: number; chargeUnitsNumerator: number; chargeUnitsDenominator: number }> };
export type DurationResult =
  | { state: "CHARGE_UNITS_RESOLVED"; policyId: string; policyCode: string; usageDays: string | null; rawChargeUnits: string; minimumAdjustedChargeUnits: string; roundingMode: DurationRoundingMode; chargeUnits: string; exactNumerator: string; exactDenominator: string; provenance: "POLICY_RESOLVED" | "OVERRIDE_USED" }
  | { state: "DURATION_INPUT_REQUIRED" | "MANUAL_DURATION_REQUIRED" | "DURATION_CURVE_VALUE_UNAVAILABLE" | "UNSUPPORTED_SPECIAL_DURATION"; issue: CalculationIssue };

export type CalculationIssueCode =
  | "CALCULATION_SEMANTICS_UNAVAILABLE"
  | "MISSING_BILLING_UNIT"
  | "MISSING_QUANTITY"
  | "MISSING_LENGTH"
  | "MISSING_WIDTH"
  | "MISSING_HEIGHT"
  | "INVALID_QUANTITY"
  | "INVALID_MEASUREMENT"
  | "NEGATIVE_DIMENSION"
  | "INCOMPATIBLE_UNIT"
  | "UNSUPPORTED_QUANTITY_BASIS";

export type CalculationIssue = { code: CalculationIssueCode; field?: string; message: string };
export type OfferingCalculationIdentity = {
  id: string;
  code: string;
  quantityBasis: QuantityBasis | null;
  durationBasis: DurationBasis | null;
  billingUnit: UnitCode | null;
};

export type QuantityResult =
  | { state: "QUANTITY_CALCULATED"; billingUnit: UnitCode; billableQuantity: string; exactNumerator: string; exactDenominator: string; normalizedConfiguration: Record<string, string> }
  | { state: "CALCULATION_SEMANTICS_UNAVAILABLE" | "CONFIGURATION_INCOMPLETE" | "MANUAL_REQUIRED"; issues: CalculationIssue[] };

export type GlobalRateResult =
  | { state: "RATE_FOUND"; priceId: string; amountPaise: number; side: PriceSide; scope: "GLOBAL" }
  | { state: "RATE_UNAVAILABLE"; side: PriceSide; scope: "GLOBAL" }
  | { state: "RATE_DATA_CONFLICT"; side: PriceSide; scope: "GLOBAL"; priceIds: string[] };

export type PricingState = "READY" | "RATE_UNAVAILABLE" | "RATE_DATA_CONFLICT" | "CALCULATION_SEMANTICS_UNAVAILABLE" | "CONFIGURATION_INCOMPLETE" | "MANUAL_REQUIRED" | "DURATION_POLICY_UNAVAILABLE" | "DURATION_INPUT_REQUIRED" | "MANUAL_DURATION_REQUIRED" | "DURATION_CURVE_VALUE_UNAVAILABLE" | "UNSUPPORTED_SPECIAL_DURATION";

export type OfferingPricingResult = {
  offeringId: string;
  offeringCode: string;
  quantityBasis: QuantityBasis | null;
  durationBasis: DurationBasis | null;
  inputConfiguration: MeasurementConfiguration;
  normalizedConfiguration: Record<string, string> | null;
  billingUnit: UnitCode | null;
  billableQuantity: string | null;
  rateSide: PriceSide;
  priceId: string | null;
  unitRatePaise: number | null;
  rateScope: "GLOBAL";
  baseAmountPaise: number | null;
  durationPolicyId: string | null;
  durationPolicyCode: string | null;
  usageDays: string | null;
  chargeUnits: string | null;
  chargeUnitProvenance: "POLICY_RESOLVED" | "OVERRIDE_USED" | null;
  finalAmountPaise: number | null;
  amountMeaning: "FINAL_BASE_AMOUNT" | "PER_CHARGE_PERIOD_BASE_AMOUNT" | null;
  pricingState: PricingState;
  issues: CalculationIssue[];
};
