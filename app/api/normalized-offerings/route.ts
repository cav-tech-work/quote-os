import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { calculateNormalizedLine, listNormalizedOfferings, NormalizedQuoteError } from "@/lib/normalized-quotes";

const side = z.enum(["TO_CLIENT", "TO_VENDOR"]);
const measurement = z.object({ value: z.string(), unit: z.enum(["M", "FT"]) });
const configuration = z.object({ quantity: z.string().optional(), length: measurement.optional(), width: measurement.optional(), height: measurement.optional() });
const preview = z.object({ commercialOfferingId: z.string().cuid(), side, configuration, usageDays: z.string(), overrideChargeUnits: z.string().optional(), overrideReason: z.string().optional(), expectedPriceId: z.string().optional() });

export async function GET(request: NextRequest) {
  const access = await requireRole("ADMIN", "QUOTE_USER");
  if ("error" in access) return access.error;
  const parsedSide = side.safeParse(request.nextUrl.searchParams.get("side") ?? "TO_CLIENT");
  if (!parsedSide.success) return NextResponse.json({ code: "CONFIGURATION_INVALID", error: "Invalid rate side." }, { status: 400 });
  return NextResponse.json({ offerings: await listNormalizedOfferings(parsedSide.data, request.nextUrl.searchParams.get("search")?.trim() ?? "") });
}

export async function POST(request: NextRequest) {
  const access = await requireRole("ADMIN", "QUOTE_USER");
  if ("error" in access) return access.error;
  const parsed = preview.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ code: "CONFIGURATION_INVALID", error: parsed.error.flatten() }, { status: 400 });
  try {
    const { offering, policy, calculation } = await calculateNormalizedLine(parsed.data, parsed.data.side);
    return NextResponse.json({ offering: { id: offering.id, code: offering.code, name: offering.name }, policy: { id: policy.id, code: policy.code, mode: policy.mode }, calculation });
  } catch (error) {
    if (error instanceof NormalizedQuoteError) return NextResponse.json({ code: error.code, error: error.message, details: error.details }, { status: error.code === "OFFERING_NOT_FOUND" ? 404 : error.code === "RATE_CONFLICT" ? 409 : 422 });
    throw error;
  }
}
