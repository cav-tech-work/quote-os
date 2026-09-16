import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createRevisionFromIssued, QuoteLifecycleError } from "@/lib/quote-lifecycle";

const schema = z.object({ sourceRevisionId: z.string().cuid() });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireRole("ADMIN", "QUOTE_USER"); if ("error" in access) return access.error;
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Invalid revision request." }, { status: 400 });
  const { id } = await params;
  try { const result = await createRevisionFromIssued(id, parsed.data.sourceRevisionId, access.user.id); return NextResponse.json(result, { status: result.idempotent ? 200 : 201 }); }
  catch (error) { if (error instanceof QuoteLifecycleError) return NextResponse.json({ code: error.code, error: error.message }, { status: 409 }); throw error; }
}
