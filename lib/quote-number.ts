import type { Prisma } from "@prisma/client";

export async function allocateQuoteNumber(tx: Prisma.TransactionClient, now = new Date()) {
  const year = now.getUTCFullYear();
  const rows = await tx.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "QuoteNumberCounter" ("year", "nextValue", "updatedAt")
    VALUES (${year}, 2, NOW())
    ON CONFLICT ("year") DO UPDATE
      SET "nextValue" = "QuoteNumberCounter"."nextValue" + 1, "updatedAt" = NOW()
    RETURNING "nextValue" - 1 AS value
  `;
  const sequence = Number(rows[0]?.value);
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error("QUOTE_NUMBER_ALLOCATION_FAILED");
  return `QT-${year}-${String(sequence).padStart(6, "0")}`;
}
