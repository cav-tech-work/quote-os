import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireRole("ADMIN", "QUOTE_USER");
  if ("error" in access) return access.error;
  const { id } = await params;
  const quote = await prisma.quote.findUnique({ where: { id }, include: { revisions: { orderBy: { revisionNumber: "desc" }, include: { lines: true, documents: { select: { id: true, documentType: true, documentVersion: true, checksum: true, byteSize: true, filename: true, generatedAt: true } }, createdBy: { select: { name: true, email: true } }, issuedBy: { select: { name: true, email: true } } } }, events: { orderBy: { createdAt: "asc" } } } });
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  return NextResponse.json(quote);
}
