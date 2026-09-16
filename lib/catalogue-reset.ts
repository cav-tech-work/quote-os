import type { CatalogueReleaseStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Guarded one-time catalogue reset.
 *
 * Scope is catalogue/master data only. Historical quotes are preserved: every
 * QuoteLine -> catalogue relation is `onDelete: SetNull`, and all commercial
 * values live in immutable `*Snapshot` columns. Deleting catalogue rows
 * therefore nulls those convenience foreign keys without touching quote,
 * revision, line, document, or user records.
 *
 * Non-approved release workflow rows are removed. APPROVED and SUPERSEDED
 * releases (and their audit/provenance) are retained as historical commercial
 * evidence. DurationPolicy/DurationPolicyPoint and RateMarket are retained as
 * engine configuration: they are not catalogue master data, and the migration
 * bootstraps the duration policies the empty catalogue still needs.
 */

export const RESET_CONFIRMATION_TOKEN = "RESET_CATALOGUE";
export const RESET_TARGET = "production";

export class ResetInputError extends Error {
  constructor(message: string) { super(message); this.name = "ResetInputError"; }
}

export type ResetClassification = "REMOVED" | "RETAINED_ENGINE_CONFIG" | "RETAINED_HISTORICAL" | "PRESERVED_APPLICATION_DATA";

/** FK-safe deletion order: children before the rows they restrict. */
export const RESET_TABLES = [
  "businessReviewAudit",
  "offeringBusinessFieldReview",
  "offeringBusinessReview",
  "packageComponent",
  "packageTemplate",
  "priceAuditEvent",
  "price",
  "durationPolicyAssignmentAudit",
  "catalogueSemanticAudit",
  "catalogueSemanticApply",
  "alias",
  "sourceMapping",
  "rateObservation",
  "importRow",
  "importBatch",
  "commercialOffering",
  "canonicalItem",
  "catalogueItem",
  "catalogueCategory",
] as const;

export type ResetTable = (typeof RESET_TABLES)[number];

/** Release workflow states the reset removes. Everything else is historical. */
export const REMOVABLE_RELEASE_STATUSES: CatalogueReleaseStatus[] = ["DRAFT", "READY_FOR_APPROVAL"];
/** Release states retained as historical commercial evidence. */
export const RETAINED_RELEASE_STATUSES: CatalogueReleaseStatus[] = ["APPROVED", "SUPERSEDED"];

/** Engine/application configuration that is not catalogue master data. */
export const RETAINED_ENGINE_TABLES = ["durationPolicy", "durationPolicyPoint", "rateMarket"] as const;

/** Retained historical records (release evidence). */
export const RETAINED_HISTORICAL_TABLES = ["catalogueRelease", "catalogueReleaseAudit"] as const;

/** Application data and immutable quote/document history: never touched. */
export const PRESERVED_TABLES = [
  "user",
  "account",
  "session",
  "verificationToken",
  "quote",
  "quoteNumberCounter",
  "quoteRevision",
  "quoteLine",
  "quotePackageComponentSnapshot",
  "quoteEvent",
  "generatedDocument",
] as const;

/**
 * The operational catalogue tables that must be empty after an applied reset.
 * Explicit so the empty-catalogue invariant is asserted by name.
 */
export const OPERATIONAL_CATALOGUE_TABLES = ["canonicalItem", "commercialOffering", "price", "packageTemplate", "packageComponent", "catalogueItem", "catalogueCategory"] as const;

/** Full reset scope audit, classifying every catalogue-related model. */
export const RESET_SCOPE: ReadonlyArray<{ table: string; classification: ResetClassification }> = [
  ...RESET_TABLES.map((table) => ({ table, classification: "REMOVED" as const })),
  { table: "catalogueRelease", classification: "RETAINED_HISTORICAL" },
  { table: "catalogueReleaseAudit", classification: "RETAINED_HISTORICAL" },
  ...RETAINED_ENGINE_TABLES.map((table) => ({ table, classification: "RETAINED_ENGINE_CONFIG" as const })),
  ...PRESERVED_TABLES.map((table) => ({ table, classification: "PRESERVED_APPLICATION_DATA" as const })),
];

export const RESET_TABLE_LABELS: Record<ResetTable, string> = {
  businessReviewAudit: "Business review audit",
  offeringBusinessFieldReview: "Business review field state",
  offeringBusinessReview: "Business review records",
  packageComponent: "Package components",
  packageTemplate: "Package templates",
  priceAuditEvent: "Price audit history",
  price: "Current and historical prices",
  durationPolicyAssignmentAudit: "Duration policy assignment audit",
  catalogueSemanticAudit: "Catalogue semantic audit",
  catalogueSemanticApply: "Semantic apply markers",
  alias: "Catalogue aliases",
  sourceMapping: "Source mappings",
  rateObservation: "Historical rate observations",
  importRow: "Import rows",
  importBatch: "Import batches",
  commercialOffering: "Commercial offerings (elements)",
  canonicalItem: "Canonical items (parents)",
  catalogueItem: "Legacy catalogue items",
  catalogueCategory: "Legacy catalogue categories",
};

export const RETAINED_ENGINE_LABELS: Record<(typeof RETAINED_ENGINE_TABLES)[number], string> = {
  durationPolicy: "Duration policies",
  durationPolicyPoint: "Duration policy curve points",
  rateMarket: "Rate markets",
};

export const RETAINED_HISTORICAL_LABELS: Record<(typeof RETAINED_HISTORICAL_TABLES)[number], string> = {
  catalogueRelease: "Catalogue releases (APPROVED/SUPERSEDED)",
  catalogueReleaseAudit: "Catalogue release audit (APPROVED/SUPERSEDED)",
};

export const PRESERVED_LABELS: Record<(typeof PRESERVED_TABLES)[number], string> = {
  user: "Users and auth identities",
  account: "OAuth accounts",
  session: "Sessions",
  verificationToken: "Verification tokens",
  quote: "Quotes",
  quoteNumberCounter: "Quote number counters",
  quoteRevision: "Quote revisions",
  quoteLine: "Quote lines (with commercial snapshots)",
  quotePackageComponentSnapshot: "Quote package component snapshots",
  quoteEvent: "Quote audit events",
  generatedDocument: "Retained issued documents",
};

type Database = typeof prisma;

export function databaseIdentity(databaseUrl = process.env.DATABASE_URL ?? "") {
  try {
    const parsed = new URL(databaseUrl);
    return { host: parsed.host || "(unknown)", database: parsed.pathname.replace(/^\//, "") || "(unknown)", user: parsed.username || "(unknown)" };
  } catch {
    return { host: "(unparseable DATABASE_URL)", database: "(unparseable DATABASE_URL)", user: "(unknown)" };
  }
}

export function validateResetRequest(options: { target: string | null; confirm: string | null; execute: boolean }) {
  if (options.target !== RESET_TARGET) {
    throw new ResetInputError(`Refusing to run: --target must be exactly "${RESET_TARGET}". Received ${options.target === null ? "no target" : `"${options.target}"`}.`);
  }
  if (options.execute && options.confirm !== RESET_CONFIRMATION_TOKEN) {
    throw new ResetInputError(`Refusing to run: --apply requires --confirm ${RESET_CONFIRMATION_TOKEN}. Received ${options.confirm === null ? "no confirmation" : `"${options.confirm}"`}.`);
  }
}

export type ResetCounts = Record<string, number>;

async function countsOf(database: Database, tables: readonly string[]): Promise<ResetCounts> {
  const client = database as unknown as Record<string, { count: () => Promise<number> }>;
  const entries = await Promise.all(tables.map(async (table) => [table, await client[table].count()] as const));
  return Object.fromEntries(entries);
}

export function catalogueCounts(database: Database = prisma): Promise<ResetCounts> {
  return countsOf(database, RESET_TABLES);
}

export function engineConfigCounts(database: Database = prisma): Promise<ResetCounts> {
  return countsOf(database, RETAINED_ENGINE_TABLES);
}

export function preservedCounts(database: Database = prisma): Promise<ResetCounts> {
  return countsOf(database, PRESERVED_TABLES);
}

export type RetainedReleases = { removable: number; removableAudit: number; retained: number; retainedReleases: Array<{ code: string; status: CatalogueReleaseStatus }> };

export async function releaseSummary(database: Database = prisma): Promise<RetainedReleases> {
  const [removable, removableAudit, retained] = await Promise.all([
    database.catalogueRelease.count({ where: { status: { in: REMOVABLE_RELEASE_STATUSES } } }),
    database.catalogueReleaseAudit.count({ where: { release: { status: { in: REMOVABLE_RELEASE_STATUSES } } } }),
    database.catalogueRelease.findMany({ where: { status: { in: RETAINED_RELEASE_STATUSES } }, select: { code: true, status: true }, orderBy: [{ code: "asc" }] }),
  ]);
  return { removable, removableAudit, retained: retained.length, retainedReleases: retained };
}

/** Retained historical counts = the release rows that survive a reset plus their audit rows. */
export async function historicalCounts(database: Database = prisma): Promise<ResetCounts> {
  const retained = await database.catalogueRelease.findMany({ where: { status: { in: RETAINED_RELEASE_STATUSES } }, select: { id: true } });
  const ids = retained.map((release) => release.id);
  const retainedAudit = ids.length ? await database.catalogueReleaseAudit.count({ where: { releaseId: { in: ids } } }) : 0;
  return { catalogueRelease: ids.length, catalogueReleaseAudit: retainedAudit };
}

export type ResetOptions = { target: string | null; confirm: string | null; execute: boolean; databaseUrl?: string };

export type ResetResult = {
  executed: boolean;
  target: string;
  databaseIdentity: { host: string; database: string; user: string };
  before: ResetCounts;
  after: ResetCounts;
  removed: ResetCounts;
  engine: ResetCounts;
  historical: ResetCounts;
  preserved: ResetCounts;
  releases: RetainedReleases;
};

export function totalCounts(counts: ResetCounts) {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

export async function resetCatalogue(options: ResetOptions, database: Database = prisma): Promise<ResetResult> {
  validateResetRequest(options);
  const identity = databaseIdentity(options.databaseUrl);
  const before = await catalogueCounts(database);
  const engine = await engineConfigCounts(database);
  const preserved = await preservedCounts(database);
  const releases = await releaseSummary(database);

  if (!options.execute) {
    return {
      executed: false,
      target: options.target as string,
      databaseIdentity: identity,
      before,
      after: before,
      removed: Object.fromEntries(RESET_TABLES.map((table) => [table, 0])),
      engine,
      historical: await historicalCounts(database),
      preserved,
      releases,
    };
  }

  await database.$transaction(async (tx) => {
    // Release workflow state first: CatalogueReleaseAudit -> CatalogueRelease is RESTRICT.
    await tx.catalogueReleaseAudit.deleteMany({ where: { release: { status: { in: REMOVABLE_RELEASE_STATUSES } } } });
    await tx.catalogueRelease.deleteMany({ where: { status: { in: REMOVABLE_RELEASE_STATUSES } } });
    const client = tx as unknown as Record<string, { deleteMany: () => Promise<unknown>; count: () => Promise<number> }>;
    for (const table of RESET_TABLES) await client[table].deleteMany();
    // Fail closed: a database constraint or trigger could silently skip a delete,
    // so verify inside the transaction and roll everything back if anything remains.
    const residual = await Promise.all(RESET_TABLES.map(async (table) => [table, await client[table].count()] as const));
    const blocked: Array<readonly [string, number]> = residual.filter(([, value]) => value > 0);
    const removableReleases = await tx.catalogueRelease.count({ where: { status: { in: REMOVABLE_RELEASE_STATUSES } } });
    if (removableReleases > 0) blocked.push(["catalogueRelease (non-approved)", removableReleases]);
    if (blocked.length) {
      throw new ResetInputError(`Refusing to report success: ${blocked.map(([table, value]) => `${table} (${value} row(s) retained)`).join(", ")}. Deletion was blocked by a database constraint or trigger; the transaction was rolled back and nothing was removed.`);
    }
  }, { timeout: 120_000, isolationLevel: "Serializable" });

  const after = await catalogueCounts(database);
  const removed = Object.fromEntries(RESET_TABLES.map((table) => [table, (before[table] ?? 0) - (after[table] ?? 0)]));
  return {
    executed: true,
    target: options.target as string,
    databaseIdentity: identity,
    before,
    after,
    removed,
    engine,
    historical: await historicalCounts(database),
    preserved,
    releases,
  };
}

function pad(label: string, value: number) {
  return `  ${label}`.padEnd(52) + `${value}`;
}

export function formatResetReport(result: ResetResult) {
  const lines: string[] = [];
  const verb = result.executed ? "Removed" : "Would remove";
  const retainVerb = result.executed ? "Retained" : "Would retain";

  lines.push(result.executed ? "CATALOGUE RESET — EXECUTED" : "CATALOGUE RESET — DRY RUN (no changes made)");
  lines.push(`Target:   ${result.target}`);
  lines.push(`Database: ${result.databaseIdentity.host} / ${result.databaseIdentity.database} (user ${result.databaseIdentity.user})`);
  lines.push("");
  lines.push(`${verb.toUpperCase()} — operational catalogue`);
  for (const table of RESET_TABLES) {
    const value = result.executed ? (result.removed[table] ?? 0) : (result.before[table] ?? 0);
    if (value === 0 && result.executed) continue;
    lines.push(pad(RESET_TABLE_LABELS[table] ?? table, value));
  }
  lines.push(pad("Catalogue releases (DRAFT, READY_FOR_APPROVAL)", result.releases.removable));
  lines.push(pad("Catalogue release audit (non-approved)", result.releases.removableAudit));
  lines.push("");
  lines.push(`${retainVerb.toUpperCase()} — ENGINE CONFIGURATION`);
  for (const table of RETAINED_ENGINE_TABLES) lines.push(pad(RETAINED_ENGINE_LABELS[table], result.engine[table] ?? 0));
  lines.push("");
  lines.push(`${retainVerb.toUpperCase()} — HISTORICAL RECORDS`);
  lines.push(pad(RETAINED_HISTORICAL_LABELS.catalogueRelease, result.historical.catalogueRelease ?? 0));
  lines.push(pad(RETAINED_HISTORICAL_LABELS.catalogueReleaseAudit, result.historical.catalogueReleaseAudit ?? 0));
  if (result.releases.retainedReleases.length) {
    lines.push(`  Retained release codes/status:`);
    for (const release of result.releases.retainedReleases) lines.push(`    ${release.code} — ${release.status}`);
  }
  lines.push("");
  lines.push(`${result.executed ? "PRESERVED" : "WOULD PRESERVE"} — APPLICATION AND HISTORY DATA`);
  for (const table of PRESERVED_TABLES) lines.push(pad(PRESERVED_LABELS[table], result.preserved[table] ?? 0));
  lines.push("");
  lines.push(`Operational catalogue rows ${result.executed ? "before/after" : "before"}: ${totalCounts(result.before)}${result.executed ? ` / ${totalCounts(result.after)}` : ""}`);
  if (result.executed) lines.push(totalCounts(result.after) === 0 ? "Operational catalogue is now empty." : "WARNING: operational catalogue is not empty.");
  else lines.push(`Re-run with --apply --confirm ${RESET_CONFIRMATION_TOKEN} to execute.`);
  return lines.join("\n");
}
