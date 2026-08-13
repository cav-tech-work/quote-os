import type { PriceSide } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ExactDecimal } from "./decimal";
import { calculateBillableQuantity } from "./quantity";
import { resolveCurrentGlobalRate } from "./rate-resolver";
import type { GlobalRateResult, MeasurementConfiguration, OfferingCalculationIdentity, OfferingPricingResult, PricingState } from "./types";

const SCHEDULE_BASES = new Set(["VC_CHARGE_DAYS", "OPS_CHARGE_DAYS", "POWER_CHARGE_DAYS"]);

export function calculateOfferingWithRate(offering: OfferingCalculationIdentity, inputConfiguration: MeasurementConfiguration, side: PriceSide, rate: GlobalRateResult): OfferingPricingResult {
  const base = { offeringId: offering.id, offeringCode: offering.code, quantityBasis: offering.quantityBasis, durationBasis: offering.durationBasis, inputConfiguration, rateSide: side, rateScope: "GLOBAL" as const };
  const quantity = calculateBillableQuantity(offering, inputConfiguration);
  if (quantity.state !== "QUANTITY_CALCULATED") return { ...base, normalizedConfiguration: null, billingUnit: offering.billingUnit, billableQuantity: null, priceId: null, unitRatePaise: null, baseAmountPaise: null, amountMeaning: null, pricingState: quantity.state, issues: quantity.issues };
  if (rate.state !== "RATE_FOUND") return { ...base, normalizedConfiguration: quantity.normalizedConfiguration, billingUnit: quantity.billingUnit, billableQuantity: quantity.billableQuantity, priceId: null, unitRatePaise: null, baseAmountPaise: null, amountMeaning: null, pricingState: rate.state, issues: [] };
  const exactQuantity = new ExactDecimal(BigInt(quantity.exactNumerator), BigInt(quantity.exactDenominator));
  const amount = exactQuantity.multiply(new ExactDecimal(BigInt(rate.amountPaise))).roundHalfUp();
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Calculated amount exceeds the safe paise range.");
  let pricingState: PricingState = "READY"; let amountMeaning: OfferingPricingResult["amountMeaning"] = "FINAL_BASE_AMOUNT";
  if (!offering.durationBasis || offering.durationBasis === "MANUAL" || offering.durationBasis === "DUTY") pricingState = "MANUAL_REQUIRED";
  else if (SCHEDULE_BASES.has(offering.durationBasis)) { pricingState = "NEEDS_PRICING_SCHEDULE"; amountMeaning = "PER_CHARGE_PERIOD_BASE_AMOUNT"; }
  return { ...base, normalizedConfiguration: quantity.normalizedConfiguration, billingUnit: quantity.billingUnit, billableQuantity: quantity.billableQuantity, priceId: rate.priceId, unitRatePaise: rate.amountPaise, baseAmountPaise: Number(amount), amountMeaning, pricingState, issues: [] };
}

export async function calculateOfferingPricing(input: { offeringId: string; side: PriceSide; configuration: MeasurementConfiguration; asOf?: Date }, database = prisma) {
  const offering = await database.commercialOffering.findUnique({ where: { id: input.offeringId }, select: { id: true, code: true, quantityBasis: true, durationBasis: true, billingUnit: true } });
  if (!offering) return null;
  const rate = await resolveCurrentGlobalRate(offering.id, input.side, database, input.asOf);
  return calculateOfferingWithRate(offering, input.configuration, input.side, rate);
}
