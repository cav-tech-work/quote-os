import type { Prisma, PrismaClient } from "@prisma/client";
import { buildCatalogueApplyPlan } from "./apply-plan";
import type { ApplyDestinationSnapshot, CatalogueApplyPlan } from "./apply-plan";
import type { CataloguePreview } from "./types";
import type { ReviewDecisions } from "./review";
import { reviewDecisionFileHash, reviewDecisionHash } from "./review";

export interface ApplyIntegrityReport {
  result: "APPLIED" | "ALREADY_APPLIED" | "DRY_RUN";
  importBatchId: string | null;
  applied: {
    canonicalItems: number;
    commercialOfferings: number;
    aliases: number;
    sourceMappings: number;
    prices: number;
    importRows: number;
  };
  deferred: { sourceRows: number; aliases: number };
  rejected: { sourceRows: number; aliases: number };
  priceCompleteness: { toClientOnly: number; toVendorOnly: number; both: number; neither: number };
  cityValuesIgnored: number;
}

export interface GuardedApplyResult {
  plan: CatalogueApplyPlan;
  report: ApplyIntegrityReport;
}

function metadataDecisionHash(metadata: Prisma.JsonValue | null): string | null {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, Prisma.JsonValue>)["decisionSemanticSha256"];
  return typeof value === "string" ? value : null;
}

export async function loadApplyDestination(prisma: PrismaClient): Promise<ApplyDestinationSnapshot> {
  const [canonicalItems, offerings, aliases, mappings, prices] = await Promise.all([
    prisma.canonicalItem.findMany(),
    prisma.commercialOffering.findMany({ include: { canonicalItem: { select: { code: true } } } }),
    prisma.alias.findMany({ where: { canonicalItemId: { not: null } }, include: { canonicalItem: { select: { code: true } } } }),
    prisma.sourceMapping.findMany({
      where: { sourceSystem: "CAV_MASTER_WORKBOOK", sourceSheet: "RateChart" },
      include: { canonicalItem: { select: { code: true } }, commercialOffering: { select: { code: true } } },
    }),
    prisma.price.findMany({
      where: { scopeType: "GLOBAL", marketId: null, active: true },
      include: { commercialOffering: { select: { code: true } } },
    }),
  ]);
  const mappingMap = new Map<string, { canonicalCode: string | null; offeringCode: string | null; description: string }>();
  for (const mapping of mappings) {
    if (!mapping.sourceCode) continue;
    if (mappingMap.has(mapping.sourceCode)) throw new Error(`DESTINATION_CONFLICT: duplicate source mappings for ${mapping.sourceCode}`);
    mappingMap.set(mapping.sourceCode, { canonicalCode: mapping.canonicalItem?.code ?? null, offeringCode: mapping.commercialOffering?.code ?? null, description: mapping.sourceDescription });
  }
  const priceMap = new Map<string, { id: string; amountPaise: number }>();
  for (const price of prices) {
    const key = `${price.commercialOffering.code}\u0000${price.side}`;
    if (priceMap.has(key)) throw new Error(`DESTINATION_CONFLICT: multiple active GLOBAL ${price.side} prices for ${price.commercialOffering.code}`);
    priceMap.set(key, { id: price.id, amountPaise: price.amountPaise });
  }
  return {
    canonicalItems: new Map(canonicalItems.map((item) => [item.code, { name: item.name, domain: item.domain, entityType: item.entityType, defaultUnit: item.defaultUnit }])),
    offerings: new Map(offerings.map((item) => [item.code, { name: item.name, canonicalCode: item.canonicalItem?.code ?? null, billingUnit: item.billingUnit, quantityBasis: item.quantityBasis, durationBasis: item.durationBasis, kind: item.kind }])),
    aliases: new Set(aliases.flatMap((alias) => alias.canonicalItem ? [`${alias.canonicalItem.code}\u0000${alias.normalizedText}`] : [])),
    sourceMappings: mappingMap,
    prices: priceMap,
  };
}

function priceCompleteness(plan: CatalogueApplyPlan): ApplyIntegrityReport["priceCompleteness"] {
  const sides = new Map<string, Set<string>>();
  for (const price of plan.prices) {
    const values = sides.get(price.offeringCode) ?? new Set<string>();
    values.add(price.side);
    sides.set(price.offeringCode, values);
  }
  const result = { toClientOnly: 0, toVendorOnly: 0, both: 0, neither: 0 };
  for (const offering of plan.commercialOfferings) {
    const values = sides.get(offering.code) ?? new Set<string>();
    if (values.has("TO_CLIENT") && values.has("TO_VENDOR")) result.both += 1;
    else if (values.has("TO_CLIENT")) result.toClientOnly += 1;
    else if (values.has("TO_VENDOR")) result.toVendorOnly += 1;
    else result.neither += 1;
  }
  return result;
}

