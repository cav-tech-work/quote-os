import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ORIGIN = "https://brandprofesor.com";
const API = `${ORIGIN}/wp-json`;
const USER_AGENT = "QuoteOS reference research bot (+https://github.com/cav-tech-work/quote-os)";
const OUTPUT = resolve(process.cwd(), "reference-data/brandprofesor");
const POLICY_SLUGS = ["refund-returns-brand-profesor", "privacy-policy-of-brand-profesor", "terms-and-conditions-brand-profesor"];

const wait = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
const decode = (value) => value.replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number))).replace(/&#x([0-9a-f]+);/gi, (_, number) => String.fromCodePoint(parseInt(number, 16))).replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#(?:8216|8217);/g, "'").replace(/&#(?:8220|8221);/g, '"').replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
const text = (html = "") => decode(html.replace(/\[(?:\/?)[^\]]+]/g, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function request(url) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json,text/plain;q=0.9,*/*;q=0.1" } });
    if (response.ok) return response;
    if (attempt === 3 || ![429, 500, 502, 503, 504, 520, 522, 524].includes(response.status)) throw new Error(`${response.status} ${response.statusText}: ${url}`);
    await wait(1000 * 2 ** attempt);
  }
}

async function paged(path, perPage = 100) {
  const firstUrl = `${API}${path}${path.includes("?") ? "&" : "?"}per_page=${perPage}&page=1`;
  const first = await request(firstUrl); const items = await first.json(); const pages = Number(first.headers.get("x-wp-totalpages") ?? 1);
  for (let page = 2; page <= pages; page++) { await wait(350); items.push(...await (await request(`${API}${path}${path.includes("?") ? "&" : "?"}per_page=${perPage}&page=${page}`)).json()); }
  return items;
}

function priceRecord(prices) {
  return {
    currency: prices.currency_code, minorUnit: prices.currency_minor_unit,
    currentMinor: prices.price, regularMinor: prices.regular_price, saleMinor: prices.sale_price || null,
    rangeMinor: prices.price_range ? { min: prices.price_range.min_amount, max: prices.price_range.max_amount } : null,
  };
}

function productRecord(product, variations) {
  return {
    sourceId: product.id, name: decode(product.name), slug: product.slug, url: product.permalink, sku: product.sku || null,
    type: product.type, categories: product.categories.map(({ id, name, slug }) => ({ sourceId: id, name: decode(name), slug })),
    tags: product.tags.map(({ id, name, slug }) => ({ sourceId: id, name: decode(name), slug })),
    attributes: product.attributes.map(({ id, name, taxonomy, has_variations, terms }) => ({ sourceId: id, name: decode(name), taxonomy, variesPrice: has_variations, values: terms.map(({ id: termId, name: termName, slug }) => ({ sourceId: termId, name: decode(termName), slug })) })),
    pricing: priceRecord(product.prices),
    variations: variations.map((variation) => ({ sourceId: variation.id, label: variation.variation, pricing: priceRecord(variation.prices) })),
    purchasable: product.is_purchasable, inStock: product.is_in_stock, soldIndividually: product.sold_individually,
    quantityPolicy: { minimum: product.add_to_cart.minimum, maximum: product.add_to_cart.maximum, multipleOf: product.add_to_cart.multiple_of },
    shortDescriptionText: text(product.short_description).slice(0, 1000) || null,
    observedPriceHtmlText: text(product.price_html) || null,
  };
}

async function main() {
  const robotsResponse = await request(`${ORIGIN}/robots.txt`); const robots = await robotsResponse.text();
  if (/Disallow:\s*\//i.test(robots) && !/Disallow:\s*\/wp-admin\//i.test(robots)) throw new Error("Site-wide crawling is disallowed by robots.txt");
  const capturedAt = new Date().toISOString();
  const [products, categories, policyPages] = await Promise.all([
    paged("/wc/store/v1/products"), paged("/wc/store/v1/products/categories"), Promise.all(POLICY_SLUGS.map(async (slug) => (await (await request(`${API}/wp/v2/pages?slug=${slug}`)).json())[0])),
  ]);
  const records = [];
  for (const [index, product] of products.entries()) {
    const variations = [];
    for (let offset = 0; offset < product.variations.length; offset += 4) {
      if (offset) await wait(250);
      variations.push(...await Promise.all(product.variations.slice(offset, offset + 4).map(async (variation) => (await request(`${API}/wc/store/v1/products/${variation.id}`)).json())));
    }
    records.push(productRecord(product, variations));
    if ((index + 1) % 20 === 0) process.stderr.write(`Captured ${index + 1}/${products.length} products\n`);
  }
  const policies = policyPages.filter(Boolean).map((page) => ({ sourceId: page.id, slug: page.slug, title: text(page.title.rendered), url: page.link, modifiedAt: `${page.modified_gmt}Z`, text: text(page.content.rendered) }));
  const payload = {
    schemaVersion: 1, authority: "EXTERNAL_MARKET_REFERENCE", source: { site: ORIGIN, productsApi: `${API}/wc/store/v1/products`, robotsUrl: `${ORIGIN}/robots.txt`, robotsSha256: sha256(robots), capturedAt },
    disclaimer: "External observation only. Not approved QuoteOS identity, pricing, policy, or import authority. Prices may change and may include product options, taxes, delivery, installation, or geographic conditions not normalized here.",
    categories: categories.map(({ id, name, slug, count }) => ({ sourceId: id, name: decode(name), slug, productCount: count, url: `${ORIGIN}/product-category/${slug}/` })),
    products: records, policies,
  };
  const canonical = `${JSON.stringify(payload, null, 2)}\n`; const manifest = {
    schemaVersion: 1, capturedAt, source: ORIGIN, robotsAllowed: true,
    productCount: records.length, variationCount: records.reduce((sum, item) => sum + item.variations.length, 0), categoryCount: payload.categories.length, policyCount: policies.length,
    productsWithCurrentPrice: records.filter((item) => item.pricing.currentMinor !== "").length,
    productsWithPriceRange: records.filter((item) => item.pricing.rangeMinor !== null).length,
    datasetSha256: sha256(canonical),
  };
  await mkdir(OUTPUT, { recursive: true });
  await writeFile(resolve(OUTPUT, "catalogue.json"), canonical); await writeFile(resolve(OUTPUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

await main();
