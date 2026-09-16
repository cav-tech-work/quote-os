import type { PrismaClient } from "@prisma/client";
import { RESET_TABLES } from "../lib/catalogue-reset";

/**
 * Test-only helpers for disposable PostgreSQL databases.
 *
 * `CatalogueRelease` is protected by the immutability trigger, so removing
 * APPROVED fixtures requires temporarily disabling that trigger. This never
 * touches repository schema; it is scoped to the disposable test database and
 * always re-enables the trigger.
 */

const DISABLE_TRIGGER = 'ALTER TABLE "CatalogueRelease" DISABLE TRIGGER "CatalogueRelease_approved_immutable"';
const ENABLE_TRIGGER = 'ALTER TABLE "CatalogueRelease" ENABLE TRIGGER "CatalogueRelease_approved_immutable"';

export async function withReleaseTriggerDisabled<T>(db: PrismaClient, run: () => Promise<T>): Promise<T> {
  await db.$executeRawUnsafe(DISABLE_TRIGGER);
  try {
    return await run();
  } finally {
    await db.$executeRawUnsafe(ENABLE_TRIGGER);
  }
}

export async function deleteAllReleases(db: PrismaClient) {
  await withReleaseTriggerDisabled(db, async () => {
    await db.catalogueReleaseAudit.deleteMany();
    await db.catalogueRelease.deleteMany();
  });
}

/** Empties every table these tests touch, in FK-safe order. */
export async function wipeDatabase(db: PrismaClient) {
  const client = db as unknown as Record<string, { deleteMany: () => Promise<unknown> }>;
  await deleteAllReleases(db);
  for (const table of RESET_TABLES) await client[table].deleteMany();
  await client.generatedDocument.deleteMany();
  await client.quotePackageComponentSnapshot.deleteMany();
  await client.quoteLine.deleteMany();
  await client.quoteRevision.deleteMany();
  await client.quoteEvent.deleteMany();
  await client.quote.deleteMany();
  await client.quoteNumberCounter.deleteMany();
  await client.durationPolicyPoint.deleteMany();
  await client.durationPolicy.deleteMany();
  await client.rateMarket.deleteMany();
  await client.user.deleteMany();
}
