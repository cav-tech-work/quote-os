import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateQuote } from "@/lib/money";
import { NormalizedQuoteError, persistNormalizedQuote } from "@/lib/normalized-quotes";

const quoteDetails = { type: z.enum(["CLIENT", "VENDOR"]), company: z.string().trim().min(2), project: z.string().trim().optional(), venue: z.string().trim().optional(), city: z.string().trim().optional(), salesperson: z.string().trim().optional(), taxPercentage: z.number().min(0).max(100) };
const legacyDraft = z.object({ ...quoteDetails, mode: z.literal("LEGACY").optional(), lines: z.array(z.object({ catalogueItemId: z.string().cuid(), quantity: z.number().positive(), days: z.number().positive(), discountPercent: z.number().min(0).max(100), remarks: z.string().trim().optional() })).min(1) });
const measurement = z.object({ value: z.string(), unit: z.enum(["M", "FT"]) });
const normalizedDraft = z.object({ ...quoteDetails, mode: z.literal("NORMALIZED"), eventDays: z.number().int().positive(), lines: z.array(z.object({ commercialOfferingId: z.string().cuid(), configuration: z.object({ quantity: z.string().optional(), length: measurement.optional(), width: measurement.optional(), height: measurement.optional() }), usageDays: z.string().optional(), overrideChargeUnits: z.string().optional(), overrideReason: z.string().trim().optional(), expectedPriceId: z.string().optional(), discountPercent: z.number().min(0).max(100).default(0), remarks: z.string().trim().optional() })).min(1) });

export async function GET() {
  const access = await requireRole("ADMIN", "QUOTE_USER");
  if ("error" in access) return access.error;
  const quotes = await prisma.quote.findMany({ include: { revisions: { orderBy: { revisionNumber: "desc" }, take: 1 }, createdBy: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json(quotes);
}

async function createLegacyQuote(input: z.infer<typeof legacyDraft>, actorId: string) {
  const items = await prisma.catalogueItem.findMany({ where: { id: { in: input.lines.map((line) => line.catalogueItemId) }, active: true } });
  if (items.length !== new Set(input.lines.map((line) => line.catalogueItemId)).size) throw new NormalizedQuoteError("OFFERING_NOT_FOUND", "One or more legacy catalogue items are unavailable.");
  const itemById = new Map(items.map((item) => [item.id, item]));
  const calculatedLines = input.lines.map((line) => { const item = itemById.get(line.catalogueItemId)!; const rateUsedPaise = input.type === "CLIENT" ? item.clientRatePaise : item.vendorRatePaise; const grossPaise = Math.round(line.quantity * line.days * rateUsedPaise); const discountPaise = Math.round(grossPaise * line.discountPercent / 100); return { ...line, item, rateUsedPaise, discountPaise, lineTotalPaise: grossPaise - discountPaise }; });
  const totals = calculateQuote(calculatedLines.map((line) => ({ quantity: line.quantity, days: line.days, ratePaise: line.rateUsedPaise, discountPercent: line.discountPercent })), input.taxPercentage);
  return prisma.$transaction(async (tx) => { const number = `QT-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`; const created = await tx.quote.create({ data: { number, type: input.type, company: input.company, project: input.project || null, venue: input.venue || null, city: input.city || null, salesperson: input.salesperson || null, createdById: actorId } }); const revision = await tx.quoteRevision.create({ data: { quoteId: created.id, revisionNumber: 1, preparedDate: new Date(), taxPercentage: input.taxPercentage, settingsSnapshot: { builderMode: "LEGACY" }, ...totals, lines: { create: calculatedLines.map((line) => ({ catalogueItemId: line.catalogueItemId, itemCodeSnapshot: line.item.code, itemNameSnapshot: line.item.name, descriptionSnapshot: line.item.description, unitSnapshot: line.item.unit, quantity: line.quantity, days: line.days, rateUsedPaise: line.rateUsedPaise, discountPercent: line.discountPercent, discountPaise: line.discountPaise, lineTotalPaise: line.lineTotalPaise, remarks: line.remarks || null })) } }, include: { lines: true } }); await tx.quoteEvent.create({ data: { quoteId: created.id, actorId, action: "CREATED", metadata: { revisionId: revision.id, builderMode: "LEGACY" } } }); return { ...created, revision }; });
}

export async function POST(request: NextRequest) {
  const access = await requireRole("ADMIN", "QUOTE_USER");
  if ("error" in access) return access.error;
  const raw = await request.json(); const normalized = raw?.mode === "NORMALIZED";
  const parsed = (normalized ? normalizedDraft : legacyDraft).safeParse(raw);
  if (!parsed.success) return NextResponse.json({ code: "CONFIGURATION_INVALID", error: parsed.error.flatten() }, { status: 400 });
  try { const quote = normalized ? await persistNormalizedQuote(parsed.data as z.infer<typeof normalizedDraft>, access.user.id) : await createLegacyQuote(parsed.data as z.infer<typeof legacyDraft>, access.user.id); return NextResponse.json(quote, { status: 201 }); }
  catch (error) { if (error instanceof NormalizedQuoteError) return NextResponse.json({ code: error.code, error: error.message, details: error.details }, { status: error.code === "RATE_CONFLICT" ? 409 : error.code === "OFFERING_NOT_FOUND" ? 404 : 422 }); throw error; }
}
