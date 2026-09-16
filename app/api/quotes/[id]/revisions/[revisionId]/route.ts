import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { recalculateNormalizedDraftLine, replaceNormalizedDraft, QuoteLifecycleError } from "@/lib/quote-lifecycle";
import { NormalizedQuoteError } from "@/lib/normalized-quotes";

const measurement = z.object({ value: z.string(), unit: z.enum(["M", "FT"]) });
const schema = z.object({ mode: z.literal("NORMALIZED"), type: z.enum(["CLIENT", "VENDOR"]), company: z.string().trim().min(2), project: z.string().trim().optional(), venue: z.string().trim().optional(), city: z.string().trim().optional(), salesperson: z.string().trim().optional(), taxPercentage: z.number().min(0).max(100), eventDays: z.number().int().positive(), lines: z.array(z.object({ commercialOfferingId: z.string().cuid(), configuration: z.object({ quantity: z.string().optional(), length: measurement.optional(), width: measurement.optional(), height: measurement.optional(), headcount: z.string().optional(), dutyUnitsPerPerson: z.string().optional() }), usageDays: z.string().optional(), overrideChargeUnits: z.string().optional(), overrideReason: z.string().trim().optional(), expectedPriceId: z.string().optional(), discountPercent: z.number().min(0).max(100).default(0), remarks: z.string().trim().optional() })).min(1) });
const lineSchema = z.object({ lineId: z.string().cuid(), line: schema.shape.lines.element });
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; revisionId: string }> }) {
  const access = await requireRole("ADMIN", "QUOTE_USER"); if ("error" in access) return access.error;
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id, revisionId } = await params;
  try { return NextResponse.json(await replaceNormalizedDraft(id, revisionId, parsed.data, access.user.id)); }
  catch (error) { if (error instanceof QuoteLifecycleError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.code === "REVISION_NOT_FOUND" ? 404 : 409 }); if (error instanceof NormalizedQuoteError) return NextResponse.json({ code: error.code, error: error.message }, { status: 422 }); throw error; }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; revisionId: string }> }) {
  const access = await requireRole("ADMIN", "QUOTE_USER"); if ("error" in access) return access.error;
  const parsed = lineSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id, revisionId } = await params;
  try { return NextResponse.json(await recalculateNormalizedDraftLine(id, revisionId, parsed.data.lineId, parsed.data.line, access.user.id)); }
  catch (error) { if (error instanceof QuoteLifecycleError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.code === "REVISION_NOT_FOUND" ? 404 : 409 }); if (error instanceof NormalizedQuoteError) return NextResponse.json({ code: error.code, error: error.message }, { status: 422 }); throw error; }
}
