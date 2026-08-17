import type { PriceSide } from "@prisma/client";
import { ExactDecimal } from "./decimal";
import type { GlobalRateResult } from "./types";

export type PersonnelInput = { headcount: string; dutyUnitsPerPerson: string };
export type PersonnelIssueCode = "INVALID_HEADCOUNT" | "INVALID_DUTY_UNITS";
export type PersonnelPricingResult = {
  pricingFamily: "HEADCOUNT_DUTY"; headcount: string; dutyUnitsPerPerson: string;
  billingUnit: "DUTY"; billableQuantity: string | null; billableQuantityNumerator: string | null; billableQuantityDenominator: string | null;
  rateSide: PriceSide; priceId: string | null; unitRatePaise: number | null; rateScope: "GLOBAL";
  usageDays: null; chargeUnits: null; chargeUnitProvenance: null;
  finalAmountPaise: number | null; pricingState: "READY" | "CONFIGURATION_INVALID" | "RATE_UNAVAILABLE" | "RATE_DATA_CONFLICT";
  issues: Array<{ code: PersonnelIssueCode; field: string; message: string }>;
};

export function calculatePersonnelWithRate(input: PersonnelInput, side: PriceSide, rate: GlobalRateResult): PersonnelPricingResult {
  const headcount = ExactDecimal.parse(input.headcount); const duties = ExactDecimal.parse(input.dutyUnitsPerPerson); const issues: PersonnelPricingResult["issues"] = [];
  if (!headcount || headcount.compare(new ExactDecimal(0n)) <= 0 || !headcount.isInteger()) issues.push({ code: "INVALID_HEADCOUNT", field: "headcount", message: "Headcount must be a positive whole number." });
  if (!duties || duties.compare(new ExactDecimal(0n)) <= 0) issues.push({ code: "INVALID_DUTY_UNITS", field: "dutyUnitsPerPerson", message: "Duties per person must be positive." });
  const base = { pricingFamily: "HEADCOUNT_DUTY" as const, headcount: input.headcount, dutyUnitsPerPerson: input.dutyUnitsPerPerson, billingUnit: "DUTY" as const, rateSide: side, rateScope: "GLOBAL" as const, usageDays: null, chargeUnits: null, chargeUnitProvenance: null };
  if (issues.length || !headcount || !duties) return { ...base, billableQuantity: null, billableQuantityNumerator: null, billableQuantityDenominator: null, priceId: null, unitRatePaise: null, finalAmountPaise: null, pricingState: "CONFIGURATION_INVALID", issues };
  const quantity = headcount.multiply(duties); const exactQuantity = { billableQuantity: quantity.toFixed(), billableQuantityNumerator: String(quantity.numerator), billableQuantityDenominator: String(quantity.denominator) };
  if (rate.state !== "RATE_FOUND") return { ...base, ...exactQuantity, priceId: null, unitRatePaise: null, finalAmountPaise: null, pricingState: rate.state, issues: [] };
  const amount = quantity.multiply(new ExactDecimal(BigInt(rate.amountPaise))).roundHalfUp();
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Calculated amount exceeds the safe paise range.");
  return { ...base, ...exactQuantity, priceId: rate.priceId, unitRatePaise: rate.amountPaise, finalAmountPaise: Number(amount), pricingState: "READY", issues: [] };
}
