import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { createCatalogueElement } from "../lib/element-admin";
import { assignDurationPolicy } from "../lib/duration-policies";
import { RESET_TABLES } from "../lib/catalogue-reset";
import { createPackageVersion, PackageDefinitionError, previewPackageDefinition } from "../lib/package-admin";

function fixtureOffering(input: { id: string; code: string; name: string; quantityBasis?: string | null; pricingFamily?: string | null }) {
  return {
    id: input.id, code: input.code, name: input.name, active: true, kind: "ITEM",
    billingUnit: "NOS", pricingFamily: input.pricingFamily ?? null, quantityBasis: input.quantityBasis ?? "COUNT",
    canonicalItem: { code: `${input.code}_PARENT`, name: `${input.name} parent` }, durationPolicy: null,
  };
}

test("a rate-missing element can be added to a draft package and preview reports the missing rate", async () => {
  const offering = fixtureOffering({ id: "cmrate0000000000000000001", code: "NEW_ELEMENT", name: "New element" });
  let created: any = null;
  const db = {
    commercialOffering: { findMany: async () => [offering] },
    packageTemplate: { findUnique: async () => null, create: async ({ data }: any) => { created = data; return { id: "pkg", ...data }; } },
    price: { findMany: async () => [] },
  };

  const preview = await previewPackageDefinition({
    code: "DRAFT_PACKAGE", name: "Draft package", version: 1, pricingMode: "COMPONENT_SUM",
    components: [{ commercialOfferingId: offering.id, quantityRuleType: "FIXED_PER_PACKAGE", quantityValue: "2", billingMode: "BILLABLE", sortOrder: 1 }],
  }, db);
  assert.equal(preview.rows[0].sides.TO_CLIENT.state, "RATE_MISSING");
  assert.equal(preview.rows[0].sides.TO_VENDOR.state, "RATE_MISSING");
  assert.equal(preview.rows[0].quantity, "2");

  // A rate-missing component never blocks saving an inactive draft.
  const saved = await createPackageVersion({
    code: "DRAFT_PACKAGE", name: "Draft package", version: 1, pricingMode: "COMPONENT_SUM", active: false,
    components: [{ commercialOfferingId: offering.id, quantityRuleType: "FIXED_PER_PACKAGE", quantityValue: "2", billingMode: "BILLABLE", sortOrder: 1 }],
  }, db);
  assert.equal(saved.id, "pkg");
  assert.equal(created.active, false);
  assert.equal(created.components.create.length, 1);
  assert.equal(created.components.create[0].quantityValue.toString(), "2");
  assert.equal(created.components.create[0].billingMode, "BILLABLE");
  assert.equal(created.components.create[0].quantityRuleType, "FIXED_PER_PACKAGE");
});

test("component ordering, per-package quantities, roles and removal round-trip into the saved recipe", async () => {
  const first = fixtureOffering({ id: "cmord0000000000000000001", code: "EL_FIRST", name: "First" });
  const second = fixtureOffering({ id: "cmord0000000000000000002", code: "EL_SECOND", name: "Second" });
  const third = fixtureOffering({ id: "cmord0000000000000000003", code: "EL_THIRD", name: "Third" });
  let created: any = null;
  const db = {
    commercialOffering: { findMany: async ({ where }: any = {}) => [first, second, third].filter((row) => (where?.id?.in ?? []).includes(row.id)) },
    packageTemplate: { findUnique: async () => null, create: async ({ data }: any) => { created = data; return { id: "pkg", ...data }; } },
    price: { findMany: async () => [] },
  };

  // Re-ordered (Second, Third, First) with an INCLUDED role and a removal already applied.
  await createPackageVersion({
    code: "ORDERED_PACKAGE", name: "Ordered package", version: 1, pricingMode: "COMPONENT_SUM", active: false,
    components: [
      { commercialOfferingId: second.id, quantityRuleType: "FIXED_PER_PACKAGE", quantityValue: "2", billingMode: "BILLABLE", sortOrder: 1 },
      { commercialOfferingId: third.id, quantityRuleType: "FIXED_PER_PACKAGE", quantityValue: "1", billingMode: "INCLUDED", sortOrder: 2 },
    ],
  }, db);

  assert.deepEqual(created.components.create.map((component: any) => component.commercialOfferingId), [second.id, third.id]);
  assert.deepEqual(created.components.create.map((component: any) => component.sortOrder), [1, 2]);
  assert.equal(created.components.create[0].quantityValue.toString(), "2");
  assert.equal(created.components.create[0].billingMode, "BILLABLE");
  assert.equal(created.components.create[1].billingMode, "INCLUDED");
  // Removed component is absent.
  assert.equal(created.components.create.some((component: any) => component.commercialOfferingId === first.id), false);
});

