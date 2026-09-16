import { Prisma, type PackageComponentBillingMode, type PackagePricingMode, type PackageQuantityRuleType } from "@prisma/client";
import { ExactDecimal } from "@/lib/catalogue-calculation/decimal";
import { prisma } from "@/lib/prisma";
import { calculateNormalizedLine, NormalizedQuoteError } from "@/lib/normalized-quotes";
import { resolveCurrentGlobalRate } from "@/lib/catalogue-calculation";

export class PackageDefinitionError extends Error { constructor(public code: "PACKAGE_DEFINITION_INVALID" | "PACKAGE_VERSION_IMMUTABLE", message: string) { super(message); this.name = "PackageDefinitionError"; } }
export type PackageDefinition = { code: string; name: string; description?: string; version: number; pricingMode: PackagePricingMode; parentCommercialOfferingId?: string; active?: boolean; components: Array<{ commercialOfferingId: string; quantityRuleType: PackageQuantityRuleType; quantityValue: string; billingMode: PackageComponentBillingMode; dutyUnitsPerPerson?: string; sortOrder: number; required?: boolean; notes?: string }> };

async function validatePackageDefinition(input: PackageDefinition, database: any) {
  if (!/^[A-Z0-9_]+$/.test(input.code) || input.version < 1 || !Number.isInteger(input.version) || !input.components.length) throw new PackageDefinitionError("PACKAGE_DEFINITION_INVALID", "Package code, positive integer version, and at least one component are required.");
  if (input.pricingMode === "HYBRID") throw new PackageDefinitionError("PACKAGE_DEFINITION_INVALID", "HYBRID runtime definitions are deferred in V1.");
  if ((input.pricingMode === "FIXED_PACKAGE") !== Boolean(input.parentCommercialOfferingId)) throw new PackageDefinitionError("PACKAGE_DEFINITION_INVALID", "FIXED_PACKAGE requires one parent offering; COMPONENT_SUM must not have one.");
  if (input.pricingMode === "FIXED_PACKAGE" && input.components.some((item) => item.billingMode !== "INCLUDED")) throw new PackageDefinitionError("PACKAGE_DEFINITION_INVALID", "FIXED_PACKAGE components must be INCLUDED to prevent double charging.");
  const order = new Set<number>();
  for (const component of input.components) {
    const quantity = ExactDecimal.parse(component.quantityValue); const duties = component.dutyUnitsPerPerson ? ExactDecimal.parse(component.dutyUnitsPerPerson) : null;
    if (order.has(component.sortOrder) || !Number.isInteger(component.sortOrder) || !quantity || quantity.compare(new ExactDecimal(0n)) <= 0 || (component.dutyUnitsPerPerson && (!duties || duties.compare(new ExactDecimal(0n)) <= 0))) throw new PackageDefinitionError("PACKAGE_DEFINITION_INVALID", "Component order must be unique and quantities/duties must be positive.");
    order.add(component.sortOrder);
  }
  const ids = [...new Set([...input.components.map((item) => item.commercialOfferingId), ...(input.parentCommercialOfferingId ? [input.parentCommercialOfferingId] : [])])];
  const offerings = await database.commercialOffering.findMany({ where: { id: { in: ids } }, include: { canonicalItem: true, durationPolicy: { include: { points: { orderBy: { sortOrder: "asc" } } } } } });
  if (offerings.length !== ids.length || offerings.some((item: any) => !item.active)) throw new PackageDefinitionError("PACKAGE_DEFINITION_INVALID", "Every parent/component offering must exist and be active.");
  const byId = new Map<string, any>(offerings.map((item: any) => [item.id, item]));
  if (input.parentCommercialOfferingId && byId.get(input.parentCommercialOfferingId)?.kind !== "PACKAGE") throw new PackageDefinitionError("PACKAGE_DEFINITION_INVALID", "Parent offering must have PACKAGE kind.");
  if (input.components.some((item) => byId.get(item.commercialOfferingId)?.kind === "PACKAGE")) throw new PackageDefinitionError("PACKAGE_DEFINITION_INVALID", "Nested packages are not supported.");
  return byId;
}

