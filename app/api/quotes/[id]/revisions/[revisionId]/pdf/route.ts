import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getRetainedDocument, getRevisionForPreview, QuoteLifecycleError, renderRevisionPdf } from "@/lib/quote-lifecycle";

export const runtime = "nodejs";
export async function GET(_: Request, { params }: { params: Promise<{ id: string; revisionId: string }> }) {
  const access = await requireRole("ADMIN", "QUOTE_USER"); if ("error" in access) return access.error;
  const { id, revisionId } = await params;
  try {
    const revision = await getRevisionForPreview(id, revisionId);
    if (revision.status !== "DRAFT") {
      try { const retained = await getRetainedDocument(id, revisionId); return new NextResponse(new Uint8Array(retained.bytes), { headers: { "Content-Type": retained.document.mimeType, "Content-Disposition": `attachment; filename="${retained.document.filename}"`, "X-Document-SHA256": retained.document.checksum, "X-Document-Authority": "RETAINED_ISSUED_DOCUMENT", "Cache-Control": "private, no-store" } }); }
      catch (error) { if (!(error instanceof QuoteLifecycleError) || error.code !== "REVISION_NOT_FOUND") throw error; const bytes = await renderRevisionPdf(revision.quote, revision); return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${revision.quote.number}-R${revision.revisionNumber}-LEGACY.pdf"`, "X-Document-Authority": "LEGACY_REGENERATABLE", "Cache-Control": "private, no-store" } }); }
    }
    const bytes = await renderRevisionPdf(revision.quote, revision); return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${revision.quote.number}-R${revision.revisionNumber}-DRAFT.pdf"`, "X-Document-Authority": "DRAFT_PREVIEW", "Cache-Control": "private, no-store" } });
  } catch (error) { if (error instanceof QuoteLifecycleError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.code === "REVISION_NOT_FOUND" ? 404 : 500 }); throw error; }
}
