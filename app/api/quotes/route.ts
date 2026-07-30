import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateQuote } from "@/lib/money";

const draftInput = z.object({
  type: z.enum(["CLIENT", "VENDOR"]), company: z.string().trim().min(2), project: z.string().trim().optional(), venue: z.string().trim().optional(), city: z.string().trim().optional(), salesperson: z.string().trim().optional(), taxPercentage: z.number().min(0).max(100),
  lines: z.array(z.object({ catalogueItemId: z.string().cuid(), quantity: z.number().positive(), days: z.number().positive(), discountPercent: z.number().min(0).max(100), remarks: z.string().trim().optional() })).min(1)
});

export async function GET() {
  const access = await requireRole("ADMIN", "QUOTE_USER");
  if ("error" in access) return access.error;
  const quotes = await prisma.quote.findMany({ include: { revisions: { orderBy: { revisionNumber: "desc" }, take: 1 }, createdBy: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json(quotes);
}

export async function POST(request: NextRequest) {
  const access = await requireRole("ADMIN", "QUOTE_USER");
  if ("error" in access) return access.error;
  const parsed = draftInput.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const items = await prisma.catalogueItem.findMany({ where: { id: { in: input.lines.map((line) => line.catalogueItemId) }, active: true } });
  if (items.length !== new Set(input.lines.map((line) => line.catalogueItemId)).size) return NextResponse.json({ error: "One or more catalogue items are unavailable" }, { status: 400 });
  const itemById = new Map(items.map((item) => [item.id, item]));
  const calculatedLines = input.lines.map((line) => {
    const item = itemById.get(line.catalogueItemId)!;
    const rateUsedPaise = input.type === "CLIENT" ? item.clientRatePaise : item.vendorRatePaise;
    const grossPaise = Math.round(line.quantity * line.days * rateUsedPaise);
    const discountPaise = Math.round(grossPaise * line.discountPercent / 100);
    return { ...line, item, rateUsedPaise, discountPaise, lineTotalPaise: grossPaise - discountPaise };
  });
  const totals = calculateQuote(calculatedLines.map((line) => ({ quantity: line.quantity, days: line.days, ratePaise: line.rateUsedPaise, discountPercent: line.discountPercent })), input.taxPercentage);
  const quote = await prisma.$transaction(async (tx) => {
    const number = `QT-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`;
    const created = await tx.quote.create({ data: { number, type: input.type, company: input.company, project: input.project || null, venue: input.venue || null, city: input.city || null, salesperson: input.salesperson || null, createdById: access.session.user.id } });
    const revision = await tx.quoteRevision.create({ data: { quoteId: created.id, revisionNumber: 1, preparedDate: new Date(), taxPercentage: input.taxPercentage, settingsSnapshot: {}, ...totals, lines: { create: calculatedLines.map((line) => ({ catalogueItemId: line.catalogueItemId, itemCodeSnapshot: line.item.code, itemNameSnapshot: line.item.name, descriptionSnapshot: line.item.description, unitSnapshot: line.item.unit, quantity: line.quantity, days: line.days, rateUsedPaise: line.rateUsedPaise, discountPercent: line.discountPercent, discountPaise: line.discountPaise, lineTotalPaise: line.lineTotalPaise, remarks: line.remarks || null })) } } });
    await tx.quoteEvent.create({ data: { quoteId: created.id, actorId: access.session.user.id, action: "CREATED", metadata: { revisionId: revision.id } } });
    return { ...created, revision };
  });
  return NextResponse.json(quote, { status: 201 });
}
