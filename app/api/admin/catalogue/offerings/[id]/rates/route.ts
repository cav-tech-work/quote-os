import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { changeCurrentRate, parseRupeesToPaise, RateConflictError, RateInputError } from "@/lib/catalogue-rates";

const bodySchema = z.object({
  side: z.enum(["TO_CLIENT", "TO_VENDOR"]), scopeType: z.enum(["GLOBAL", "CITY"]),
  marketId: z.string().min(1).nullable(), expectedCurrentPriceId: z.string().min(1).nullable(),
  amountRupees: z.string().nullable(), reason: z.string(),
});

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireRole("ADMIN");
  if ("error" in access) return access.error;
  try {
    const body = bodySchema.parse(await request.json());
    const { id } = await context.params;
    const result = await changeCurrentRate({ ...body, actorId: access.user.id, offeringId: id, amountPaise: body.amountRupees === null ? null : parseRupeesToPaise(body.amountRupees) });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RateConflictError) return NextResponse.json({ code: "RATE_CONFLICT", error: error.message }, { status: 409 });
    if (error instanceof RateInputError || error instanceof z.ZodError) return NextResponse.json({ error: error instanceof z.ZodError ? "Invalid rate change request." : error.message }, { status: 400 });
    throw error;
  }
}
