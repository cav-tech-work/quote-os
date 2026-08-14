import { ExactDecimal } from "./decimal";
import type { CalculationIssue, DurationInput, DurationPolicyDefinition, DurationResult } from "./types";

const invalid = (code: CalculationIssue["code"], field: string, message: string): DurationResult => ({ state: code === "MISSING_QUANTITY" ? "DURATION_INPUT_REQUIRED" : "MANUAL_DURATION_REQUIRED", issue: { code, field, message } });
function parsePositive(value: string | undefined, field: string) { const parsed = value === undefined ? null : ExactDecimal.parse(value); return parsed && parsed.compare(new ExactDecimal(0n)) >= 0 ? parsed : null; }

export function resolveChargeUnits(policy: DurationPolicyDefinition, input: DurationInput): DurationResult {
  const override = parsePositive(input.overrideChargeUnits, "overrideChargeUnits");
  if (input.overrideChargeUnits !== undefined) {
    if (!override) return { state: "DURATION_INPUT_REQUIRED", issue: { code: "INVALID_QUANTITY", field: "overrideChargeUnits", message: "Override charge units must be a non-negative decimal." } };
    return { state: "CHARGE_UNITS_RESOLVED", policyId: policy.id, policyCode: policy.code, usageDays: input.usageDays ?? null, rawChargeUnits: override.toFixed(), minimumAdjustedChargeUnits: override.toFixed(), roundingMode: "NONE", chargeUnits: override.toFixed(), exactNumerator: String(override.numerator), exactDenominator: String(override.denominator), provenance: "OVERRIDE_USED" };
  }
  if (policy.mode === "ONE_OFF") return { state: "CHARGE_UNITS_RESOLVED", policyId: policy.id, policyCode: policy.code, usageDays: input.usageDays ?? null, rawChargeUnits: "1", minimumAdjustedChargeUnits: "1", roundingMode: policy.roundingMode, chargeUnits: "1", exactNumerator: "1", exactDenominator: "1", provenance: "POLICY_RESOLVED" };
  if (policy.mode === "MANUAL") {
    const manual = parsePositive(input.manualChargeUnits, "manualChargeUnits");
    if (!manual) return invalid("INVALID_QUANTITY", "manualChargeUnits", "Manual charge units are required as a non-negative decimal.");
    return { state: "CHARGE_UNITS_RESOLVED", policyId: policy.id, policyCode: policy.code, usageDays: input.usageDays ?? null, rawChargeUnits: manual.toFixed(), minimumAdjustedChargeUnits: manual.toFixed(), roundingMode: policy.roundingMode, chargeUnits: manual.toFixed(), exactNumerator: String(manual.numerator), exactDenominator: String(manual.denominator), provenance: "POLICY_RESOLVED" };
  }
  const usage = parsePositive(input.usageDays, "usageDays");
  if (!usage) return { state: "DURATION_INPUT_REQUIRED", issue: { code: "INVALID_QUANTITY", field: "usageDays", message: "Usage days are required as a non-negative decimal." } };
  if (policy.mode === "CURVE") {
    if (!usage.isInteger() || usage.compare(new ExactDecimal(1n)) < 0) return { state: "DURATION_CURVE_VALUE_UNAVAILABLE", issue: { code: "INVALID_QUANTITY", field: "usageDays", message: "Curve policies require a configured positive whole usage day." } };
    const point = policy.points?.find((item) => BigInt(item.usageDays) === usage.numerator / usage.denominator);
    if (!point) return { state: "DURATION_CURVE_VALUE_UNAVAILABLE", issue: { code: "INVALID_QUANTITY", field: "usageDays", message: `No curve value is configured for ${usage.toFixed()} usage days.` } };
    const charge = new ExactDecimal(BigInt(point.chargeUnitsNumerator), BigInt(point.chargeUnitsDenominator));
    return { state: "CHARGE_UNITS_RESOLVED", policyId: policy.id, policyCode: policy.code, usageDays: usage.toFixed(), rawChargeUnits: charge.toFixed(), minimumAdjustedChargeUnits: charge.toFixed(), roundingMode: "NONE", chargeUnits: charge.toFixed(), exactNumerator: String(charge.numerator), exactDenominator: String(charge.denominator), provenance: "POLICY_RESOLVED" };
  }
  const raw = usage.multiply(new ExactDecimal(BigInt(policy.chargeMultiplierNumerator), BigInt(policy.chargeMultiplierDenominator)));
  const minimum = new ExactDecimal(BigInt(policy.minimumChargeNumerator), BigInt(policy.minimumChargeDenominator));
  const adjusted = raw.compare(minimum) < 0 ? minimum : raw;
  const rounded = policy.roundingMode === "NONE" ? adjusted : new ExactDecimal(policy.roundingMode === "CEIL" ? adjusted.ceil() : policy.roundingMode === "FLOOR" ? adjusted.floor() : adjusted.roundHalfUp());
  return { state: "CHARGE_UNITS_RESOLVED", policyId: policy.id, policyCode: policy.code, usageDays: usage.toFixed(), rawChargeUnits: raw.toFixed(), minimumAdjustedChargeUnits: adjusted.toFixed(), roundingMode: policy.roundingMode, chargeUnits: rounded.toFixed(), exactNumerator: String(rounded.numerator), exactDenominator: String(rounded.denominator), provenance: "POLICY_RESOLVED" };
}