function reportFor(plan: CatalogueApplyPlan, result: ApplyIntegrityReport["result"], importBatchId: string | null): ApplyIntegrityReport {
  return {
    result,
    importBatchId,
    applied: {
      canonicalItems: plan.canonicalItems.length,
      commercialOfferings: plan.commercialOfferings.length,
      aliases: plan.aliases.length,
      sourceMappings: plan.sourceMappings.length,
      prices: plan.prices.length,
      importRows: result === "DRY_RUN" ? 0 : 0,
    },
    deferred: { sourceRows: plan.summary.deferredSourceRows, aliases: plan.summary.deferredAliases },
    rejected: { sourceRows: plan.summary.rejectedSourceRows, aliases: plan.summary.rejectedAliases },
    priceCompleteness: priceCompleteness(plan),
    cityValuesIgnored: plan.summary.cityValuesIgnored,
  };
}

export async function guardedCatalogueApply(
  prisma: PrismaClient,
  preview: CataloguePreview,
  decisions: ReviewDecisions,
  options: { execute: boolean; induceFailureAfterOfferings?: boolean } = { execute: false },
): Promise<GuardedApplyResult> {
  const decisionHash = reviewDecisionHash(decisions);
  const decisionFileHash = reviewDecisionFileHash(decisions);
  const existingBatch = await prisma.importBatch.findUnique({
    where: { sourceType_fileHash: { sourceType: "ACTIVE_COMMERCIAL_MASTER", fileHash: preview.fileHash } },
  });
  const destination = await loadApplyDestination(prisma);
  const plan = buildCatalogueApplyPlan(preview, decisions, destination);

  if (existingBatch) {
    if (existingBatch.status !== "APPLIED" || metadataDecisionHash(existingBatch.metadata) !== decisionHash) {
      throw new Error("IMPORT_CONFLICT: workbook hash already has a different or incomplete review application");
    }
    plan.alreadyApplied = true;
    const report = reportFor(plan, "ALREADY_APPLIED", existingBatch.id);
    report.applied.importRows = await prisma.importRow.count({ where: { importBatchId: existingBatch.id } });
    return { plan, report };
  }

  if (!options.execute) return { plan, report: reportFor(plan, "DRY_RUN", null) };

  const result = await prisma.$transaction(async (tx) => {
    const batch = await tx.importBatch.create({
      data: {
        sourceType: "ACTIVE_COMMERCIAL_MASTER",
        filename: preview.sourceFile,
        fileHash: preview.fileHash,
        status: "APPLIED",
        appliedAt: new Date(),
        rowCount: preview.sourceRows.rateChart.length + preview.sourceRows.lookup.length,
        warningCount: preview.summary.warnings,
        errorCount: preview.summary.errors,
        metadata: {
          parserVersion: preview.parserVersion,
          reviewSchemaVersion: decisions.schemaVersion,
          decisionFileSha256: decisionFileHash,
          decisionSemanticSha256: decisionHash,
          approvalPolicy: decisions.policy,
          cityValuesIgnored: preview.summary.cityValues,
          deferredSourceRows: plan.summary.deferredSourceRows,
          rejectedSourceRows: plan.summary.rejectedSourceRows,
        },
      },
    });

    const canonicalIds = new Map<string, string>();
    for (const item of plan.canonicalItems) {
      const canonical = await tx.canonicalItem.upsert({
        where: { code: item.code },
        create: { code: item.code, name: item.name, domain: item.domain, entityType: null, defaultUnit: null },
        update: { name: item.name, domain: item.domain },
      });
      canonicalIds.set(item.code, canonical.id);
    }

    const offeringIds = new Map<string, string>();
    for (const item of plan.commercialOfferings) {
      const update: Prisma.CommercialOfferingUpdateInput = {
        name: item.name,
        canonicalItem: { connect: { id: canonicalIds.get(item.canonicalCode)! } },
        billingUnit: item.billingUnit,
        ...(item.quantityBasis ? { quantityBasis: item.quantityBasis } : {}),
        ...(item.durationBasis ? { durationBasis: item.durationBasis } : {}),
      };
      const offering = await tx.commercialOffering.upsert({
        where: { code: item.code },
        create: {
          code: item.code,
          name: item.name,
          kind: null,
          canonicalItemId: canonicalIds.get(item.canonicalCode)!,
          quantityBasis: item.quantityBasis,
          durationBasis: item.durationBasis,
          billingUnit: item.billingUnit,
        },
        update,
      });
      offeringIds.set(item.code, offering.id);
    }

    if (options.induceFailureAfterOfferings) throw new Error("INDUCED_APPLY_FAILURE");

    for (const alias of plan.aliases.filter((item) => item.action === "CREATE")) {
      await tx.alias.create({
        data: {
          canonicalItemId: canonicalIds.get(alias.targetCanonicalCode)!,
          normalizedText: alias.normalizedText,
          originalText: alias.originalText,
          source: "CAV_MASTER_WORKBOOK",
        },
      });
    }

    for (const mapping of plan.sourceMappings) {
      const existing = await tx.sourceMapping.findFirst({
        where: { sourceSystem: "CAV_MASTER_WORKBOOK", sourceSheet: "RateChart", sourceCode: mapping.sourceCode },
      });
      const data = {
        sourceFile: preview.sourceFile,
        sourceDescription: mapping.sourceDescription,
        canonicalItemId: canonicalIds.get(mapping.canonicalCode)!,
        commercialOfferingId: offeringIds.get(mapping.offeringCode)!,
        confidence: 1,
        validated: true,
        notes: `Approval: ${mapping.approval.join(", ")}`,
        importBatchId: batch.id,
      };
      if (existing) await tx.sourceMapping.update({ where: { id: existing.id }, data });
      else await tx.sourceMapping.create({ data: { sourceSystem: "CAV_MASTER_WORKBOOK", sourceSheet: "RateChart", sourceCode: mapping.sourceCode, ...data } });
    }

    for (const price of plan.prices) {
      if (price.existingPriceId) {
        await tx.price.update({ where: { id: price.existingPriceId }, data: { amountPaise: price.amountPaise, sourceImportId: batch.id, active: true } });
      } else {
        await tx.price.create({
          data: {
            commercialOfferingId: offeringIds.get(price.offeringCode)!,
            side: price.side,
            scopeType: "GLOBAL",
            marketId: null,
            amountPaise: price.amountPaise,
            sourceImportId: batch.id,
          },
        });
      }
    }

    const rowDisposition = new Map(plan.rows.map((row) => [row.sourceCode, row]));
    const importRows: Prisma.ImportRowCreateManyInput[] = [];
    for (const row of preview.sourceRows.rateChart) {
      const sourceCode = typeof row.values["Code"] === "string" ? row.values["Code"].trim().toUpperCase() : null;
      const disposition = sourceCode ? rowDisposition.get(sourceCode) : null;
      importRows.push({
        importBatchId: batch.id,
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        rawData: row.values as Prisma.InputJsonValue,
        rowHash: row.rowHash,
        status: disposition?.disposition === "APPLY" ? "APPLIED" : "SKIPPED",
        message: disposition?.reason ?? "No applicable source-row decision",
      });
    }
    const appliedCodes = new Set(plan.rows.filter((row) => row.disposition === "APPLY").map((row) => row.sourceCode));
    for (const row of preview.sourceRows.lookup) {
      const sourceCode = typeof row.values["Code"] === "string" ? row.values["Code"].trim().toUpperCase() : null;
      importRows.push({
        importBatchId: batch.id,
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        rawData: row.values as Prisma.InputJsonValue,
        rowHash: row.rowHash,
        status: sourceCode && appliedCodes.has(sourceCode) ? "APPLIED" : "SKIPPED",
        message: sourceCode && appliedCodes.has(sourceCode) ? "Normalization evidence used by an applied source row" : "Normalization evidence not used by an applied source row",
      });
    }
    await tx.importRow.createMany({ data: importRows });
    return { batchId: batch.id, importRows: importRows.length };
  });

  const report = reportFor(plan, "APPLIED", result.batchId);
  report.applied.importRows = result.importRows;
  return { plan, report };
}

export function formatIntegrityReport(report: ApplyIntegrityReport): string {
  return [
    `Result: ${report.result}`,
    `ImportBatch: ${report.importBatchId ?? "none"}`,
    `Applied: ${report.applied.canonicalItems} canonical items, ${report.applied.commercialOfferings} offerings, ${report.applied.aliases} aliases, ${report.applied.sourceMappings} mappings, ${report.applied.prices} prices, ${report.applied.importRows} provenance rows`,
    `Deferred: ${report.deferred.sourceRows} source rows, ${report.deferred.aliases} aliases`,
    `Rejected: ${report.rejected.sourceRows} source rows, ${report.rejected.aliases} aliases`,
    `Price completeness: ${report.priceCompleteness.toClientOnly} client-only, ${report.priceCompleteness.toVendorOnly} vendor-only, ${report.priceCompleteness.both} both, ${report.priceCompleteness.neither} neither`,
    `City values ignored for active pricing: ${report.cityValuesIgnored}`,
  ].join("\n");
}
