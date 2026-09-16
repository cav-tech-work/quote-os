import { createHash } from "node:crypto";
import {
  Prisma,
  type BusinessReviewField,
  type BusinessReviewStatus,
  type PriceSide,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const BUSINESS_REVIEW_FIELDS: BusinessReviewField[] = [
  "IDENTITY",
  "CATEGORY",
  "BILLING_UNIT",
  "QUANTITY_SEMANTICS",
  "DURATION_POLICY",
  "TO_CLIENT_RATE",
  "TO_VENDOR_RATE",
  "ACTIVE_INCLUSION",
  "PACKAGE_TREATMENT",
];
export class BusinessReviewError extends Error {
  constructor(
    public code:
      | "REVIEW_INVALID"
      | "RELEASE_BLOCKED"
      | "RELEASE_IMMUTABLE"
      | "STALE_REVIEW_IMPORT",
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "BusinessReviewError";
  }
}

const SPECIALIZED_QUESTIONS: Record<string, string> = {
  CCTV_CABL:
    "Choose the billing contract: metre, drop, service, or fixed deployment.",
  CREW_FOOD: "Define whether the rate is per meal, person, day, or engagement.",
  FIRE_TEND:
    "Define whether quantity/rate is per vehicle, trip, deployment, or day.",
  HK_BIOWDUMP:
    "Define system/load/collection/engagement quantity and recurrence.",
  HK_DUMP: "Define area, facility, or fixed-service scope.",
  HK_DUMPTRUC:
    "Define truck/trip/load/post-show service and whether duration applies.",
  HK_HOUSMATE: "Define equipment set versus consumable/refill contract.",
  HK_PESTCONT: "Define visit, treated area, or fixed-service contract.",
  HK_POSTCLEA: "Define area, crew, visit, or fixed post-event engagement.",
  MED_ALSIAMBU:
    "Approve package composition, component quantities/duties, billing roles, duration, and per-package rate meaning.",
  MED_BLSAMBU:
    "Approve package composition, component quantities/duties, billing roles, duration, and rates.",
  MED_FIRSAID:
    "Approve counter/package composition, personnel duties, billing roles, duration, and rates.",
  NET_FIBECABL:
    "Choose metre, running-foot, drop, or fixed-service cabling contract.",
  SEC_QUICRESP:
    "Approve team composition, quantities/duties, billing roles, vehicle inclusion, duration, and rate unit.",
  WC_DRAI: "Define linear system, deployed system, or fixed-service contract.",
  WC_TOILCONS:
    "Define set/refill/service quantity and replenishment recurrence.",
  WTR_WATETANK2:
    "Define tanker/trip/delivery/volume contract and duration recurrence.",
};

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
}
export const deterministicHash = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");

function currentRate(prices: any[], side: PriceSide) {
  const found = prices.filter(
    (price) =>
      price.side === side &&
      price.active &&
      price.scopeType === "GLOBAL" &&
      !price.marketId,
  );
  return found.length === 1 ? found[0] : null;
}
export function deriveOfferingReadiness(offering: any) {
  const client = currentRate(offering.prices ?? [], "TO_CLIENT");
  const vendor = currentRate(offering.prices ?? [], "TO_VENDOR");
  const pkg = offering.kind === "PACKAGE";
  const personnel =
    offering.quantityBasis === "HEADCOUNT_DUTY" &&
    offering.pricingFamily === "HEADCOUNT_DUTY" &&
    offering.billingUnit === "DUTY";
  const ordinary =
    !pkg &&
    ["COUNT", "AREA_LW", "AREA_LH", "LINEAR", "VOLUME", "FIXED"].includes(
      offering.quantityBasis,
    ) &&
    offering.durationPolicy?.active &&
    offering.durationPolicy.authority === "INTERNAL_APPROVED" &&
    offering.durationPolicy.mode !== "MANUAL";
  const packageReady =
    pkg &&
    (offering.parentPackageTemplates ?? []).some(
      (template: any) =>
        template.active && template.authority === "INTERNAL_APPROVED",
    );
  const semantics = offering.active && (ordinary || personnel || packageReady);
  const clientReady = semantics && Boolean(client);
  const vendorReady = semantics && Boolean(vendor);
  let state =
    clientReady && vendorReady
      ? "READY_BOTH"
      : clientReady
        ? "READY_CLIENT_ONLY"
        : vendorReady
          ? "READY_VENDOR_ONLY"
          : !semantics
            ? pkg
              ? "BLOCKED_PACKAGE"
              : offering.quantityBasis === "HEADCOUNT_DUTY" ||
                  offering.quantityBasis === "GENERATOR"
                ? "BLOCKED_SPECIALIZED"
                : !offering.quantityBasis
                  ? "BLOCKED_SEMANTICS"
                  : "BLOCKED_DURATION"
            : "BLOCKED_RATE";
  return {
    state,
    clientReady,
    vendorReady,
    clientRate: client,
    vendorRate: vendor,
    missingClientRate: !client,
    missingVendorRate: !vendor,
    semanticQuestion: SPECIALIZED_QUESTIONS[offering.code] ?? null,
  };
}

