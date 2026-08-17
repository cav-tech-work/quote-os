import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listCatalogueOfferings, RateInputError } from "@/lib/catalogue-rates";

export async function GET(request: NextRequest) {
  const access = await requireRole("ADMIN");
  if ("error" in access) return access.error;
  const scopeType = request.nextUrl.searchParams.get("scope") === "CITY" ? "CITY" : "GLOBAL";
  const marketId = request.nextUrl.searchParams.get("marketId");
  try {
    return NextResponse.json({ offerings: await listCatalogueOfferings(scopeType, scopeType === "CITY" ? marketId : null) });
  } catch (error) {
    if (error instanceof RateInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
