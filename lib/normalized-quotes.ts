import { Prisma, type PriceSide } from "@prisma/client";
import { calculateOfferingWithRate, calculatePersonnelWithRate, resolveCurrentGlobalRate } from "@/lib/catalogue-calculation";
import type { DurationInput, MeasurementConfiguration } from "@/lib/catalogue-calculation";
import { prisma } from "@/lib/prisma";
import { allocateQuoteNumber } from "@/lib/quote-number";
import { packageSnapshotForQuote } from "@/lib/package-engine";

export const PRICING_ENGINE_VERSION = "quoteos-exact-v2";
export const SNAPSHOT_SCHEMA_VERSION = "normalized-line-v2";
const SUPPORTED_BASES = ["COUNT", "AREA_LW", "AREA_LH", "LINEAR", "VOLUME", "FIXED"] as const;
type QuoteDatabase = Pick<typeof prisma, "commercialOffering" | "price">;

export type NormalizedQuoteErrorCode = "OFFERING_NOT_FOUND" | "OFFERING_NOT_QUOTE_READY" | "OFFERING_NOT_PERSONNEL_READY" | "RATE_UNAVAILABLE" | "PERSONNEL_RATE_UNAVAILABLE" | "DURATION_POLICY_UNAVAILABLE" | "CONFIGURATION_INVALID" | "INVALID_HEADCOUNT" | "INVALID_DUTY_UNITS" | "PERSONNEL_PRICING_UNSUPPORTED" | "CALCULATION_UNSUPPORTED" | "RATE_CONFLICT";
export class NormalizedQuoteError extends Error {
  constructor(public code: NormalizedQuoteErrorCode, message: string, public details?: unknown) { super(message); this.name = "NormalizedQuoteError"; }
}

export function sideForQuoteType(type: "CLIENT" | "VENDOR"): PriceSide { return type === "CLIENT" ? "TO_CLIENT" : "TO_VENDOR"; }

export async function listNormalizedOfferings(side: PriceSide, search = "", database: QuoteDatabase = prisma) {
  const asOf = new Date();
  const offerings = await database.commercialOffering.findMany({
    where: {
      active: true,
      OR: [{ kind: null }, { kind: { not: "PACKAGE" } }],
      AND: [{ OR: [
        { quantityBasis: { in: [...SUPPORTED_BASES] }, durationPolicy: { is: { active: true, authority: "INTERNAL_APPROVED", mode: { not: "MANUAL" } } } },
        { quantityBasis: "HEADCOUNT_DUTY", pricingFamily: "HEADCOUNT_DUTY", billingUnit: "DUTY" },
      ] }],
      prices: { some: { side, active: true, scopeType: "GLOBAL", marketId: null, AND: [{ OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: asOf } }] }, { OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }] }] } },
      ...(search ? { AND: [{ OR: [{ code: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }, { canonicalItem: { is: { OR: [{ code: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] } } }] }] } : {}),
    },
    orderBy: [{ canonicalItem: { name: "asc" } }, { name: "asc" }],
    include: { canonicalItem: { select: { code: true, name: true } }, durationPolicy: { select: { code: true, mode: true } }, prices: { where: { side, active: true, scopeType: "GLOBAL", marketId: null, AND: [{ OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: asOf } }] }, { OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }] }] }, select: { id: true, amountPaise: true } } },
  });
  return offerings.filter((offering) => offering.prices.length === 1).map((offering) => ({ id: offering.id, code: offering.code, name: offering.name, canonicalCode: offering.canonicalItem?.code ?? null, canonicalName: offering.canonicalItem?.name ?? null, pricingFamily: offering.pricingFamily === "HEADCOUNT_DUTY" ? "HEADCOUNT_DUTY" as const : "ORDINARY" as const, quantityBasis: offering.quantityBasis, billingUnit: offering.billingUnit, durationPolicyCode: offering.durationPolicy?.code ?? null, durationPolicyMode: offering.durationPolicy?.mode ?? null, priceId: offering.prices[0].id, unitRatePaise: offering.prices[0].amountPaise, rateSide: side, rateScope: "GLOBAL" as const }));
}