const reviewInclude = {
  canonicalItem: true,
  durationPolicy: {
    include: { points: { orderBy: { sortOrder: "asc" as const } } },
  },
  prices: true,
  aliases: true,
  sourceMappings: { include: { importBatch: true } },
  parentPackageTemplates: {
    include: {
      components: {
        orderBy: { sortOrder: "asc" as const },
        include: { commercialOffering: true },
      },
    },
  },
  businessReview: {
    include: {
      fields: true,
      reviewedBy: { select: { name: true, email: true } },
      audits: {
        orderBy: { createdAt: "desc" as const },
        include: { actor: { select: { name: true, email: true } } },
      },
    },
  },
};
export async function listBusinessReviewOfferings(database: any = prisma) {
  const offerings = await database.commercialOffering.findMany({
    orderBy: { code: "asc" },
    include: reviewInclude,
  });
  return offerings.map((offering: any) => ({
    ...offering,
    reviewStatus: offering.businessReview?.status ?? "UNREVIEWED",
    fieldReviews: offering.businessReview?.fields ?? [],
    readiness: deriveOfferingReadiness(offering),
    sourceEvidence: offering.sourceMappings.map((mapping: any) => ({
      sourceSystem: mapping.sourceSystem,
      sourceFile: mapping.sourceFile ?? mapping.importBatch?.filename ?? null,
      sourceSheet: mapping.sourceSheet,
      sourceCode: mapping.sourceCode,
      sourceDescription: mapping.sourceDescription,
      notes: mapping.notes,
      validated: mapping.validated,
    })),
  }));
}

export async function catalogueFingerprint(database: any = prisma) {
  const rows = await listBusinessReviewOfferings(database);
  return deterministicHash(
    rows.map((row: any) => ({
      code: row.code,
      name: row.name,
      kind: row.kind,
      canonical: row.canonicalItem
        ? {
            code: row.canonicalItem.code,
            name: row.canonicalItem.name,
            domain: row.canonicalItem.domain,
            entityType: row.canonicalItem.entityType,
          }
        : null,
      active: row.active,
      billingUnit: row.billingUnit,
      quantityBasis: row.quantityBasis,
      pricingFamily: row.pricingFamily,
      durationPolicy: row.durationPolicy
        ? {
            id: row.durationPolicy.id,
            code: row.durationPolicy.code,
            mode: row.durationPolicy.mode,
            authority: row.durationPolicy.authority,
            points: row.durationPolicy.points,
          }
        : null,
      prices: row.prices
        .filter(
          (price: any) =>
            price.active && price.scopeType === "GLOBAL" && !price.marketId,
        )
        .map((price: any) => ({
          id: price.id,
          side: price.side,
          amountPaise: price.amountPaise,
        }))
        .sort((a: any, b: any) => a.side.localeCompare(b.side)),
      packages: row.parentPackageTemplates.map((pkg: any) => ({
        id: pkg.id,
        code: pkg.code,
        version: pkg.version,
        active: pkg.active,
        mode: pkg.pricingMode,
        components: pkg.components.map((component: any) => ({
          offeringId: component.commercialOfferingId,
          rule: component.quantityRuleType,
          value: component.quantityValue.toString(),
          billing: component.billingMode,
          duties: component.dutyUnitsPerPerson?.toString() ?? null,
          order: component.sortOrder,
        })),
      })),
    })),
  );
}

