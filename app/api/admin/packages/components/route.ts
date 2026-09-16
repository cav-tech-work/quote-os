import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeComponentText } from "@/lib/component-reconciliation/source";

export async function GET(request: NextRequest) {
  const access = await requireRole("ADMIN");
  if ("error" in access) return access.error;
  const search = normalizeComponentText(request.nextUrl.searchParams.get("search") ?? "");
  const packageParents = request.nextUrl.searchParams.get("kind") === "PACKAGE";
  const offerings = await prisma.commercialOffering.findMany({
    where: { active: true, ...(packageParents ? { kind: "PACKAGE" as const } : { NOT: { kind: "PACKAGE" as const } }) },
    orderBy: [{ name: "asc" }, { code: "asc" }],
    include: {
      canonicalItem: { select: { code: true, name: true } },
      aliases: { where: { active: true }, select: { originalText: true } },
      sourceMappings: { select: { sourceDescription: true, notes: true } },
      prices: { where: { active: true, scopeType: "GLOBAL", marketId: null }, select: { id: true, side: true, amountPaise: true } },
    },
  });
  const result = offerings.filter((offering) => {
    if (!search) return true;
    return [offering.name, offering.code, offering.canonicalItem?.name, offering.canonicalItem?.code, ...offering.aliases.map((item) => item.originalText), ...offering.sourceMappings.flatMap((item) => [item.sourceDescription, item.notes])]
      .some((value) => value && normalizeComponentText(value).includes(search));
  }).slice(0, 100).map((offering) => ({
    id: offering.id,
    name: offering.name,
    elementCode: offering.code,
    parentCode: offering.canonicalItem?.code ?? null,
    parentName: offering.canonicalItem?.name ?? null,
    billingUnit: offering.billingUnit,
    pricingFamily: offering.pricingFamily,
    quantityBasis: offering.quantityBasis,
    rates: Object.fromEntries(offering.prices.map((price) => [price.side, { id: price.id, amountPaise: price.amountPaise }])),
  }));
  return NextResponse.json({ components: result });
}
