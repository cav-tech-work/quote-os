import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { QuotePdf } from "@/lib/quote-pdf";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireRole("ADMIN", "QUOTE_USER");
  if ("error" in access) return access.error;
  const { id } = await params;
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: { revisions: { orderBy: { revisionNumber: "desc" }, take: 1, include: { lines: true } } }
  });
  const revision = quote?.revisions[0];
  if (!quote || !revision) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  const buffer = await renderToBuffer(createElement(QuotePdf, { quote: { ...quote, revision } }) as never);
  return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${quote.number}.pdf"`, "Cache-Control": "private, no-store" } });
}