export async function recordBusinessReview(
  input: {
    offeringId: string;
    status?: BusinessReviewStatus;
    reviewNote?: string;
    requiredChanges?: string;
    field?: BusinessReviewField;
    fieldStatus?: BusinessReviewStatus;
    proposedValue?: string;
    reason: string;
  },
  actorId: string,
  database: any = prisma,
) {
  if (!input.reason.trim())
    throw new BusinessReviewError(
      "REVIEW_INVALID",
      "A review reason is required.",
    );
  return database.$transaction(async (tx: any) => {
    const offering = await tx.commercialOffering.findUnique({
      where: { id: input.offeringId },
    });
    if (!offering)
      throw new BusinessReviewError(
        "REVIEW_INVALID",
        "Offering was not found.",
      );
    const review = await tx.offeringBusinessReview.upsert({
      where: { commercialOfferingId: input.offeringId },
      create: { commercialOfferingId: input.offeringId },
      update: {},
      include: { fields: true },
    });
    if (input.field) {
      if (!input.fieldStatus)
        throw new BusinessReviewError(
          "REVIEW_INVALID",
          "Field status is required.",
        );
      const old = review.fields.find((item: any) => item.field === input.field);
      await tx.offeringBusinessFieldReview.upsert({
        where: {
          businessReviewId_field: {
            businessReviewId: review.id,
            field: input.field,
          },
        },
        create: {
          businessReviewId: review.id,
          field: input.field,
          status: input.fieldStatus,
          proposedValue: input.proposedValue?.trim() || null,
          reason: input.reason,
        },
        update: {
          status: input.fieldStatus,
          proposedValue: input.proposedValue?.trim() || null,
          reason: input.reason,
        },
      });
      await tx.businessReviewAudit.create({
        data: {
          businessReviewId: review.id,
          actorId,
          field: input.field,
          oldStatus: old?.status ?? "UNREVIEWED",
          newStatus: input.fieldStatus,
          oldValue: old?.proposedValue ?? null,
          newValue: input.proposedValue?.trim() || null,
          reason: input.reason,
        },
      });
    }
    if (input.status) {
      const fields = await tx.offeringBusinessFieldReview.findMany({
        where: { businessReviewId: review.id },
      });
      if (
        input.status === "APPROVED" &&
        (fields.length !== BUSINESS_REVIEW_FIELDS.length ||
          fields.some((item: any) => item.status !== "APPROVED"))
      )
        throw new BusinessReviewError(
          "REVIEW_INVALID",
          "Every commercial dimension must be approved before overall approval.",
        );
      if (input.status === "CHANGE_REQUIRED" && !input.requiredChanges?.trim())
        throw new BusinessReviewError(
          "REVIEW_INVALID",
          "CHANGE_REQUIRED needs required changes.",
        );
      await tx.offeringBusinessReview.update({
        where: { id: review.id },
        data: {
          status: input.status,
          reviewNote: input.reviewNote?.trim() || null,
          requiredChanges: input.requiredChanges?.trim() || null,
          reviewedById: actorId,
          reviewedAt: new Date(),
        },
      });
      await tx.businessReviewAudit.create({
        data: {
          businessReviewId: review.id,
          actorId,
          oldStatus: review.status,
          newStatus: input.status,
          oldValue: review.reviewNote,
          newValue: input.reviewNote?.trim() || null,
          reason: input.reason,
        },
      });
    }
    return tx.offeringBusinessReview.findUnique({
      where: { id: review.id },
      include: { fields: true, audits: true },
    });
  });
}