export async function createPackageVersion(input: PackageDefinition, database: any = prisma) {
  await validatePackageDefinition(input, database);
  if (await database.packageTemplate.findUnique({ where: { code_version: { code: input.code, version: input.version } }, select: { id: true } })) throw new PackageDefinitionError("PACKAGE_DEFINITION_INVALID", `Package ${input.code} version ${input.version} already exists.`);
  try {
    return await database.packageTemplate.create({ data: { code: input.code, name: input.name, description: input.description?.trim() || null, version: input.version, pricingMode: input.pricingMode, parentCommercialOfferingId: input.parentCommercialOfferingId ?? null, active: input.active ?? false, authority: "INTERNAL_APPROVED", components: { create: input.components.map((item) => ({ ...item, quantityValue: new Prisma.Decimal(item.quantityValue), dutyUnitsPerPerson: item.dutyUnitsPerPerson ? new Prisma.Decimal(item.dutyUnitsPerPerson) : null, required: item.required ?? true, notes: item.notes?.trim() || null })) } }, include: { components: true } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new PackageDefinitionError("PACKAGE_DEFINITION_INVALID", `Package ${input.code} version ${input.version} already exists.`);
    throw error;
  }
}

export async function previewPackageDefinition(input: PackageDefinition, database: any = prisma) {
  const offerings = await validatePackageDefinition({ ...input, active: false }, database);
  const rows = [];
  for (const component of [...input.components].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const offering = offerings.get(component.commercialOfferingId)!;
    const quantity = ExactDecimal.parse(component.quantityValue)!.toFixed();
    const configuration = offering.quantityBasis === "HEADCOUNT_DUTY"
      ? { headcount: quantity, dutyUnitsPerPerson: component.dutyUnitsPerPerson }
      : { quantity };
    const sides: Record<"TO_CLIENT" | "TO_VENDOR", { state: string; priceId: string | null; unitRatePaise: number | null; amountPaise: number | null }> = {} as Record<"TO_CLIENT" | "TO_VENDOR", { state: string; priceId: string | null; unitRatePaise: number | null; amountPaise: number | null }>;
    for (const side of ["TO_CLIENT", "TO_VENDOR"] as const) {
      const rate = await resolveCurrentGlobalRate(offering.id, side, database);
      if (rate.state !== "RATE_FOUND") {
        sides[side] = { state: "RATE_MISSING", priceId: null, unitRatePaise: null, amountPaise: null };
        continue;
      }
      try {
        const calculated = await calculateNormalizedLine({ commercialOfferingId: offering.id, configuration, usageDays: "1", expectedPriceId: rate.priceId }, side, database);
        sides[side] = { state: "READY", priceId: rate.priceId, unitRatePaise: rate.amountPaise, amountPaise: calculated.calculation.finalAmountPaise };
      } catch (error) {
        sides[side] = error instanceof NormalizedQuoteError
          ? { state: error.code, priceId: rate.priceId, unitRatePaise: rate.amountPaise, amountPaise: null }
          : (() => { throw error; })();
      }
    }
    rows.push({
      commercialOfferingId: offering.id,
      name: offering.name,
      elementCode: offering.code,
      parentCode: offering.canonicalItem?.code ?? null,
      billingUnit: offering.billingUnit,
      billingMode: component.billingMode,
      quantity,
      sides,
    });
  }
  return { code: input.code, name: input.name, version: input.version, pricingMode: input.pricingMode, rows };
}

export async function setPackageActive(id: string, active: boolean, database: any = prisma) {
  const pkg = await database.packageTemplate.findUnique({ where: { id }, include: { components: true } });
  if (!pkg) throw new PackageDefinitionError("PACKAGE_DEFINITION_INVALID", "Package template was not found.");
  return database.packageTemplate.update({ where: { id }, data: { active } });
}