test("draft package definitions reject empty, unordered and double-charging recipes", async () => {
  const only = fixtureOffering({ id: "cmrej0000000000000000001", code: "EL_ONLY", name: "Only" });
  const parent = { ...fixtureOffering({ id: "cmrej0000000000000000002", code: "PKG_PARENT", name: "Parent" }), kind: "PACKAGE" };
  const db = {
    commercialOffering: { findMany: async ({ where }: any = {}) => [only, parent].filter((row) => (where?.id?.in ?? []).includes(row.id)) },
    packageTemplate: { findUnique: async () => null, create: async ({ data }: any) => ({ id: "pkg", ...data }) },
    price: { findMany: async () => [] },
  };
  const component = (overrides: Record<string, unknown> = {}) => ({ commercialOfferingId: only.id, quantityRuleType: "FIXED_PER_PACKAGE" as const, quantityValue: "1", billingMode: "BILLABLE" as const, sortOrder: 1, ...overrides });

  await assert.rejects(createPackageVersion({ code: "EMPTY", name: "Empty", version: 1, pricingMode: "COMPONENT_SUM", components: [] }, db), PackageDefinitionError);
  await assert.rejects(createPackageVersion({ code: "ZERO", name: "Zero", version: 1, pricingMode: "COMPONENT_SUM", components: [component({ quantityValue: "0" })] }, db), PackageDefinitionError);
  await assert.rejects(
    createPackageVersion({ code: "DUPE_ORDER", name: "Dupe", version: 1, pricingMode: "COMPONENT_SUM", components: [component(), component({ commercialOfferingId: parent.id, sortOrder: 1 })] }, db),
    PackageDefinitionError,
  );
  // FIXED_PACKAGE must keep components INCLUDED so nothing is charged twice.
  await assert.rejects(
    createPackageVersion({ code: "FIXED_DOUBLE", name: "Fixed", version: 1, pricingMode: "FIXED_PACKAGE", parentCommercialOfferingId: parent.id, components: [component({ billingMode: "BILLABLE" })] }, db),
    PackageDefinitionError,
  );
});

const databaseUrl = process.env.PACKAGE_BUILDER_TEST_DATABASE_URL;

