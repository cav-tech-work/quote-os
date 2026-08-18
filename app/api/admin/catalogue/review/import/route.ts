import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { BusinessReviewError, importBusinessReviews } from "@/lib/catalogue-business-review";
export async function POST(request: NextRequest) { const access = await requireRole("ADMIN"); if ("error" in access) return access.error; try { return NextResponse.json(await importBusinessReviews(await request.json(), access.user.id)); } catch (error) { if (error instanceof BusinessReviewError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.code === "STALE_REVIEW_IMPORT" ? 409 : 422 }); throw error; } }
