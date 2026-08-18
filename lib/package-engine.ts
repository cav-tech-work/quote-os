import { Prisma, type PackagePricingMode, type PriceSide } from "@prisma/client";
import { ExactDecimal } from "@/lib/catalogue-calculation/decimal";
import { calculateNormalizedLine, NormalizedQuoteError, sideForQuoteType } from "@/lib/normalized-quotes";
import { prisma } from "@/lib/prisma";
import { calculateOfferingWithRate, resolveCurrentGlobalRate } from "@/lib/catalogue-calculation";

export const PACKAGE_ENGINE_VERSION = "quoteos-package-v1";
export const PACKAGE_SNAPSHOT_VERSION = "package-line-v1";

export type PackageIssueCode = "PACKAGE_NOT_FOUND" | "PACKAGE_NOT_READY" | "PACKAGE_INPUT_INVALID" | "PACKAGE_MODE_UNSUPPORTED" | "PACKAGE_COMPONENT_INVALID";
export class PackageCalculationError extends Error {
  constructor(public code: PackageIssueCode, message: string, public details?: unknown) { super(message); this.name = "PackageCalculationError"; }
}

export type PackageInput = { packageTemplateId: string; packageQuantity: string; side: PriceSide; usageDays?: string; expectedParentPriceId?: string };

function positive(value: string, field: string) {
  const parsed = ExactDecimal.parse(value);
  if (!parsed || parsed.compare(new ExactDecimal(0n)) <= 0) throw new PackageCalculationError("PACKAGE_INPUT_INVALID", `${field} must be positive.`);
  return parsed;
}

export function resolvePackageComponentQuantity(rule: "FIXED" | "FIXED_PER_PACKAGE" | "PARENT_QUANTITY_MULTIPLIER", quantityValue: string, packageQuantity: string) {
  const value = positive(quantityValue, "Component quantity");
  const packages = positive(packageQuantity, "Package quantity");
  return (rule === "FIXED" ? value : value.multiply(packages)).toFixed();
}

function supportedComponent(offering: any) {
  return offering.active && offering.kind !== "PACKAGE" && (
    (offering.quantityBasis === "HEADCOUNT_DUTY" && offering.pricingFamily === "HEADCOUNT_DUTY" && offering.billingUnit === "DUTY") ||
    (["COUNT", "AREA_LW", "AREA_LH", "LINEAR", "VOLUME", "FIXED"].includes(offering.quantityBasis) && offering.durationPolicy?.active && offering.durationPolicy.authority === "INTERNAL_APPROVED" && offering.durationPolicy.mode !== "MANUAL")
  );
}

