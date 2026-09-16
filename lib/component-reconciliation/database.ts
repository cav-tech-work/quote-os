import { Prisma, type PrismaClient, type UnitCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeAlias, stableJson } from "@/lib/catalogue-import/normalize";
import { getSelectableComponentById, searchSelectableComponents } from "@/lib/component-search";
import { buildComponentReconciliationPreview } from "./reconcile";
import type { ComponentReconciliationPreview, DestinationOffering, LookupComponent, SourceProfile } from "./types";

const LOOKUP_SOURCE = "CAV_LOOKUP_V1";
export const CCI_COMPONENT_SOURCE = "CCI_BOQ_COMPONENT_V1";

export function assertLocalDevelopmentDatabase(databaseUrl = process.env.DATABASE_URL ?? "") {
  let url: URL;
  try { url = new URL(databaseUrl); } catch { throw new Error("A valid local development DATABASE_URL is required."); }
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) throw new Error("PRODUCTION_ISOLATION: component reconciliation may run only against localhost PostgreSQL.");
}

export async function loadComponentDestination(database: PrismaClient = prisma): Promise<DestinationOffering[]> {
  const offerings = await database.commercialOffering.findMany({
    include: {
      canonicalItem: { select: { code: true, name: true } },
      aliases: { where: { active: true }, select: { originalText: true } },
      sourceMappings: { select: { sourceDescription: true } },
    },
  });
  return offerings.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    canonicalCode: item.canonicalItem?.code ?? null,
    canonicalName: item.canonicalItem?.name ?? null,
    aliases: item.aliases.map((alias) => alias.originalText),
    sourceDescriptions: item.sourceMappings.map((mapping) => mapping.sourceDescription),
  }));
}

function sourceBillingUnit(row: LookupComponent): UnitCode {
  if (row.billingUnit) return row.billingUnit;
  const raw = row.rawBillingUnit?.toLocaleLowerCase("en-IN") ?? "";
  if (/sq\s*ft|sqft/.test(raw)) return "SQ_FT";
  return "NOS";
}

function lookupNotes(preview: ComponentReconciliationPreview, row: LookupComponent) {
  return stableJson({
    schema: "quoteos-component-source-v1",
    workbookSha256: preview.lookupFileHash,
    sourceRow: row.rowNumber,
    parentCode: row.parentCode,
    elementCode: row.elementCode,
    description: row.description,
    mapsTo: row.mapsTo,
    tags: row.tags,
  });
}

function cciNotes(preview: ComponentReconciliationPreview, item: ComponentReconciliationPreview["cci"][number], status: "CONFIRMED" | "REVIEW_REQUIRED" | "DEFERRED" = item.matchType === "EXACT_MATCH" || item.matchType === "ALIAS_MATCH" ? "CONFIRMED" : "REVIEW_REQUIRED") {
  return stableJson({
    schema: "quoteos-cci-component-label-v1",
    workbookSha256: preview.cciFileHash,
    decisionOrigin: "AUTOMATIC",
    sourceLabel: item.sourceLabel,
    normalizedText: item.normalizedText,
    cities: item.cities,
    matchType: item.matchType,
    status,
    candidates: item.candidates,
  });
}

async function ensureAlias(tx: any, offeringId: string, originalText: string, source: string) {
  const normalizedText = normalizeAlias(originalText);
  const existing = await tx.alias.findFirst({ where: { commercialOfferingId: offeringId, normalizedText, source } });
  if (existing) return false;
  await tx.alias.create({ data: { commercialOfferingId: offeringId, originalText, normalizedText, source, active: true } });
  return true;
}

async function ensureMapping(tx: any, input: { sourceSystem: string; sourceFile: string; sourceSheet: string; sourceCode: string | null; sourceDescription: string; canonicalItemId?: string | null; commercialOfferingId?: string | null; confidence?: Prisma.Decimal | null; validated: boolean; notes: string }) {
  const candidates = await tx.sourceMapping.findMany({ where: { sourceSystem: input.sourceSystem, sourceFile: input.sourceFile, sourceSheet: input.sourceSheet, sourceCode: input.sourceCode, sourceDescription: input.sourceDescription } });
  const desiredHash = (() => { try { return JSON.parse(input.notes).workbookSha256 as string; } catch { return null; } })();
  const existing = candidates.find((candidate: { notes: string | null }) => { try { return JSON.parse(candidate.notes ?? "{}").workbookSha256 === desiredHash; } catch { return false; } });
  if (existing) {
    const prior = (() => { try { return JSON.parse(existing.notes ?? "{}"); } catch { return null; } })();
    if (input.sourceSystem === CCI_COMPONENT_SOURCE && prior?.decisionOrigin === "HUMAN") return false;
    await tx.sourceMapping.update({ where: { id: existing.id }, data: { canonicalItemId: input.canonicalItemId ?? null, commercialOfferingId: input.commercialOfferingId ?? null, confidence: input.confidence ?? null, validated: input.validated, notes: input.notes } });
    return false;
  }
  await tx.sourceMapping.create({ data: input });
  return true;
}