export type NormalizedConfiguration = MeasurementConfiguration & { headcount?: string; dutyUnitsPerPerson?: string };
export type NormalizedLineInput = { commercialOfferingId: string; configuration: NormalizedConfiguration; usageDays?: string; overrideChargeUnits?: string; overrideReason?: string; expectedPriceId?: string };

export async function calculateNormalizedLine(input: NormalizedLineInput, side: PriceSide, database: QuoteDatabase = prisma) {
  if (input.overrideChargeUnits !== undefined && !input.overrideReason?.trim()) throw new NormalizedQuoteError("CONFIGURATION_INVALID", "A charge-unit override reason is required.");
  const offering = await database.commercialOffering.findUnique({ where: { id: input.commercialOfferingId }, include: { canonicalItem: { select: { code: true, name: true } }, durationPolicy: { include: { points: { orderBy: { sortOrder: "asc" } } } } } });
  if (!offering) throw new NormalizedQuoteError("OFFERING_NOT_FOUND", "Commercial offering was not found.");
  if (offering.quantityBasis === "HEADCOUNT_DUTY") {
    if (!offering.active || offering.pricingFamily !== "HEADCOUNT_DUTY" || offering.billingUnit !== "DUTY" || offering.kind === "PACKAGE") throw new NormalizedQuoteError("OFFERING_NOT_PERSONNEL_READY", "Offering has no approved personnel pricing semantics.");
    const rate = await resolveCurrentGlobalRate(offering.id, side, database);
    if (rate.state === "RATE_UNAVAILABLE") throw new NormalizedQuoteError("PERSONNEL_RATE_UNAVAILABLE", `No current GLOBAL ${side} personnel rate exists.`);
    if (rate.state === "RATE_DATA_CONFLICT") throw new NormalizedQuoteError("RATE_CONFLICT", "Multiple current GLOBAL personnel rates exist.", rate.priceIds);
    if (input.expectedPriceId && input.expectedPriceId !== rate.priceId) throw new NormalizedQuoteError("RATE_CONFLICT", "The preview rate changed before save.", { expectedPriceId: input.expectedPriceId, currentPriceId: rate.priceId });
    const calculation = calculatePersonnelWithRate({ headcount: input.configuration.headcount ?? "", dutyUnitsPerPerson: input.configuration.dutyUnitsPerPerson ?? "" }, side, rate);
    if (calculation.pricingState !== "READY") { const issue = calculation.issues[0]; throw new NormalizedQuoteError(issue?.code ?? "PERSONNEL_PRICING_UNSUPPORTED", issue?.message ?? "Personnel calculation is unavailable.", calculation.issues); }
    return { offering, policy: null, calculation };
  }
  if (!offering.active || !offering.quantityBasis || !SUPPORTED_BASES.includes(offering.quantityBasis as typeof SUPPORTED_BASES[number]) || offering.kind === "PACKAGE") throw new NormalizedQuoteError("OFFERING_NOT_QUOTE_READY", "Offering is outside ordinary normalized quote scope.");
  if (!offering.durationPolicy?.active || offering.durationPolicy.authority !== "INTERNAL_APPROVED" || offering.durationPolicy.mode === "MANUAL") throw new NormalizedQuoteError("DURATION_POLICY_UNAVAILABLE", "Offering has no active internally approved ordinary duration policy.");
  const rate = await resolveCurrentGlobalRate(offering.id, side, database);
  if (rate.state === "RATE_UNAVAILABLE") throw new NormalizedQuoteError("RATE_UNAVAILABLE", `No current GLOBAL ${side} rate exists.`);
  if (rate.state === "RATE_DATA_CONFLICT") throw new NormalizedQuoteError("RATE_CONFLICT", "Multiple current GLOBAL rates exist.", rate.priceIds);
  if (input.expectedPriceId && input.expectedPriceId !== rate.priceId) throw new NormalizedQuoteError("RATE_CONFLICT", "The preview rate changed before save.", { expectedPriceId: input.expectedPriceId, currentPriceId: rate.priceId });
  const duration: DurationInput = { usageDays: input.usageDays, overrideChargeUnits: input.overrideChargeUnits };
  const calculation = calculateOfferingWithRate(offering, input.configuration, side, rate, offering.durationPolicy, duration);
  if (calculation.pricingState !== "READY") {
    const code = calculation.pricingState === "CONFIGURATION_INCOMPLETE" ? "CONFIGURATION_INVALID" : "CALCULATION_UNSUPPORTED";
    throw new NormalizedQuoteError(code, `Normalized calculation failed: ${calculation.pricingState}.`, calculation.issues);
  }
  return { offering, policy: offering.durationPolicy, calculation };
}