export async function businessReviewExport(database: any = prisma) {
  const fingerprint = await catalogueFingerprint(database);
  const rows = await listBusinessReviewOfferings(database);
  return {
    schemaVersion: "1.0.0",
    catalogueFingerprint: fingerprint,
    rows: rows.map((row: any) => ({
      offeringCode: row.code,
      status: row.reviewStatus,
      reviewNote: row.businessReview?.reviewNote ?? "",
      requiredChanges: row.businessReview?.requiredChanges ?? "",
    })),
  };
}
export async function importBusinessReviews(
  file: {
    catalogueFingerprint: string;
    rows: Array<{
      offeringCode: string;
      status: BusinessReviewStatus;
      reviewNote?: string;
      requiredChanges?: string;
      reason: string;
    }>;
  },
  actorId: string,
  database: any = prisma,
) {
  if (file.catalogueFingerprint !== (await catalogueFingerprint(database)))
    throw new BusinessReviewError(
      "STALE_REVIEW_IMPORT",
      "Review file catalogue fingerprint is stale.",
    );
  const offerings = await database.commercialOffering.findMany({
    where: { code: { in: file.rows.map((row) => row.offeringCode) } },
    select: { id: true, code: true },
  });
  const byCode = new Map<string, string>(
    offerings.map((item: any) => [item.code, item.id]),
  );
  if (byCode.size !== new Set(file.rows.map((row) => row.offeringCode)).size)
    throw new BusinessReviewError(
      "REVIEW_INVALID",
      "Review import contains unknown or duplicate offering codes.",
    );
  for (const row of file.rows)
    await recordBusinessReview(
      {
        offeringId: byCode.get(row.offeringCode)!,
        status: row.status,
        reviewNote: row.reviewNote,
        requiredChanges: row.requiredChanges,
        reason: row.reason,
      },
      actorId,
      database,
    );
  return { imported: file.rows.length };
}

async function releaseState(database: any) {
  const rows = await listBusinessReviewOfferings(database);
  const approved = rows.filter(
    (row: any) =>
      row.reviewStatus === "APPROVED" &&
      row.sourceMappings.some((mapping: any) => mapping.validated),
  );
  const contents = approved
    .map((row: any) => ({
      offeringId: row.id,
      code: row.code,
      name: row.name,
      active: row.active,
      canonical: row.canonicalItem
        ? {
            id: row.canonicalItem.id,
            code: row.canonicalItem.code,
            name: row.canonicalItem.name,
          }
        : null,
      kind: row.kind,
      billingUnit: row.billingUnit,
      quantityBasis: row.quantityBasis,
      pricingFamily: row.pricingFamily,
      durationPolicy: row.durationPolicy
        ? {
            id: row.durationPolicy.id,
            code: row.durationPolicy.code,
            mode: row.durationPolicy.mode,
          }
        : null,
      priceIds: {
        TO_CLIENT: row.readiness.clientRate?.id ?? null,
        TO_VENDOR: row.readiness.vendorRate?.id ?? null,
      },
      packageTemplateIds: row.parentPackageTemplates
        .filter((pkg: any) => pkg.active)
        .map((pkg: any) => ({ id: pkg.id, version: pkg.version })),
      sourceMappingIds: row.sourceMappings
        .filter((mapping: any) => mapping.validated)
        .map((mapping: any) => mapping.id)
        .sort(),
    }))
    .sort((a: any, b: any) => a.code.localeCompare(b.code));
  const counts = rows.reduce(
    (acc: any, row: any) => {
      acc[row.reviewStatus]++;
      if (row.readiness.missingClientRate) acc.missingClientRate++;
      if (row.readiness.missingVendorRate) acc.missingVendorRate++;
      if (row.readiness.semanticQuestion) acc.specializedBlockers++;
      return acc;
    },
    {
      UNREVIEWED: 0,
      APPROVED: 0,
      CHANGE_REQUIRED: 0,
      DEFERRED: 0,
      REJECTED: 0,
      missingClientRate: 0,
      missingVendorRate: 0,
      specializedBlockers: 0,
    },
  );
  const included = approved;
  const blockers = included.filter(
    (row: any) => !row.readiness.clientReady && !row.readiness.vendorReady,
  );
  const distribution = (values: string[]) =>
    values.reduce((result: Record<string, number>, value) => {
      result[value] = (result[value] ?? 0) + 1;
      return result;
    }, {});
  const summary = {
    totalSourceOfferings: rows.length,
    ...counts,
    included: contents.length,
    clientReadyApproved: included.filter(
      (row: any) => row.readiness.clientReady,
    ).length,
    vendorReadyApproved: included.filter(
      (row: any) => row.readiness.vendorReady,
    ).length,
    releaseBlockers: blockers.map((row: any) => ({
      code: row.code,
      state: row.readiness.state,
    })),
    semanticBlockers: rows.filter(
      (row: any) =>
        row.readiness.state === "BLOCKED_SEMANTICS" ||
        row.readiness.state === "BLOCKED_DURATION",
    ).length,
    packageBlockers: rows.filter(
      (row: any) => row.readiness.state === "BLOCKED_PACKAGE",
    ).length,
    active: rows.filter((row: any) => row.active).length,
    inactive: rows.filter((row: any) => !row.active).length,
    pricingFamilyDistribution: distribution(
      rows.map((row: any) =>
        row.kind === "PACKAGE"
          ? "PACKAGE"
          : (row.pricingFamily ?? "UNASSIGNED"),
      ),
    ),
    durationPolicyDistribution: distribution(
      rows.map((row: any) => row.durationPolicy?.code ?? "UNASSIGNED"),
    ),
  };
  const reviews = included.map((row: any) => ({
    code: row.code,
    status: row.reviewStatus,
    fields: row.fieldReviews
      .map((field: any) => ({
        field: field.field,
        status: field.status,
        proposedValue: field.proposedValue,
      }))
      .sort((a: any, b: any) => a.field.localeCompare(b.field)),
  }));
  return {
    contents,
    summary,
    fingerprint: deterministicHash(contents),
    decisionSetHash: deterministicHash(reviews),
    catalogueFingerprint: await catalogueFingerprint(database),
  };
}

