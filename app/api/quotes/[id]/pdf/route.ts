import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireRole("ADMIN", "QUOTE_USER");
  if ("error" in access) return access.error;
  const { id } = await params;
  const quote = await prisma.quote.findUnique({ where: { id }, include: { revisions: { orderBy: { revisionNumber: "desc" }, take: 1, select: { id: true } } } });
  const revision = quote?.revisions[0];
  if (!quote || !revision) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  return NextResponse.redirect(new URL(`/api/quotes/${id}/revisions/${revision.id}/pdf`, _request.url), 307);
}