function policyDefinition(policy: NonNullable<Awaited<ReturnType<typeof calculateNormalizedLine>>["policy"]>, usageDays: string | null) {
  if (policy.mode === "USAGE_DAYS") return { mode: policy.mode, multiplier: [policy.chargeMultiplierNumerator, policy.chargeMultiplierDenominator], minimum: [policy.minimumChargeNumerator, policy.minimumChargeDenominator], roundingMode: policy.roundingMode };
  if (policy.mode === "CURVE") { const day = usageDays ? Number(usageDays) : NaN; const point = policy.points.find((item) => item.usageDays === day); return { mode: policy.mode, resolvedPoint: point ? { usageDays: point.usageDays, chargeUnits: [point.chargeUnitsNumerator, point.chargeUnitsDenominator] } : null }; }
  return { mode: policy.mode };
}

export function normalizedLineSnapshot(resolved: Awaited<ReturnType<typeof calculateNormalizedLine>>, input: NormalizedLineInput, discountPercent: number, remarks?: string) {
  const { offering, policy, calculation } = resolved;
  const personnel = offering.quantityBasis === "HEADCOUNT_DUTY";
  const finalAmount = calculation.finalAmountPaise!;
  const discountPaise = Math.round(finalAmount * discountPercent / 100);
  return {
    catalogueItemId: null,
    commercialOfferingId: offering.id,
    itemCodeSnapshot: offering.code,
    itemNameSnapshot: offering.name,
    descriptionSnapshot: offering.canonicalItem?.name ?? null,
    unitSnapshot: calculation.billingUnit!,
    quantity: calculation.billableQuantity!,
    days: "usageDays" in calculation ? calculation.usageDays ?? input.usageDays ?? "1" : "1",
    rateUsedPaise: calculation.unitRatePaise!,
    discountPercent,
    discountPaise,
    lineTotalPaise: finalAmount - discountPaise,
    remarks: remarks?.trim() || null,
    canonicalCodeSnapshot: offering.canonicalItem?.code ?? null,
    canonicalNameSnapshot: offering.canonicalItem?.name ?? null,
    configurationSnapshot: input.configuration as Prisma.InputJsonValue,
    normalizedConfigurationSnapshot: ("normalizedConfiguration" in calculation ? calculation.normalizedConfiguration : { headcount: calculation.headcount, dutyUnitsPerPerson: calculation.dutyUnitsPerPerson }) as Prisma.InputJsonValue,
    quantityBasisSnapshot: offering.quantityBasis!,
    pricingFamilySnapshot: personnel ? "HEADCOUNT_DUTY" as const : "ORDINARY" as const,
    headcountSnapshot: personnel && "headcount" in calculation ? Number(calculation.headcount) : null,
    dutyUnitsPerPersonSnapshot: personnel && "dutyUnitsPerPerson" in calculation ? calculation.dutyUnitsPerPerson : null,
    billableQuantitySnapshot: calculation.billableQuantity!,
    billableQuantityNumeratorSnapshot: calculation.billableQuantityNumerator!,
    billableQuantityDenominatorSnapshot: calculation.billableQuantityDenominator!,
    rateSideSnapshot: calculation.rateSide,
    priceIdSnapshot: calculation.priceId!,
    rateScopeSnapshot: "GLOBAL" as const,
    marketIdSnapshot: null,
    currencySnapshot: "INR",
    usageDaysSnapshot: "usageDays" in calculation ? calculation.usageDays : null,
    durationPolicyIdSnapshot: policy?.id ?? null,
    durationPolicyCodeSnapshot: policy?.code ?? null,
    durationPolicyModeSnapshot: policy?.mode ?? null,
    durationPolicyDefinitionSnapshot: policy ? policyDefinition(policy, "usageDays" in calculation ? calculation.usageDays : null) : Prisma.DbNull,
    chargeUnitsSnapshot: "chargeUnits" in calculation ? calculation.chargeUnits : null,
    durationResolutionProvenanceSnapshot: "chargeUnitProvenance" in calculation ? calculation.chargeUnitProvenance : null,
    overrideChargeUnitsSnapshot: input.overrideChargeUnits ?? null,
    overrideReasonSnapshot: input.overrideReason?.trim() || null,
    baseAmountPaiseSnapshot: "baseAmountPaise" in calculation ? calculation.baseAmountPaise! : finalAmount,
    amountMeaningSnapshot: personnel ? "FINAL_PERSONNEL_DUTY_AMOUNT" : "amountMeaning" in calculation ? calculation.amountMeaning! : null,
    finalAmountPaiseSnapshot: finalAmount,
    pricingEngineVersion: PRICING_ENGINE_VERSION,
    snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
  };
}

