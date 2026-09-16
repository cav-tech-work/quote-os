import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { normalizeComponentText, searchSelectableComponents } from "@/lib/component-search";

export async function GET(request: NextRequest) {
  const access = await requireRole("ADMIN");
  if ("error" in access) return access.error;
  const search = normalizeComponentText(request.nextUrl.searchParams.get("search") ?? "");
  const kind = request.nextUrl.searchParams.get("kind") === "PACKAGE" ? "PACKAGE" : "ELEMENT";
  const includeCodes = request.nextUrl.searchParams.getAll("includeCode");
  const components = await searchSelectableComponents({ search, kind, includeCodes, limit: 100 });
  return NextResponse.json({ components });
}
