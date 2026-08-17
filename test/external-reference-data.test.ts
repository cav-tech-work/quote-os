import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const data = JSON.parse(readFileSync(resolve(root, "reference-data/brandprofesor/catalogue.json"), "utf8"));
const manifest = JSON.parse(readFileSync(resolve(root, "reference-data/brandprofesor/manifest.json"), "utf8"));

test("Brand Profesor snapshot is complete, provenance-rich external evidence", () => {
  assert.equal(data.authority, "EXTERNAL_MARKET_REFERENCE");
  assert.match(data.disclaimer, /Not approved QuoteOS/);
  assert.equal(data.products.length, manifest.productCount);
  assert.equal(data.categories.length, manifest.categoryCount);
  assert.equal(data.policies.length, 3);
  assert.ok(data.products.every((product: { sourceId: number; name: string; url: string; pricing: { currency: string; currentMinor: string } }) => product.sourceId && product.name && product.url.startsWith("https://brandprofesor.com/") && product.pricing.currency === "INR" && /^\d+$/.test(product.pricing.currentMinor)));
  assert.ok(data.policies.every((policy: { url: string; text: string }) => policy.url.startsWith("https://brandprofesor.com/") && policy.text.length > 1000));
});

test("event and exhibition reference families are present with option pricing", () => {
  const category = (name: string) => data.products.filter((product: { categories: Array<{ name: string }> }) => product.categories.some((value) => value.name === name));
  assert.equal(category("Event Elements").length, 34);
  assert.equal(category("Event Man Power").length, 6);
  assert.equal(category("Exhibition Elements").length, 20);
  assert.ok(category("Event Elements").some((product: { variations: unknown[] }) => product.variations.length > 0));
  assert.equal(data.products.reduce((total: number, product: { variations: unknown[] }) => total + product.variations.length, 0), manifest.variationCount);
});

test("external reference data has no Prisma or production import coupling", () => {
  const crawler = readFileSync(resolve(root, "scripts/crawl-brandprofesor-reference.mjs"), "utf8");
  assert.doesNotMatch(crawler, /@prisma|CommercialOffering|CatalogueItem|prisma\./);
});
