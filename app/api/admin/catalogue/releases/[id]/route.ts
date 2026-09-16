import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { BusinessReviewError, transitionCatalogueRelease } from "@/lib/catalogue-business-review";
const body = z.object({ status: z.enum(["READY_FOR_APPROVAL","APPROVED","SUPERSEDED"]), reason: z.string().min(1) });
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) { const access = await requireRole("ADMIN"); if ("error" in access) return access.error; const parsed = body.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 }); try { return NextResponse.json(await transitionCatalogueRelease((await context.params).id, parsed.data.status, access.user.id, parsed.data.reason)); } catch (error) { if (error instanceof BusinessReviewError) return NextResponse.json({ code: error.code, error: error.message, details: error.details }, { status: 422 }); throw error; } }
