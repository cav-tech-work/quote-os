import type { PriceSide } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ExactDecimal } from "./decimal";
import { resolveChargeUnits } from "./duration";
import { calculateBillableQuantity } from "./quantity";
import { resolveCurrentGlobalRate } from "./rate-resolver";
import type { DurationInput, DurationPolicyDefinition, GlobalRateResult, MeasurementConfiguration, OfferingCalculationIdentity, OfferingPricingResult } from "./types";

export function calculateOfferingWithRate(offering: OfferingCalculationIdentity, inputConfiguration: MeasurementConfiguration, side: PriceSide, rate: GlobalRateResult, durationPolicy: DurationPolicyDefinition | null = null, durationInput: DurationInput = {}): OfferingPricingResult {
  const base = { offeringId: offering.id, offeringCode: offering.code, quantityBasis: offering.quantityBasis, durationBasis: offering.durationBasis, inputConfiguration, rateSide: side, rateScope: "GLOBAL" as const };
  const quantity = calculateBillableQuantity(offering, inputConfiguration);
  const durationEmpty = { durationPolicyId: durationPolicy?.id ?? null, durationPolicyCode: durationPolicy?.code ?? null, usageDays: durationInput.usageDays ?? null, chargeUnits: null, chargeUnitProvenance: null, finalAmountPaise: null };
  if (quantity.state !== "QUANTITY_CALCULATED") return { ...base, ...durationEmpty, normalizedConfiguration: null, billingUnit: offering.billingUnit, billableQuantity: null, priceId: null, unitRatePaise: null, baseAmountPaise: null, amountMeaning: null, pricingState: quantity.state, issues: quantity.issues };
  if (rate.state !== "RATE_FOUND") return { ...base, ...durationEmpty, normalizedConfiguration: quantity.normalizedConfiguration, billingUnit: quantity.billingUnit, billableQuantity: quantity.billableQuantity, priceId: null, unitRatePaise: null, baseAmountPaise: null, amountMeaning: null, pricingState: rate.state, issues: [] };
  const exactQuantity = new ExactDecimal(BigInt(quantity.exactNumerator), BigInt(quantity.exactDenominator));
  const amount = exactQuantity.multiply(new ExactDecimal(BigInt(rate.amountPaise))).roundHalfUp();
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Calculated amount exceeds the safe paise range.");
  if (offering.durationBasis === "DUTY") return { ...base, ...durationEmpty, normalizedConfiguration: quantity.normalizedConfiguration, billingUnit: quantity.billingUnit, billableQuantity: quantity.billableQuantity, priceId: rate.priceId, unitRatePaise: rate.amountPaise, baseAmountPaise: Number(amount), amountMeaning: "PER_CHARGE_PERIOD_BASE_AMOUNT", pricingState: "UNSUPPORTED_SPECIAL_DURATION", issues: [] };
  if (!durationPolicy) return { ...base, ...durationEmpty, normalizedConfiguration: quantity.normalizedConfiguration, billingUnit: quantity.billingUnit, billableQuantity: quantity.billableQuantity, priceId: rate.priceId, unitRatePaise: rate.amountPaise, baseAmountPaise: Number(amount), amountMeaning: "PER_CHARGE_PERIOD_BASE_AMOUNT", pricingState: "DURATION_POLICY_UNAVAILABLE", issues: [] };
  const duration = resolveChargeUnits(durationPolicy, durationInput);
  if (duration.state !== "CHARGE_UNITS_RESOLVED") return { ...base, ...durationEmpty, normalizedConfiguration: quantity.normalizedConfiguration, billingUnit: quantity.billingUnit, billableQuantity: quantity.billableQuantity, priceId: rate.priceId, unitRatePaise: rate.amountPaise, baseAmountPaise: Number(amount), amountMeaning: "PER_CHARGE_PERIOD_BASE_AMOUNT", pricingState: duration.state, issues: [duration.issue] };
  const final = exactQuantity.multiply(new ExactDecimal(BigInt(rate.amountPaise))).multiply(new ExactDecimal(BigInt(duration.exactNumerator), BigInt(duration.exactDenominator))).roundHalfUp();
  return { ...base, normalizedConfiguration: quantity.normalizedConfiguration, billingUnit: quantity.billingUnit, billableQuantity: quantity.billableQuantity, priceId: rate.priceId, unitRatePaise: rate.amountPaise, baseAmountPaise: Number(amount), durationPolicyId: duration.policyId, durationPolicyCode: duration.policyCode, usageDays: duration.usageDays, chargeUnits: duration.chargeUnits, chargeUnitProvenance: duration.provenance, finalAmountPaise: Number(final), amountMeaning: "FINAL_BASE_AMOUNT", pricingState: "READY", issues: [] };
}

export async function calculateOfferingPricing(input: { offeringId: string; side: PriceSide; configuration: MeasurementConfiguration; duration?: DurationInput; asOf?: Date }, database = prisma) {
  const offering = await database.commercialOffering.findUnique({ where: { id: input.offeringId }, select: { id: true, code: true, quantityBasis: true, durationBasis: true, billingUnit: true, durationPolicy: { include: { points: { orderBy: { sortOrder: "asc" } } } } } });
  if (!offering) return null;
  const rate = await resolveCurrentGlobalRate(offering.id, input.side, database, input.asOf);
  return calculateOfferingWithRate(offering, input.configuration, input.side, rate, offering.durationPolicy, input.duration);
}
