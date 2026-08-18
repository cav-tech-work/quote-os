import { Prisma, type PackageComponentBillingMode, type PackagePricingMode, type PackageQuantityRuleType } from "@prisma/client";
import { ExactDecimal } from "@/lib/catalogue-calculation/decimal";
import { prisma } from "@/lib/prisma";

export class PackageDefinitionError extends Error { constructor(public code: "PACKAGE_DEFINITION_INVALID" | "PACKAGE_VERSION_IMMUTABLE", message: string) { super(message); this.name = "PackageDefinitionError"; } }
export type PackageDefinition = { code: string; name: string; description?: string; version: number; pricingMode: PackagePricingMode; parentCommercialOfferingId?: string; active?: boolean; components: Array<{ commercialOfferingId: string; quantityRuleType: PackageQuantityRuleType; quantityValue: string; billingMode: PackageComponentBillingMode; dutyUnitsPerPerson?: string; sortOrder: number; required?: boolean; notes?: string }> };

export async function createPackageVersion(input: PackageDefinition, database: any = prisma) {
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
  const offerings = await database.commercialOffering.findMany({ where: { id: { in: ids } } });
  if (offerings.length !== ids.length || offerings.some((item: any) => !item.active)) throw new PackageDefinitionError("PACKAGE_DEFINITION_INVALID", "Every parent/component offering must exist and be active.");
  const byId = new Map<string, any>(offerings.map((item: any) => [item.id, item]));
  if (input.parentCommercialOfferingId && byId.get(input.parentCommercialOfferingId)?.kind !== "PACKAGE") throw new PackageDefinitionError("PACKAGE_DEFINITION_INVALID", "Parent offering must have PACKAGE kind.");
  if (input.components.some((item) => byId.get(item.commercialOfferingId)?.kind === "PACKAGE")) throw new PackageDefinitionError("PACKAGE_DEFINITION_INVALID", "Nested packages are not supported.");
  return database.packageTemplate.create({ data: { code: input.code, name: input.name, description: input.description?.trim() || null, version: input.version, pricingMode: input.pricingMode, parentCommercialOfferingId: input.parentCommercialOfferingId ?? null, active: input.active ?? false, authority: "INTERNAL_APPROVED", components: { create: input.components.map((item) => ({ ...item, quantityValue: new Prisma.Decimal(item.quantityValue), dutyUnitsPerPerson: item.dutyUnitsPerPerson ? new Prisma.Decimal(item.dutyUnitsPerPerson) : null, required: item.required ?? true, notes: item.notes?.trim() || null })) } }, include: { components: true } });
}

export async function setPackageActive(id: string, active: boolean, database: any = prisma) {
  const pkg = await database.packageTemplate.findUnique({ where: { id }, include: { components: true } });
  if (!pkg) throw new PackageDefinitionError("PACKAGE_DEFINITION_INVALID", "Package template was not found.");
  return database.packageTemplate.update({ where: { id }, data: { active } });
}
