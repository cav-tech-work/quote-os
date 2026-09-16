import { Prisma, type PriceScopeType, type PriceSide } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const MAX_PAISE = 2_147_483_647n;

export class RateInputError extends Error {
  constructor(message: string) { super(message); this.name = "RateInputError"; }
}

export class RateConflictError extends Error {
  constructor(message = "This rate changed after you loaded it. Refresh and try again.") { super(message); this.name = "RateConflictError"; }
}

export function parseRupeesToPaise(raw: string) {
  const value = raw.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new RateInputError("Enter a non-negative rupee amount with at most two decimal places.");
  const paise = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  if (paise > MAX_PAISE) throw new RateInputError("Rate exceeds the supported maximum.");
  return Number(paise);
}

export function formatPaise(amountPaise: number) {
  return `${Math.trunc(amountPaise / 100)}.${String(amountPaise % 100).padStart(2, "0")}`;
}

function scopeWhere(scopeType: PriceScopeType, marketId: string | null) {
  if (scopeType === "GLOBAL") {
    if (marketId !== null) throw new RateInputError("Global rates cannot have a market.");
    return { scopeType, marketId: null } as const;
  }
  if (!marketId) throw new RateInputError("City rates require a market.");
  return { scopeType, marketId } as const;
}

export async function listCatalogueOfferings(scopeType: PriceScopeType, marketId: string | null) {
  const scope = scopeWhere(scopeType, marketId);
  const offerings = await prisma.commercialOffering.findMany({
    orderBy: [{ canonicalItem: { name: "asc" } }, { name: "asc" }],
    include: {
      canonicalItem: { select: { id: true, code: true, name: true, domain: true, entityType: true, active: true } },
      aliases: { where: { active: true }, select: { originalText: true } },
      durationPolicy: true,
      prices: { where: { ...scope, active: true }, include: { sourceImport: { select: { id: true, filename: true, appliedAt: true } } } },
    },
  });
  return offerings.map((offering) => {
    const client = offering.prices.find((price) => price.side === "TO_CLIENT") ?? null;
    const vendor = offering.prices.find((price) => price.side === "TO_VENDOR") ?? null;
    return {
      id: offering.id, code: offering.code, name: offering.name, kind: offering.kind,
      quantityBasis: offering.quantityBasis, pricingFamily: offering.pricingFamily,
      billingUnit: offering.billingUnit, active: offering.active, canonicalItem: offering.canonicalItem,
      aliases: offering.aliases.map((alias) => alias.originalText),
      durationBasis: offering.durationBasis, durationPolicy: offering.durationPolicy,
      completeness: client && vendor ? "BOTH" : client ? "CLIENT_ONLY" : vendor ? "VENDOR_ONLY" : "NEITHER",
      rates: { TO_CLIENT: client, TO_VENDOR: vendor },
    };
  });
}

type ChangeRateInput = {
  actorId: string;
  offeringId: string;
  side: PriceSide;
  scopeType: PriceScopeType;
  marketId: string | null;
  expectedCurrentPriceId: string | null;
  amountPaise: number | null;
  reason: string;
};

/**
 * Applies one audited price change using an already-open transaction client.
 * Shared by the rate editor and by Element Creator so both paths use the same
 * append-only Price/PriceAuditEvent semantics.
 */
export async function applyRateChange(tx: Prisma.TransactionClient, input: ChangeRateInput) {
  const reason = input.reason.trim();
  if (!reason) throw new RateInputError("A change reason is required.");
  if (reason.length > 500) throw new RateInputError("The change reason must be 500 characters or fewer.");
  if (input.amountPaise !== null && (!Number.isInteger(input.amountPaise) || input.amountPaise < 0 || input.amountPaise > Number(MAX_PAISE))) {
    throw new RateInputError("Rate must be a valid non-negative paise amount.");
  }
  const scope = scopeWhere(input.scopeType, input.marketId);
  const offering = await tx.commercialOffering.findUnique({ where: { id: input.offeringId }, select: { id: true } });
  if (!offering) throw new RateInputError("Commercial offering not found.");
  if (scope.scopeType === "CITY") {
    const market = await tx.rateMarket.findUnique({ where: { id: scope.marketId }, select: { active: true } });
    if (!market) throw new RateInputError("Rate market not found.");
    if (!market.active) throw new RateInputError("Inactive markets cannot receive new rates.");
  }
  const current = await tx.price.findFirst({ where: { commercialOfferingId: input.offeringId, side: input.side, ...scope, active: true } });
  if ((current?.id ?? null) !== input.expectedCurrentPriceId) throw new RateConflictError();
  if (input.amountPaise === null && !current) return { changed: false, price: null };
  if (current && input.amountPaise === current.amountPaise) return { changed: false, price: current };
  const now = new Date();
  if (current) await tx.price.update({ where: { id: current.id }, data: { active: false, effectiveTo: now } });
  const next = input.amountPaise === null ? null : await tx.price.create({ data: {
    commercialOfferingId: input.offeringId, side: input.side, ...scope,
    amountPaise: input.amountPaise, currency: "INR", effectiveFrom: now, active: true,
  } });
  await tx.priceAuditEvent.create({ data: {
    actorId: input.actorId, commercialOfferingId: input.offeringId, side: input.side, ...scope,
    action: next ? (current ? "REPLACE" : "CREATE") : "CLEAR",
    oldPriceId: current?.id ?? null, newPriceId: next?.id ?? null, reason,
  } });
  return { changed: true, price: next };
}

export async function changeCurrentRate(input: ChangeRateInput, database = prisma) {
  try {
    return await database.$transaction((tx) => applyRateChange(tx, input), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof RateInputError || error instanceof RateConflictError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) throw new RateConflictError();
    throw error;
  }
}

export async function catalogueRateHistory(offeringId: string) {
  const [prices, events, durationPolicyEvents] = await Promise.all([
    prisma.price.findMany({ where: { commercialOfferingId: offeringId }, orderBy: [{ createdAt: "desc" }], include: { market: true, sourceImport: { select: { id: true, filename: true, appliedAt: true } } } }),
    prisma.priceAuditEvent.findMany({ where: { commercialOfferingId: offeringId }, orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true, email: true } }, market: true, oldPrice: true, newPrice: true } }),
    prisma.durationPolicyAssignmentAudit.findMany({ where: { commercialOfferingId: offeringId }, orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true, email: true } }, oldPolicy: true, newPolicy: true } }),
  ]);
  return { prices, events, durationPolicyEvents };
}