export type ComponentApplyReport = {
  canonicalParentsCreated: number;
  offeringsCreated: number;
  offeringsReused: number;
  aliasesCreated: number;
  lookupMappingsCreated: number;
  cciMappingsCreated: number;
  cciMappingsConfirmed: number;
  cciMappingsReviewRequired: number;
  pricesBefore: number;
  pricesAfter: number;
  packagesBefore: number;
  packagesAfter: number;
};

export async function applyComponentReconciliation(profile: SourceProfile, database: PrismaClient = prisma): Promise<{ preview: ComponentReconciliationPreview; report: ComponentApplyReport }> {
  assertLocalDevelopmentDatabase();
  const preview = buildComponentReconciliationPreview(profile, await loadComponentDestination(database));
  if (preview.duplicateElementCodes.length) throw new Error(`Duplicate LookUp element codes: ${preview.duplicateElementCodes.join(", ")}`);
  if (preview.catalogue.some((item) => item.state === "CONFLICT" || item.state === "AMBIGUOUS")) throw new Error("Catalogue identity conflicts require review before apply.");
  const [pricesBefore, packagesBefore] = await Promise.all([database.price.count(), database.packageTemplate.count()]);
  const counters = await database.$transaction(async (tx) => {
    const result = { canonicalParentsCreated: 0, offeringsCreated: 0, offeringsReused: 0, aliasesCreated: 0, lookupMappingsCreated: 0, cciMappingsCreated: 0, cciMappingsConfirmed: 0, cciMappingsReviewRequired: 0 };
    const byElement = new Map<string, { id: string; canonicalItemId: string }>();
    for (const decision of preview.catalogue) {
      const row = decision.row;
      let parent = await tx.canonicalItem.findUnique({ where: { code: row.parentCode } });
      if (!parent) {
        parent = await tx.canonicalItem.create({ data: { code: row.parentCode, name: row.mapsTo, domain: "OTHER", defaultUnit: sourceBillingUnit(row), active: true } });
        result.canonicalParentsCreated += 1;
      }
      let offering = decision.offeringId ? await tx.commercialOffering.findUnique({ where: { id: decision.offeringId } }) : await tx.commercialOffering.findUnique({ where: { code: row.elementCode } });
      if (!offering) {
        offering = await tx.commercialOffering.create({ data: { code: row.elementCode, name: row.description, kind: "ITEM", canonicalItemId: parent.id, billingUnit: sourceBillingUnit(row), active: true, businessReview: { create: { status: "UNREVIEWED" } } } });
        result.offeringsCreated += 1;
      } else {
        if (offering.canonicalItemId !== parent.id && decision.state !== "NEEDS_CODE_LINK") throw new Error(`Element ${row.elementCode} has a conflicting parent.`);
        result.offeringsReused += 1;
        const review = await tx.offeringBusinessReview.findUnique({ where: { commercialOfferingId: offering.id } });
        if (!review) await tx.offeringBusinessReview.create({ data: { commercialOfferingId: offering.id, status: "UNREVIEWED" } });
      }
      byElement.set(row.elementCode, { id: offering.id, canonicalItemId: parent.id });
      for (const alias of [...new Set([row.description, row.mapsTo])]) if (await ensureAlias(tx, offering.id, alias, LOOKUP_SOURCE)) result.aliasesCreated += 1;
      if (await ensureMapping(tx, { sourceSystem: LOOKUP_SOURCE, sourceFile: preview.lookupFile, sourceSheet: "LookUp", sourceCode: row.elementCode, sourceDescription: row.description, canonicalItemId: parent.id, commercialOfferingId: offering.id, confidence: new Prisma.Decimal(1), validated: true, notes: lookupNotes(preview, row) })) result.lookupMappingsCreated += 1;
    }
    for (const item of preview.cci) {
      const automatic = item.matchType === "EXACT_MATCH" || item.matchType === "ALIAS_MATCH";
      const target = automatic && item.matchedElementCode ? byElement.get(item.matchedElementCode) : null;
      if (automatic && !target) throw new Error(`CCI target ${item.matchedElementCode} was not established.`);
      if (target && await ensureAlias(tx, target.id, item.sourceLabel, CCI_COMPONENT_SOURCE)) result.aliasesCreated += 1;
      if (await ensureMapping(tx, { sourceSystem: CCI_COMPONENT_SOURCE, sourceFile: preview.cciFile, sourceSheet: "CITY_HEADERS", sourceCode: item.normalizedText, sourceDescription: item.sourceLabel, canonicalItemId: target?.canonicalItemId ?? null, commercialOfferingId: target?.id ?? null, confidence: automatic ? new Prisma.Decimal(1) : null, validated: automatic, notes: cciNotes(preview, item) })) result.cciMappingsCreated += 1;
      if (automatic) result.cciMappingsConfirmed += 1; else result.cciMappingsReviewRequired += 1;
    }
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  const [pricesAfter, packagesAfter] = await Promise.all([database.price.count(), database.packageTemplate.count()]);
  if (pricesAfter !== pricesBefore) throw new Error("PRICING_BOUNDARY: component reconciliation changed Price rows.");
  if (packagesAfter !== packagesBefore) throw new Error("PACKAGE_BOUNDARY: component reconciliation created a package.");
  return { preview, report: { ...counters, pricesBefore, pricesAfter, packagesBefore, packagesAfter } };
}

export async function previewComponentReconciliation(profile: SourceProfile, database: PrismaClient = prisma) {
  return buildComponentReconciliationPreview(profile, await loadComponentDestination(database));
}

export function parseCciMappingNotes(notes: string | null) {
  if (!notes) return null;
  try { return JSON.parse(notes) as { sourceLabel: string; cities: string[]; matchType: string; status: string; candidates: Array<{ elementCode: string; parentCode: string; description: string; score?: number }>; workbookSha256: string; decisionOrigin?: string }; } catch { return null; }
}

export async function listCciReconciliation(database: PrismaClient = prisma) {
  const mappings = await database.sourceMapping.findMany({ where: { sourceSystem: CCI_COMPONENT_SOURCE }, orderBy: { sourceDescription: "asc" }, include: { commercialOffering: { include: { canonicalItem: true } } } });
  const candidateCodes = [...new Set(mappings.flatMap((mapping) => parseCciMappingNotes(mapping.notes)?.candidates?.map((candidate) => candidate.elementCode) ?? []))];
  const candidateOfferings = new Map((await searchSelectableComponents({ includeCodes: candidateCodes, limit: candidateCodes.length }, database)).map((component) => [component.elementCode, component]));
  return mappings.map((mapping) => {
    const notes = parseCciMappingNotes(mapping.notes);
    return {
      id: mapping.id,
      sourceLabel: mapping.sourceDescription,
      ...notes,
      candidateOfferings: (notes?.candidates ?? []).map((candidate) => ({ ...candidate, offering: candidateOfferings.get(candidate.elementCode) ?? null })),
      matchedOffering: mapping.commercialOffering ? { id: mapping.commercialOffering.id, elementCode: mapping.commercialOffering.code, name: mapping.commercialOffering.name, parentCode: mapping.commercialOffering.canonicalItem?.code ?? null } : null,
      validated: mapping.validated,
    };
  });
}

export async function decideCciReconciliation(input: { id: string; offeringId: string | null; status: "CONFIRMED" | "DEFERRED" }, database: PrismaClient = prisma) {
  const mapping = await database.sourceMapping.findUnique({ where: { id: input.id } });
  if (!mapping || mapping.sourceSystem !== CCI_COMPONENT_SOURCE) throw new Error("Component reconciliation row was not found.");
  const evidence = parseCciMappingNotes(mapping.notes);
  if (!evidence) throw new Error("Component reconciliation evidence is invalid.");
  const selected = input.offeringId ? await getSelectableComponentById(input.offeringId, database) : null;
  const offering = selected ? await database.commercialOffering.findUnique({ where: { id: selected.id }, include: { canonicalItem: true } }) : null;
  if (input.status === "CONFIRMED" && !offering) throw new Error("A component is required to confirm this match.");
  return database.$transaction(async (tx) => {
    if (offering && await ensureAlias(tx, offering.id, mapping.sourceDescription, CCI_COMPONENT_SOURCE)) { /* retained searchable alias */ }
    return tx.sourceMapping.update({ where: { id: mapping.id }, data: { commercialOfferingId: offering?.id ?? null, canonicalItemId: offering?.canonicalItemId ?? null, validated: input.status === "CONFIRMED", confidence: input.status === "CONFIRMED" ? new Prisma.Decimal(1) : null, notes: stableJson({ ...evidence, decisionOrigin: "HUMAN", status: input.status, matchType: input.status === "CONFIRMED" ? "ALIAS_MATCH" : evidence.matchType }) } });
  });
}
