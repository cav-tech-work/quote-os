import { normalizeComponentText } from "@/lib/component-reconciliation/source";
import { prisma } from "@/lib/prisma";

export type ComponentSearchKind = "ELEMENT" | "PACKAGE";
export type ComponentSearchResult = {
  id: string;
  name: string;
  elementCode: string;
  parentCode: string | null;
  parentName: string | null;
  billingUnit: string | null;
  pricingFamily: string | null;
  quantityBasis: string | null;
  businessReviewStatus?: string | null;
  rates?: Record<string, { id: string; amountPaise: number }>;
  evidence: string[];
};

function evidenceFromNotes(notes: string | null) {
  if (!notes) return [];
  try {
    const parsed = JSON.parse(notes) as Record<string, unknown>;
    return [
      parsed.description,
      parsed.mapsTo,
      parsed.sourceLabel,
      ...(Array.isArray(parsed.tags) ? parsed.tags : []),
    ].filter((value): value is string => typeof value === "string" && value.length > 0);
  } catch {
    return [notes];
  }
}

function matchesSearch(component: ComponentSearchResult, normalizedSearch: string) {
  if (!normalizedSearch) return true;
  return [
    component.name,
    component.elementCode,
    component.parentCode,
    component.parentName,
    ...component.evidence,
  ].some((value) => value && normalizeComponentText(value).includes(normalizedSearch));
}

function uniq<T>(items: T[]) {
  return [...new Set(items)];
}

export async function searchSelectableComponents(input: { search?: string; kind?: ComponentSearchKind; includeCodes?: string[]; limit?: number } = {}, database: any = prisma): Promise<ComponentSearchResult[]> {
  const kind = input.kind ?? "ELEMENT";
  const normalizedSearch = normalizeComponentText(input.search ?? "");
  const includeCodes = uniq((input.includeCodes ?? []).filter(Boolean));
  const limit = input.limit ?? 100;
  const offerings = await database.commercialOffering.findMany({
    where: {
      active: true,
      ...(kind === "PACKAGE"
        ? { kind: "PACKAGE" as const }
        : { OR: [{ kind: null }, { kind: "ITEM" as const }, { kind: "SERVICE" as const }] }),
    },
    orderBy: [{ name: "asc" }, { code: "asc" }],
    include: {
      canonicalItem: { select: { code: true, name: true } },
      aliases: { where: { active: true }, select: { originalText: true } },
      sourceMappings: { select: { sourceDescription: true, notes: true } },
      businessReview: { select: { status: true } },
      prices: { where: { active: true, scopeType: "GLOBAL", marketId: null }, select: { id: true, side: true, amountPaise: true } },
    },
  });
  const mapped: ComponentSearchResult[] = offerings.map((offering: any) => ({
    id: offering.id,
    name: offering.name,
    elementCode: offering.code,
    parentCode: offering.canonicalItem?.code ?? null,
    parentName: offering.canonicalItem?.name ?? null,
    billingUnit: offering.billingUnit,
    pricingFamily: offering.pricingFamily,
    quantityBasis: offering.quantityBasis,
    businessReviewStatus: offering.businessReview?.status ?? null,
    rates: Object.fromEntries((offering.prices ?? []).map((price: any) => [price.side, { id: price.id, amountPaise: price.amountPaise }])),
    evidence: uniq([
      ...offering.aliases.map((item: any) => item.originalText),
      ...offering.sourceMappings.flatMap((item: any) => [item.sourceDescription, ...evidenceFromNotes(item.notes)]),
    ]),
  }));
  const included = mapped.filter((component) => includeCodes.includes(component.elementCode));
  const searched = mapped.filter((component) => matchesSearch(component, normalizedSearch));
  const byCode = new Map<string, ComponentSearchResult>();
  for (const component of [...included, ...searched]) if (!byCode.has(component.elementCode)) byCode.set(component.elementCode, component);
  return [...byCode.values()].slice(0, Math.max(limit, included.length));
}

export async function getSelectableComponentById(id: string, database: any = prisma) {
  return (await searchSelectableComponents({ limit: Number.MAX_SAFE_INTEGER }, database)).find((component) => component.id === id) ?? null;
}