export async function calculatePackage(input: PackageInput, database: any = prisma) {
  const template = await database.packageTemplate.findUnique({ where: { id: input.packageTemplateId }, include: { parentCommercialOffering: { include: { durationPolicy: { include: { points: { orderBy: { sortOrder: "asc" } } } } } }, components: { orderBy: { sortOrder: "asc" }, include: { commercialOffering: { include: { canonicalItem: true, durationPolicy: { include: { points: { orderBy: { sortOrder: "asc" } } } } } } } } } });
  if (!template) throw new PackageCalculationError("PACKAGE_NOT_FOUND", "Package template was not found.");
  if (!template.active || template.authority !== "INTERNAL_APPROVED") throw new PackageCalculationError("PACKAGE_NOT_READY", "Package template is not active and internally approved.");
  if (!template.components.length) throw new PackageCalculationError("PACKAGE_COMPONENT_INVALID", "Package must contain at least one component.");
  if (template.pricingMode === "HYBRID") throw new PackageCalculationError("PACKAGE_MODE_UNSUPPORTED", "HYBRID package calculation is deferred in V1.");
  if (template.pricingMode === "FIXED_PACKAGE" && template.components.some((item: any) => item.billingMode !== "INCLUDED")) throw new PackageCalculationError("PACKAGE_COMPONENT_INVALID", "FIXED_PACKAGE components must be INCLUDED.");
  const packageQuantity = positive(input.packageQuantity, "Package quantity").toFixed();
  const seenOrders = new Set<number>();
  const componentResults: any[] = [];
  for (const component of template.components) {
    if (seenOrders.has(component.sortOrder)) throw new PackageCalculationError("PACKAGE_COMPONENT_INVALID", "Package component sort orders must be unique.");
    seenOrders.add(component.sortOrder);
    if (component.commercialOfferingId === template.parentCommercialOfferingId || !supportedComponent(component.commercialOffering)) throw new PackageCalculationError("PACKAGE_COMPONENT_INVALID", `Component ${component.commercialOffering.code} is inactive, recursive, or commercially unsupported.`);
    const resolvedQuantity = resolvePackageComponentQuantity(component.quantityRuleType, component.quantityValue.toString(), packageQuantity);
    const personnel = component.commercialOffering.quantityBasis === "HEADCOUNT_DUTY";
    const configuration = personnel ? { headcount: resolvedQuantity, dutyUnitsPerPerson: component.dutyUnitsPerPerson?.toString() } : { quantity: resolvedQuantity };
    if (personnel && !component.dutyUnitsPerPerson) throw new PackageCalculationError("PACKAGE_COMPONENT_INVALID", `Personnel component ${component.commercialOffering.code} requires fixed duties per person.`);
    if (personnel && !ExactDecimal.parse(resolvedQuantity)?.isInteger()) throw new PackageCalculationError("PACKAGE_COMPONENT_INVALID", `Personnel component ${component.commercialOffering.code} must resolve to whole headcount.`);
    if (component.billingMode === "INCLUDED") {
      componentResults.push({ componentId: component.id, sortOrder: component.sortOrder, offering: component.commercialOffering, billingMode: component.billingMode, quantityRuleType: component.quantityRuleType, quantityValue: component.quantityValue.toString(), resolvedQuantity, configuration, calculation: null, finalAmountPaise: 0 });
      continue;
    }
    try {
      const resolved = await calculateNormalizedLine({ commercialOfferingId: component.commercialOfferingId, configuration, usageDays: input.usageDays }, input.side, database);
      componentResults.push({ componentId: component.id, sortOrder: component.sortOrder, offering: component.commercialOffering, billingMode: component.billingMode, quantityRuleType: component.quantityRuleType, quantityValue: component.quantityValue.toString(), resolvedQuantity, configuration, calculation: resolved.calculation, policy: resolved.policy, finalAmountPaise: resolved.calculation.finalAmountPaise! });
    } catch (error) {
      if (error instanceof NormalizedQuoteError) throw new PackageCalculationError("PACKAGE_NOT_READY", `Component ${component.commercialOffering.code} is not ready for ${input.side}: ${error.message}`, { componentId: component.id, cause: error.code });
      throw error;
    }
  }
  const componentSubtotalPaise = componentResults.reduce((sum, item) => sum + item.finalAmountPaise, 0);
  let packageLevelCalculation: any = null;
  if (template.pricingMode === "FIXED_PACKAGE") {
    if (!template.parentCommercialOfferingId) throw new PackageCalculationError("PACKAGE_COMPONENT_INVALID", "FIXED_PACKAGE requires a parent commercial offering.");
    const parent = template.parentCommercialOffering;
    if (!parent?.active || parent.kind !== "PACKAGE" || !parent.durationPolicy?.active || parent.durationPolicy.authority !== "INTERNAL_APPROVED") throw new PackageCalculationError("PACKAGE_NOT_READY", "Package parent lacks approved quantity/duration semantics.");
    const rate = await resolveCurrentGlobalRate(parent.id, input.side, database);
    if (rate.state !== "RATE_FOUND") throw new PackageCalculationError("PACKAGE_NOT_READY", `Package-level GLOBAL ${input.side} rate is unavailable or conflicting.`);
    if (input.expectedParentPriceId && input.expectedParentPriceId !== rate.priceId) throw new PackageCalculationError("PACKAGE_NOT_READY", "The package preview rate changed before save.");
    packageLevelCalculation = calculateOfferingWithRate(parent, { quantity: packageQuantity }, input.side, rate, parent.durationPolicy, { usageDays: input.usageDays });
    if (packageLevelCalculation.pricingState !== "READY") throw new PackageCalculationError("PACKAGE_NOT_READY", `Package-level calculation failed: ${packageLevelCalculation.pricingState}.`);
  }
  const packageLevelAmountPaise = packageLevelCalculation?.finalAmountPaise ?? 0;
  const finalAmountPaise = template.pricingMode === "COMPONENT_SUM" ? componentSubtotalPaise : packageLevelAmountPaise;
  return { packageTemplateId: template.id, packageCode: template.code, packageName: template.name, packageVersion: template.version, pricingMode: template.pricingMode as PackagePricingMode, packageQuantity, componentResults, packageLevelCalculation, componentSubtotalPaise, packageLevelAmountPaise, finalAmountPaise };
}

export async function listReadyPackages(side: PriceSide, search = "", database: any = prisma) {
  const candidates = await database.packageTemplate.findMany({ where: { active: true, authority: "INTERNAL_APPROVED", ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] } : {}) }, orderBy: [{ code: "asc" }, { version: "desc" }] });
  const ready = []; const seenCodes = new Set<string>();
  for (const template of candidates) { if (seenCodes.has(template.code)) continue; seenCodes.add(template.code); try { const result = await calculatePackage({ packageTemplateId: template.id, packageQuantity: "1", side, usageDays: "1" }, database); ready.push({ id: template.id, code: template.code, name: template.name, version: template.version, pricingMode: template.pricingMode, kind: "PACKAGE" as const, components: result.componentResults.map((item) => ({ code: item.offering.code, name: item.offering.name, billingMode: item.billingMode, quantity: item.resolvedQuantity })) }); } catch (error) { if (!(error instanceof PackageCalculationError)) throw error; } }
  return ready;
}