test("package builder works end to end from manually created catalogue elements", { skip: !databaseUrl }, async () => {
  const db = new PrismaClient({ datasourceUrl: databaseUrl! });
  const suffix = Date.now().toString(36).toUpperCase().slice(-6);
  const client = db as unknown as Record<string, { deleteMany: () => Promise<unknown> }>;
  const wipeCatalogue = async () => { for (const table of RESET_TABLES) await client[table].deleteMany(); };
  let actorId = "";

  try {
    await wipeCatalogue();
    const actor = await db.user.create({ data: { email: `builder-${suffix.toLowerCase()}@quoteos.test`, role: "ADMIN" } });
    actorId = actor.id;

    const priceMissing = await createCatalogueElement({ actorId, name: `Rate missing ${suffix}`, code: `MB_MISSING_${suffix}`, parentCode: `MB_GROUP_${suffix}`, parentName: "Builder parent", parentCategory: "OTHER", billingUnit: "NOS", measurement: "COUNT", toClientRupees: "" }, db);
    const priced = await createCatalogueElement({ actorId, name: `Priced ${suffix}`, code: `MB_PRICED_${suffix}`, parentCode: `MB_GROUP_${suffix}`, parentName: "Builder parent", parentCategory: "OTHER", billingUnit: "NOS", measurement: "COUNT", toClientRupees: "100.00" }, db);
    const parent = await createCatalogueElement({ actorId, name: `Fixed parent ${suffix}`, code: `MB_PARENT_${suffix}`, kind: "PACKAGE", parentCode: `MB_PKG_GROUP_${suffix}`, parentName: "Package parent", parentCategory: "OTHER", billingUnit: "NOS", measurement: "COUNT", toClientRupees: "900.00" }, db);
    const policy = await db.durationPolicy.create({ data: { code: `MB_POL_${suffix}`, name: "Builder one-off", mode: "ONE_OFF", authority: "INTERNAL_APPROVED", chargeMultiplierNumerator: 1, chargeMultiplierDenominator: 1, minimumChargeNumerator: 1, minimumChargeDenominator: 1, roundingMode: "NONE" } });

    const definition = {
      code: `MB_PKG_${suffix}`, name: "Builder package", version: 1, pricingMode: "COMPONENT_SUM" as const, active: false,
      components: [
        { commercialOfferingId: priceMissing.offering.id, quantityRuleType: "FIXED_PER_PACKAGE" as const, quantityValue: "2", billingMode: "BILLABLE" as const, sortOrder: 1 },
        { commercialOfferingId: priced.offering.id, quantityRuleType: "FIXED_PER_PACKAGE" as const, quantityValue: "3", billingMode: "BILLABLE" as const, sortOrder: 2 },
      ],
    };

    // A rate alone is not an amount: the reviewed duration policy stays a separate, audited decision.
    const beforePolicy = await previewPackageDefinition(definition, db);
    assert.equal(beforePolicy.rows[0].sides.TO_CLIENT.state, "RATE_MISSING");
    assert.equal(beforePolicy.rows[1].sides.TO_CLIENT.state, "DURATION_POLICY_UNAVAILABLE");

    await assignDurationPolicy({ actorId, offeringId: priced.offering.id, policyId: policy.id, reason: "Builder fixture policy assignment" }, db);

    const preview = await previewPackageDefinition(definition, db);
    assert.equal(preview.rows[0].sides.TO_CLIENT.state, "RATE_MISSING");
    assert.equal(preview.rows[1].sides.TO_CLIENT.state, "READY");
    assert.equal(preview.rows[1].sides.TO_CLIENT.unitRatePaise, 10000);
    assert.equal(preview.rows[1].sides.TO_CLIENT.amountPaise, 30000);

    const template = await createPackageVersion(definition, db);
    assert.equal(template.active, false);
    const stored = await db.packageTemplate.findUniqueOrThrow({ where: { id: template.id }, include: { components: { orderBy: { sortOrder: "asc" } } } });
    assert.deepEqual(stored.components.map((component) => component.commercialOfferingId), [priceMissing.offering.id, priced.offering.id]);
    assert.equal(stored.components[0].billingMode, "BILLABLE");
    assert.equal(stored.components[1].quantityValue.toString(), "3");

    // A version bump keeps the previous version intact.
    const nextVersion = await createPackageVersion({ ...definition, version: 2, components: [definition.components[1]] }, db);
    assert.equal(await db.packageTemplate.count({ where: { code: `MB_PKG_${suffix}` } }), 2);
    assert.notEqual(nextVersion.id, template.id);

    // The rate-missing element remains searchable for future recipes.
    const remaining = await db.commercialOffering.findUniqueOrThrow({ where: { code: `MB_MISSING_${suffix}` } });
    assert.equal(remaining.active, true);
    assert.equal(await db.price.count({ where: { commercialOfferingId: remaining.id } }), 0);

    // FIXED_PACKAGE uses the manually created parent offering, never a derived price.
    const fixed = await createPackageVersion({
      code: `MB_FIXED_${suffix}`, name: "Fixed builder package", version: 1, pricingMode: "FIXED_PACKAGE", active: false,
      parentCommercialOfferingId: parent.offering.id,
      components: [{ commercialOfferingId: priced.offering.id, quantityRuleType: "FIXED_PER_PACKAGE", quantityValue: "1", billingMode: "INCLUDED", sortOrder: 1 }],
    }, db);
    assert.equal(fixed.parentCommercialOfferingId, parent.offering.id);
    assert.equal((await db.price.findFirstOrThrow({ where: { commercialOfferingId: parent.offering.id, side: "TO_CLIENT" } })).amountPaise, 90000);
  } finally {
    await wipeCatalogue().catch(() => undefined);
    await db.durationPolicyPoint.deleteMany().catch(() => undefined);
    await db.durationPolicy.deleteMany().catch(() => undefined);
    if (actorId) await db.user.delete({ where: { id: actorId } }).catch(() => undefined);
    await db.$disconnect();
  }
});
