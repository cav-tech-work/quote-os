import type { PriceSide } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { GlobalRateResult } from "./types";

type RateDatabase = Pick<typeof prisma, "price">;

export async function resolveCurrentGlobalRate(offeringId: string, side: PriceSide, database: RateDatabase = prisma, asOf = new Date()): Promise<GlobalRateResult> {
  const prices = await database.price.findMany({
    where: {
      commercialOfferingId: offeringId, side, scopeType: "GLOBAL", marketId: null, active: true,
      AND: [{ OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: asOf } }] }, { OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }] }],
    },
    select: { id: true, amountPaise: true },
  });
  if (prices.length === 0) return { state: "RATE_UNAVAILABLE", side, scope: "GLOBAL" };
  if (prices.length > 1) return { state: "RATE_DATA_CONFLICT", side, scope: "GLOBAL", priceIds: prices.map((price) => price.id).sort() };
  return { state: "RATE_FOUND", side, scope: "GLOBAL", priceId: prices[0].id, amountPaise: prices[0].amountPaise };
}