export function packageLineSnapshot(result: Awaited<ReturnType<typeof calculatePackage>>, discountPercent: number, remarks?: string) {
  const discountPaise = Math.round(result.finalAmountPaise * discountPercent / 100);
  const parent = result.packageLevelCalculation;
  return {
    catalogueItemId: null, commercialOfferingId: parent?.offeringId ?? null, packageTemplateId: result.packageTemplateId,
    itemCodeSnapshot: result.packageCode, itemNameSnapshot: result.packageName, descriptionSnapshot: `Package version ${result.packageVersion}`,
    unitSnapshot: "PACKAGE", quantity: result.packageQuantity, days: parent?.usageDays ?? "1", rateUsedPaise: parent?.unitRatePaise ?? result.finalAmountPaise,
    discountPercent, discountPaise, lineTotalPaise: result.finalAmountPaise - discountPaise, remarks: remarks?.trim() || null,
    configurationSnapshot: { packageQuantity: result.packageQuantity } as Prisma.InputJsonValue,
    normalizedConfigurationSnapshot: { packageQuantity: result.packageQuantity } as Prisma.InputJsonValue,
    rateSideSnapshot: parent?.rateSide ?? result.componentResults.find((item) => item.calculation)?.calculation.rateSide ?? null,
    priceIdSnapshot: parent?.priceId ?? null, rateScopeSnapshot: parent ? "GLOBAL" as const : null, currencySnapshot: "INR",
    usageDaysSnapshot: parent?.usageDays ?? null, durationPolicyIdSnapshot: parent?.durationPolicyId ?? null, durationPolicyCodeSnapshot: parent?.durationPolicyCode ?? null,
    chargeUnitsSnapshot: parent?.chargeUnits ?? null, baseAmountPaiseSnapshot: result.finalAmountPaise, amountMeaningSnapshot: "FINAL_PACKAGE_AMOUNT",
    finalAmountPaiseSnapshot: result.finalAmountPaise, pricingEngineVersion: PACKAGE_ENGINE_VERSION, snapshotSchemaVersion: PACKAGE_SNAPSHOT_VERSION,
    packageCodeSnapshot: result.packageCode, packageNameSnapshot: result.packageName, packageVersionSnapshot: result.packageVersion,
    packagePricingModeSnapshot: result.pricingMode, packageQuantitySnapshot: result.packageQuantity,
    packageComponentSubtotalPaiseSnapshot: result.componentSubtotalPaise, packageLevelAmountPaiseSnapshot: result.packageLevelAmountPaise,
    packageComponents: { create: result.componentResults.map((item) => { const c = item.calculation; const p = item.policy; return {
      sortOrder: item.sortOrder, commercialOfferingIdSnapshot: item.offering.id, offeringCodeSnapshot: item.offering.code, offeringNameSnapshot: item.offering.name,
      billingModeSnapshot: item.billingMode, quantityRuleTypeSnapshot: item.quantityRuleType, quantityValueSnapshot: item.quantityValue,
      resolvedQuantitySnapshot: item.resolvedQuantity, configurationSnapshot: item.configuration as Prisma.InputJsonValue,
      pricingFamilySnapshot: item.offering.quantityBasis === "HEADCOUNT_DUTY" ? "HEADCOUNT_DUTY" as const : "ORDINARY" as const,
      priceIdSnapshot: c?.priceId ?? null, rateSideSnapshot: c?.rateSide ?? null, unitRatePaiseSnapshot: c?.unitRatePaise ?? null,
      durationPolicyIdSnapshot: p?.id ?? null, durationPolicyCodeSnapshot: p?.code ?? null, durationPolicyDefinitionSnapshot: p ? ({ mode: p.mode, authority: p.authority } as Prisma.InputJsonValue) : Prisma.DbNull,
      headcountSnapshot: item.offering.quantityBasis === "HEADCOUNT_DUTY" ? Number(item.resolvedQuantity) : null, dutyUnitsPerPersonSnapshot: item.configuration.dutyUnitsPerPerson ?? null,
      billableQuantitySnapshot: c?.billableQuantity ?? item.resolvedQuantity, chargeUnitsSnapshot: c?.chargeUnits ?? null,
      finalAmountPaiseSnapshot: item.finalAmountPaise, includedSnapshot: item.billingMode === "INCLUDED",
    }; }) },
  };
}

export async function packageSnapshotForQuote(input: Omit<PackageInput, "side"> & { quoteType: "CLIENT" | "VENDOR"; discountPercent: number; remarks?: string }, database: any = prisma) {
  const result = await calculatePackage({ ...input, side: sideForQuoteType(input.quoteType) }, database);
  return packageLineSnapshot(result, input.discountPercent, input.remarks);
}
