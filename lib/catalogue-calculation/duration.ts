import { ExactDecimal } from "./decimal";
import type { CalculationIssue, DurationInput, DurationPolicyDefinition, DurationResult } from "./types";

const invalid = (code: CalculationIssue["code"], field: string, message: string): DurationResult => ({ state: code === "MISSING_QUANTITY" ? "DURATION_INPUT_REQUIRED" : "MANUAL_DURATION_REQUIRED", issue: { code, field, message } });
function parsePositive(value: string | undefined, field: string) { const parsed = value === undefined ? null : ExactDecimal.parse(value); return parsed && parsed.compare(new ExactDecimal(0n)) >= 0 ? parsed : null; }

export function resolveChargeUnits(policy: DurationPolicyDefinition, input: DurationInput): DurationResult {
  if (policy.mode === "ONE_OFF") return { state: "CHARGE_UNITS_RESOLVED", policyId: policy.id, policyCode: policy.code, usageDays: input.usageDays ?? null, rawChargeUnits: "1", minimumAdjustedChargeUnits: "1", roundingMode: policy.roundingMode, chargeUnits: "1", exactNumerator: "1", exactDenominator: "1" };
  if (policy.mode === "MANUAL") {
    const manual = parsePositive(input.manualChargeUnits, "manualChargeUnits");
    if (!manual) return invalid("INVALID_QUANTITY", "manualChargeUnits", "Manual charge units are required as a non-negative decimal.");
    return { state: "CHARGE_UNITS_RESOLVED", policyId: policy.id, policyCode: policy.code, usageDays: input.usageDays ?? null, rawChargeUnits: manual.toFixed(), minimumAdjustedChargeUnits: manual.toFixed(), roundingMode: policy.roundingMode, chargeUnits: manual.toFixed(), exactNumerator: String(manual.numerator), exactDenominator: String(manual.denominator) };
  }
  const usage = parsePositive(input.usageDays, "usageDays");
  if (!usage) return { state: "DURATION_INPUT_REQUIRED", issue: { code: "INVALID_QUANTITY", field: "usageDays", message: "Usage days are required as a non-negative decimal." } };
  const raw = usage.multiply(new ExactDecimal(BigInt(policy.chargeMultiplierNumerator), BigInt(policy.chargeMultiplierDenominator)));
  const minimum = new ExactDecimal(BigInt(policy.minimumChargeNumerator), BigInt(policy.minimumChargeDenominator));
  const adjusted = raw.compare(minimum) < 0 ? minimum : raw;
  const rounded = policy.roundingMode === "NONE" ? adjusted : new ExactDecimal(policy.roundingMode === "CEIL" ? adjusted.ceil() : policy.roundingMode === "FLOOR" ? adjusted.floor() : adjusted.roundHalfUp());
  return { state: "CHARGE_UNITS_RESOLVED", policyId: policy.id, policyCode: policy.code, usageDays: usage.toFixed(), rawChargeUnits: raw.toFixed(), minimumAdjustedChargeUnits: adjusted.toFixed(), roundingMode: policy.roundingMode, chargeUnits: rounded.toFixed(), exactNumerator: String(rounded.numerator), exactDenominator: String(rounded.denominator) };
}