export type NormalizedQuoteDraft = { type: "CLIENT" | "VENDOR"; company: string; project?: string; venue?: string; city?: string; salesperson?: string; taxPercentage: number; eventDays: number; lines: Array<NormalizedLineInput & { discountPercent: number; remarks?: string }>; packages?: Array<{ packageTemplateId: string; packageQuantity: string; usageDays?: string; expectedParentPriceId?: string; discountPercent: number; remarks?: string }> };

export async function persistNormalizedQuote(input: NormalizedQuoteDraft, actorId: string, database = prisma) {
  const side = sideForQuoteType(input.type);
  return database.$transaction(async (tx) => {
    const snapshots: any[] = [];
    for (const line of input.lines) { const usageDays = line.usageDays ?? String(input.eventDays); const normalizedInput = { ...line, usageDays }; const resolved = await calculateNormalizedLine(normalizedInput, side, tx); snapshots.push(normalizedLineSnapshot(resolved, normalizedInput, line.discountPercent, line.remarks)); }
    for (const pkg of input.packages ?? []) snapshots.push(await packageSnapshotForQuote({ ...pkg, usageDays: pkg.usageDays ?? String(input.eventDays), quoteType: input.type }, tx));
    const subtotalPaise = snapshots.reduce((total, line) => total + line.finalAmountPaiseSnapshot, 0); const discountTotalPaise = snapshots.reduce((total, line) => total + line.discountPaise, 0); const taxTotalPaise = Math.round((subtotalPaise - discountTotalPaise) * input.taxPercentage / 100); const grandTotalPaise = subtotalPaise - discountTotalPaise + taxTotalPaise;
    const number = await allocateQuoteNumber(tx);
    const created = await tx.quote.create({ data: { number, type: input.type, company: input.company, project: input.project || null, venue: input.venue || null, city: input.city || null, salesperson: input.salesperson || null, createdById: actorId } });
    const revision = await tx.quoteRevision.create({ data: { quoteId: created.id, revisionNumber: 1, status: "DRAFT", createdById: actorId, preparedDate: new Date(), eventDays: input.eventDays, taxPercentage: input.taxPercentage, quoteTypeSnapshot: input.type, companySnapshot: input.company, projectSnapshot: input.project || null, venueSnapshot: input.venue || null, citySnapshot: input.city || null, salespersonSnapshot: input.salesperson || null, currencySnapshot: "INR", termsSnapshot: "This quotation is subject to availability, final technical confirmation, and applicable taxes. Payment terms and project-specific conditions will be confirmed in writing.", settingsSnapshot: { builderMode: "NORMALIZED", snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION }, subtotalPaise, discountTotalPaise, taxTotalPaise, grandTotalPaise, lines: { create: snapshots } }, include: { lines: { include: { packageComponents: true } } } });
    await tx.quoteEvent.create({ data: { quoteId: created.id, actorId, action: "CREATED", metadata: { revisionId: revision.id, builderMode: "NORMALIZED", normalizedLineCount: snapshots.length } } });
    return { ...created, revision };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
