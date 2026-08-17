import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { issueRevision, QuoteLifecycleError } from "@/lib/quote-lifecycle";

export const runtime = "nodejs";
export async function POST(_: Request, { params }: { params: Promise<{ id: string; revisionId: string }> }) {
  const access = await requireRole("ADMIN", "QUOTE_USER"); if ("error" in access) return access.error;
  const { id, revisionId } = await params;
  try { const result = await issueRevision(id, revisionId, access.user.id); return NextResponse.json({ revision: result.revision, document: { id: result.document.id, checksum: result.document.checksum, byteSize: result.document.byteSize, filename: result.document.filename }, idempotent: result.idempotent }); }
  catch (error) { if (error instanceof QuoteLifecycleError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.code === "REVISION_NOT_FOUND" ? 404 : 409 }); throw error; }
}