export async function createCatalogueRelease(
  input: { code: string; notes?: string },
  actorId: string,
  database: any = prisma,
) {
  const state = await releaseState(database);
  const latestImport = await database.importBatch.findFirst({
    orderBy: { createdAt: "desc" },
  });
  const technicalApplies = await database.catalogueSemanticApply.findMany({
    select: { decisionSetHash: true },
    orderBy: { decisionSetHash: "asc" },
  });
  return database.catalogueRelease.create({
    data: {
      code: input.code,
      createdById: actorId,
      catalogueFingerprint: state.catalogueFingerprint,
      releaseFingerprint: state.fingerprint,
      decisionSetHash: state.decisionSetHash,
      sourceWorkbookHash: latestImport?.fileHash ?? null,
      technicalDecisionHashes: technicalApplies.map(
        (item: any) => item.decisionSetHash,
      ),
      contents: state.contents,
      summary: state.summary,
      notes: input.notes?.trim() || null,
    },
  });
}
export async function transitionCatalogueRelease(
  id: string,
  status: "READY_FOR_APPROVAL" | "APPROVED" | "SUPERSEDED",
  actorId: string,
  reason: string,
  database: any = prisma,
) {
  if (!reason.trim())
    throw new BusinessReviewError(
      "REVIEW_INVALID",
      "A transition reason is required.",
    );
  return database.$transaction(async (tx: any) => {
    const release = await tx.catalogueRelease.findUnique({ where: { id } });
    if (!release)
      throw new BusinessReviewError("REVIEW_INVALID", "Release was not found.");
    if (release.status === "APPROVED")
      throw new BusinessReviewError(
        "RELEASE_IMMUTABLE",
        "Approved releases are immutable.",
      );
    const allowed =
      (release.status === "DRAFT" && status === "READY_FOR_APPROVAL") ||
      (release.status === "READY_FOR_APPROVAL" && status === "APPROVED") ||
      (release.status === "READY_FOR_APPROVAL" && status === "SUPERSEDED");
    if (!allowed)
      throw new BusinessReviewError(
        "REVIEW_INVALID",
        `Invalid release transition ${release.status} → ${status}.`,
      );
    const summary = release.summary as any;
    if (
      (status === "READY_FOR_APPROVAL" || status === "APPROVED") &&
      (summary.included < 1 || summary.releaseBlockers.length)
    )
      throw new BusinessReviewError(
        "RELEASE_BLOCKED",
        "Release must contain at least one approved, client-or-vendor-ready offering and no included blockers.",
        summary.releaseBlockers,
      );
    const updated = await tx.catalogueRelease.update({
      where: { id },
      data: {
        status,
        ...(status === "APPROVED"
          ? { approvedById: actorId, approvedAt: new Date() }
          : {}),
      },
    });
    await tx.catalogueReleaseAudit.create({
      data: {
        releaseId: id,
        actorId,
        oldStatus: release.status,
        newStatus: status,
        reason,
      },
    });
    return updated;
  });
}
