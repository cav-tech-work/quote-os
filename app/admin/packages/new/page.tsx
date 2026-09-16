import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppSidebar } from "@/app/components/app-sidebar";
import { PackageBuilder, type PackageBuilderInitial } from "./package-builder";

export const dynamic = "force-dynamic";

export default async function NewPackagePage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const user = await getCurrentUser();
  if (!user?.active || user.role !== "ADMIN") redirect("/");
  const from = (await searchParams).from;
  let initial: PackageBuilderInitial | null = null;
  if (from) {
    const source = await prisma.packageTemplate.findUnique({ where: { id: from }, include: { components: { orderBy: { sortOrder: "asc" }, include: { commercialOffering: { include: { canonicalItem: true } } } } } });
    if (source) initial = { code: source.code, name: source.name, description: source.description ?? "", version: source.version + 1, pricingMode: source.pricingMode === "HYBRID" ? "COMPONENT_SUM" : source.pricingMode, parentCommercialOfferingId: source.parentCommercialOfferingId ?? "", components: source.components.map((component) => ({ id: component.commercialOffering.id, name: component.commercialOffering.name, elementCode: component.commercialOffering.code, parentCode: component.commercialOffering.canonicalItem?.code ?? null, billingUnit: component.commercialOffering.billingUnit, pricingFamily: component.commercialOffering.pricingFamily, quantityBasis: component.commercialOffering.quantityBasis, quantityValue: component.quantityValue.toString(), billingMode: component.billingMode, dutyUnitsPerPerson: component.dutyUnitsPerPerson?.toString() ?? "" })) };
  }
  return <main className="app"><AppSidebar isAdmin isAccessManager={user.accessManager} /><PackageBuilder initial={initial} /></main>;
}
