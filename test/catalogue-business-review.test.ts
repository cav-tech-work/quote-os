import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { hasCatalogueAdminAuthority } from "../lib/access-policy";
import {
  BUSINESS_REVIEW_FIELDS,
  BusinessReviewError,
  businessReviewExport,
  catalogueFingerprint,
  createCatalogueRelease,
  deriveOfferingReadiness,
  deterministicHash,
  importBusinessReviews,
  listBusinessReviewOfferings,
  recordBusinessReview,
  transitionCatalogueRelease,
} from "../lib/catalogue-business-review";

test("catalogue approval remains ADMIN-only", () => {
  assert.equal(
    hasCatalogueAdminAuthority({ active: true, role: "ADMIN" }),
    true,
  );
  assert.equal(
    hasCatalogueAdminAuthority({ active: true, role: "QUOTE_USER" }),
    false,
  );
  assert.equal(
    hasCatalogueAdminAuthority({ active: false, role: "ADMIN" }),
    false,
  );
});
test("release hashing is deterministic and commercial changes alter it", () => {
  const one = {
    offerings: [
      { code: "A", rate: 100 },
      { code: "B", rate: 200 },
    ],
  };
  assert.equal(
    deterministicHash(one),
    deterministicHash({
      offerings: [
        { rate: 100, code: "A" },
        { rate: 200, code: "B" },
      ],
    }),
  );
  assert.notEqual(
    deterministicHash(one),
    deterministicHash({
      offerings: [
        { code: "A", rate: 101 },
        { code: "B", rate: 200 },
      ],
    }),
  );
});
test("readiness distinguishes explicit zero, missing side, and semantics", () => {
  const ready = deriveOfferingReadiness({
    active: true,
    kind: "ITEM",
    quantityBasis: "COUNT",
    pricingFamily: "ORDINARY",
    billingUnit: "NOS",
    durationPolicy: {
      active: true,
      authority: "INTERNAL_APPROVED",
      mode: "ONE_OFF",
    },
    prices: [
      {
        id: "zero",
        side: "TO_CLIENT",
        active: true,
        scopeType: "GLOBAL",
        marketId: null,
        amountPaise: 0,
      },
    ],
    parentPackageTemplates: [],
  });
  assert.equal(ready.state, "READY_CLIENT_ONLY");
  assert.equal(ready.clientRate.amountPaise, 0);
  assert.equal(ready.missingVendorRate, true);
});

