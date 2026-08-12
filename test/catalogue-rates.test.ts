import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { hasCatalogueAdminAuthority } from "../lib/access-policy";
import { changeCurrentRate, parseRupeesToPaise, RateConflictError, RateInputError } from "../lib/catalogue-rates";

test("rupee input converts to paise exactly and distinguishes zero", () => {
  assert.equal(parseRupeesToPaise("0"), 0);
  assert.equal(parseRupeesToPaise("0.01"), 1);
  assert.equal(parseRupeesToPaise("1250.5"), 125050);
  assert.equal(parseRupeesToPaise("21474836.47"), 2147483647);
  for (const invalid of ["", "-1", ".5", "01", "1.001", "1e3", "21474836.48"]) assert.throws(() => parseRupeesToPaise(invalid), RateInputError);
});

test("catalogue administration requires an active ADMIN and not access-manager status", () => {
  assert.equal(hasCatalogueAdminAuthority({ active: true, role: "ADMIN" }), true);
  assert.equal(hasCatalogueAdminAuthority({ active: true, role: "QUOTE_USER" }), false);
  assert.equal(hasCatalogueAdminAuthority({ active: false, role: "ADMIN" }), false);
});

const databaseUrl = process.env.TEST_DATABASE_URL;
test("rate lifecycle is independent, audited, conflict-safe, market-aware, and database-unique", { skip: !databaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = Date.now().toString(36); let canonicalId = ""; let offeringId = ""; let actorId = ""; let marketId = "";
  try {
    const actor = await db.user.create({ data: { email: `rate-admin-${suffix}@clockwork-av.com`, role: "ADMIN" } }); actorId = actor.id;
    const canonical = await db.canonicalItem.create({ data: { code: `T-CAN-${suffix}`, name: "Test canonical", domain: "OTHER", entityType: "SERVICE", defaultUnit: "NOS" } }); canonicalId = canonical.id;
    const offering = await db.commercialOffering.create({ data: { code: `T-OFF-${suffix}`, name: "Test offering", canonicalItemId: canonical.id, kind: "SERVICE", billingUnit: "NOS", quantityBasis: "COUNT", durationBasis: "ONE_OFF" } }); offeringId = offering.id;
    const market = await db.rateMarket.create({ data: { code: `TM${suffix}`.slice(0, 30), cityName: "Test City" } }); marketId = market.id;
    const created = await changeCurrentRate({ actorId, offeringId, side: "TO_CLIENT", scopeType: "GLOBAL", marketId: null, expectedCurrentPriceId: null, amountPaise: 0, reason: "Set a deliberate free client rate" }, db);
    assert.equal(created.price?.amountPaise, 0);
    await assert.rejects(changeCurrentRate({ actorId, offeringId, side: "TO_CLIENT", scopeType: "GLOBAL", marketId: null, expectedCurrentPriceId: null, amountPaise: 100, reason: "Stale change" }, db), RateConflictError);
    const vendor = await changeCurrentRate({ actorId, offeringId, side: "TO_VENDOR", scopeType: "GLOBAL", marketId: null, expectedCurrentPriceId: null, amountPaise: 5000, reason: "Independent vendor rate" }, db);
    const replaced = await changeCurrentRate({ actorId, offeringId, side: "TO_CLIENT", scopeType: "GLOBAL", marketId: null, expectedCurrentPriceId: created.price!.id, amountPaise: 2500, reason: "Replace client rate" }, db);
    await changeCurrentRate({ actorId, offeringId, side: "TO_CLIENT", scopeType: "GLOBAL", marketId: null, expectedCurrentPriceId: replaced.price!.id, amountPaise: null, reason: "Clear client rate" }, db);
    await changeCurrentRate({ actorId, offeringId, side: "TO_CLIENT", scopeType: "CITY", marketId, expectedCurrentPriceId: null, amountPaise: 9900, reason: "City override" }, db);
    assert.equal((await db.price.findUnique({ where: { id: vendor.price!.id } }))?.active, true);
    assert.equal(await db.priceAuditEvent.count({ where: { commercialOfferingId: offeringId } }), 5);
    assert.deepEqual((await db.priceAuditEvent.findMany({ where: { commercialOfferingId: offeringId }, orderBy: { createdAt: "asc" } })).map((event) => event.action), ["CREATE", "CREATE", "REPLACE", "CLEAR", "CREATE"]);
    await assert.rejects(db.price.create({ data: { commercialOfferingId: offeringId, side: "TO_VENDOR", scopeType: "GLOBAL", amountPaise: 1, active: true } }));
    await db.rateMarket.update({ where: { id: marketId }, data: { active: false } });
    await assert.rejects(changeCurrentRate({ actorId, offeringId, side: "TO_VENDOR", scopeType: "CITY", marketId, expectedCurrentPriceId: null, amountPaise: 1, reason: "Must fail" }, db), RateInputError);
  } finally {
    if (offeringId) { await db.priceAuditEvent.deleteMany({ where: { commercialOfferingId: offeringId } }); await db.price.deleteMany({ where: { commercialOfferingId: offeringId } }); await db.commercialOffering.delete({ where: { id: offeringId } }).catch(() => undefined); }
    if (canonicalId) await db.canonicalItem.delete({ where: { id: canonicalId } }).catch(() => undefined);
    if (marketId) await db.rateMarket.delete({ where: { id: marketId } }).catch(() => undefined);
    if (actorId) await db.user.delete({ where: { id: actorId } }).catch(() => undefined);
    await db.$disconnect();
  }
});
