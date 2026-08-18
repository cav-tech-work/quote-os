import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { businessReviewExport } from "@/lib/catalogue-business-review";
export async function GET() { const access = await requireRole("ADMIN"); if ("error" in access) return access.error; return NextResponse.json(await businessReviewExport(), { headers: { "Content-Disposition": "attachment; filename=quoteos-business-review.json" } }); }