const databaseUrl = process.env.PHASE11_TEST_DATABASE_URL;
test(
  "business decisions, audit, partial release, stale import and immutable approval",
  { skip: !databaseUrl },
  async () => {
  const db = new PrismaClient({ datasourceUrl: databaseUrl! });
  try {
    await db.$executeRawUnsafe('TRUNCATE TABLE "CatalogueRelease", "OfferingBusinessReview", "CommercialOffering", "DurationPolicy", "CanonicalItem", "User" RESTART IDENTITY CASCADE');
      const admin = await db.user.create({
        data: { email: "phase11-admin@clockwork-av.com", role: "ADMIN" },
      });
      const policy = await db.durationPolicy.create({
        data: {
          code: "P11_ONE_OFF",
          name: "One-off",
          mode: "ONE_OFF",
          authority: "INTERNAL_APPROVED",
          chargeMultiplierNumerator: 1,
          chargeMultiplierDenominator: 1,
          minimumChargeNumerator: 1,
          minimumChargeDenominator: 1,
          roundingMode: "NONE",
        },
      });
      const canonical = await db.canonicalItem.create({
        data: {
          code: "P11_ITEM",
          name: "Approved candidate",
          domain: "VC",
          entityType: "EQUIPMENT",
        },
      });
      const approved = await db.commercialOffering.create({
        data: {
          code: "P11_APPROVED",
          name: "Approved candidate",
          canonicalItemId: canonical.id,
          kind: "ITEM",
          billingUnit: "NOS",
          quantityBasis: "COUNT",
          pricingFamily: "ORDINARY",
          durationBasis: "ONE_OFF",
          durationPolicyId: policy.id,
          sourceMappings: {
            create: {
              sourceSystem: "PHASE11_TEST",
              sourceCode: "P11_APPROVED",
              sourceDescription: "Controlled business source",
              validated: true,
            },
          },
          prices: {
            create: [
              { side: "TO_CLIENT", scopeType: "GLOBAL", amountPaise: 10000 },
              { side: "TO_VENDOR", scopeType: "GLOBAL", amountPaise: 8000 },
            ],
          },
        },
      });
      const deferred = await db.commercialOffering.create({
        data: {
          code: "P11_DEFERRED",
          name: "Deferred evidence",
          kind: "SERVICE",
          billingUnit: "DUTY",
          quantityBasis: "HEADCOUNT_DUTY",
          durationBasis: "DUTY",
          sourceMappings: {
            create: {
              sourceSystem: "PHASE11_TEST",
              sourceCode: "P11_DEFERRED",
              sourceDescription: "Unresolved source",
              validated: true,
            },
          },
        },
      });
      const fixture = await db.commercialOffering.create({
        data: {
          code: "TEST_FIXTURE",
          name: "Development fixture",
          kind: "ITEM",
          billingUnit: "NOS",
          quantityBasis: "COUNT",
          pricingFamily: "ORDINARY",
          durationBasis: "ONE_OFF",
          durationPolicyId: policy.id,
          prices: {
            create: { side: "TO_CLIENT", scopeType: "GLOBAL", amountPaise: 1 },
          },
        },
      });
      for (const field of BUSINESS_REVIEW_FIELDS)
        await recordBusinessReview(
          {
            offeringId: approved.id,
            field,
            fieldStatus: "APPROVED",
            reason: `Approved ${field}`,
          },
          admin.id,
          db,
        );
      await recordBusinessReview(
        {
          offeringId: approved.id,
          status: "APPROVED",
          reviewNote: "Controlled approval",
          reason: "All dimensions reviewed",
        },
        admin.id,
        db,
      );
      await recordBusinessReview(
        {
          offeringId: deferred.id,
          status: "DEFERRED",
          reviewNote: "Needs contract",
          reason: "Commercial semantics unresolved",
        },
        admin.id,
        db,
      );
      await recordBusinessReview(
        {
          offeringId: fixture.id,
          status: "DEFERRED",
          reason: "Development fixture",
        },
        admin.id,
        db,
      );
      const rows = await listBusinessReviewOfferings(db);
      assert.equal(
        rows.find((row: any) => row.code === "P11_APPROVED").sourceEvidence[0]
          .sourceDescription,
        "Controlled business source",
      );
      assert.equal(
        await db.businessReviewAudit.count({
          where: { businessReview: { commercialOfferingId: approved.id } },
        }),
        BUSINESS_REVIEW_FIELDS.length + 1,
      );
      const exported = await businessReviewExport(db);
      await assert.rejects(
        () =>
          importBusinessReviews(
            { ...exported, catalogueFingerprint: "stale", rows: [] },
            admin.id,
            db,
          ),
        (error: unknown) =>
          error instanceof BusinessReviewError &&
          error.code === "STALE_REVIEW_IMPORT",
      );
      const release = await createCatalogueRelease(
        { code: "CAV-CATALOGUE-P11-01", notes: "Controlled release candidate" },
        admin.id,
        db,
      );
      const contents = release.contents as any[];
      const summary = release.summary as any;
      assert.deepEqual(
        contents.map((item) => item.code),
        ["P11_APPROVED"],
      );
      assert.equal(summary.APPROVED, 1);
      assert.equal(summary.DEFERRED, 2);
      assert.equal(summary.included, 1);
      assert.equal(summary.clientReadyApproved, 1);
      assert.equal(summary.vendorReadyApproved, 1);
      assert.equal(
        release.catalogueFingerprint,
        await catalogueFingerprint(db),
      );
      const same = await createCatalogueRelease(
        { code: "CAV-CATALOGUE-P11-02" },
        admin.id,
        db,
      );
      assert.equal(release.decisionSetHash, same.decisionSetHash);
      assert.equal(release.catalogueFingerprint, same.catalogueFingerprint);
      assert.equal(release.releaseFingerprint, same.releaseFingerprint);
      assert.equal((release.contents as any[]).length, 1);
      await db.price.updateMany({
        where: { commercialOfferingId: approved.id, side: "TO_CLIENT" },
        data: { active: false },
      });
      await db.price.create({
        data: {
          commercialOfferingId: approved.id,
          side: "TO_CLIENT",
          scopeType: "GLOBAL",
          amountPaise: 11000,
        },
      });
      const changed = await createCatalogueRelease(
        { code: "CAV-CATALOGUE-P11-03" },
        admin.id,
        db,
      );
      assert.notEqual(
        release.catalogueFingerprint,
        changed.catalogueFingerprint,
      );
      assert.notEqual(release.releaseFingerprint, changed.releaseFingerprint);
      assert.notEqual(
        release.catalogueFingerprint,
        await catalogueFingerprint(db),
      );
      await transitionCatalogueRelease(
        release.id,
        "READY_FOR_APPROVAL",
        admin.id,
        "Ready",
        db,
      );
      const final = await transitionCatalogueRelease(
        release.id,
        "APPROVED",
        admin.id,
        "Business approved controlled sample",
        db,
      );
      assert.equal(final.status, "APPROVED");
      await assert.rejects(
        () =>
          transitionCatalogueRelease(
            release.id,
            "SUPERSEDED",
            admin.id,
            "Later",
            db,
          ),
        (error: unknown) =>
          error instanceof BusinessReviewError &&
          error.code === "RELEASE_IMMUTABLE",
      );
      await assert.rejects(
        () =>
          db.catalogueRelease.update({
            where: { id: release.id },
            data: { notes: "rewrite" },
          }),
        /immutable/i,
      );
    } finally {
      await db.$disconnect();
    }
  },
);
