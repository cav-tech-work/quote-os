import assert from "node:assert/strict";
import test from "node:test";
import { searchSelectableComponents } from "../lib/component-search";

function offering(input: Partial<any>) {
  return {
    id: input.id ?? input.code,
    code: input.code,
    name: input.name,
    active: input.active ?? true,
    kind: input.kind ?? null,
    billingUnit: input.billingUnit ?? "NOS",
    pricingFamily: input.pricingFamily ?? null,
    quantityBasis: input.quantityBasis ?? null,
    canonicalItem: input.canonicalItem ?? { code: "PARENT", name: "Parent Name" },
    aliases: input.aliases ?? [],
    sourceMappings: input.sourceMappings ?? [],
    businessReview: input.businessReview ?? { status: "UNREVIEWED" },
    prices: input.prices ?? [],
  };
}

const plugPoint = offering({
  code: "PWR_PLUGPOIN7",
  name: "Plug Points (utility)",
  kind: null,
  pricingFamily: null,
  quantityBasis: "COUNT",
  canonicalItem: { code: "PLUG_15A", name: "Plug Point 15A" },
  aliases: [{ originalText: "15A plug point" }],
  sourceMappings: [{
    sourceDescription: "Plug Points (utility)",
    notes: JSON.stringify({
      description: "Plug Points (utility)",
      mapsTo: "Plug Point 15A",
      tags: ["15/16 amp power point", "event power socket"],
    }),
  }],
  businessReview: { status: "UNREVIEWED" },
  prices: [],
});

function database(rows: any[]) {
  return {
    commercialOffering: {
      findMany: async ({ where }: any) => rows.filter((row) => {
        if (!row.active) return false;
        if (where.kind === "PACKAGE") return row.kind === "PACKAGE";
        return row.kind === null || row.kind === "ITEM" || row.kind === "SERVICE";
      }).sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code)),
    },
  };
}

test("component identity search includes null-kind, rate-missing and unreviewed V1 elements", async () => {
  const results = await searchSelectableComponents({ search: "PWR_PLUGPOIN7" }, database([plugPoint]));
  assert.equal(results.length, 1);
  assert.equal(results[0].elementCode, "PWR_PLUGPOIN7");
  assert.equal(results[0].pricingFamily, null);
  assert.equal(results[0].businessReviewStatus, "UNREVIEWED");
  assert.deepEqual(results[0].rates, {});
});

test("component identity search covers display, element code, parent code, parent name, alias and LookUp evidence", async () => {
  for (const search of ["Plug Point", "PWR_PLUGPOIN7", "PLUG_15A", "15A plug point", "event power socket"]) {
    const results = await searchSelectableComponents({ search }, database([plugPoint]));
    assert.equal(results.some((item) => item.elementCode === "PWR_PLUGPOIN7"), true, search);
  }
});

test("includeCodes injects suggested candidates ahead of result cap", async () => {
  const filler = Array.from({ length: 120 }, (_, index) => offering({ code: `AAA_${String(index).padStart(3, "0")}`, name: `A filler ${index}`, kind: "ITEM", businessReview: { status: "APPROVED" } }));
  const results = await searchSelectableComponents({ search: "A", includeCodes: ["PWR_PLUGPOIN7"], limit: 20 }, database([...filler, plugPoint]));
  assert.equal(results[0].elementCode, "PWR_PLUGPOIN7");
  assert.equal(results.some((item) => item.elementCode === "PWR_PLUGPOIN7"), true);
});

test("package-builder component search keeps package parents separate from selectable element components", async () => {
  const packageParent = offering({ code: "PKG_PARENT", name: "Package Parent", kind: "PACKAGE" });
  const elements = await searchSelectableComponents({ search: "Plug Point" }, database([plugPoint, packageParent]));
  const parents = await searchSelectableComponents({ kind: "PACKAGE" }, database([plugPoint, packageParent]));
  assert.deepEqual(elements.map((item) => item.elementCode), ["PWR_PLUGPOIN7"]);
  assert.deepEqual(parents.map((item) => item.elementCode), ["PKG_PARENT"]);
});
