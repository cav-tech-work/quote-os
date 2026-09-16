import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { calculatePackage, listReadyPackages, PackageCalculationError } from "@/lib/package-engine";

const side = z.enum(["TO_CLIENT", "TO_VENDOR"]);
const preview = z.object({ packageTemplateId: z.string().cuid(), packageQuantity: z.string(), side, usageDays: z.string().optional(), expectedParentPriceId: z.string().optional() });

export async function GET(request: NextRequest) {
  const access = await requireRole("ADMIN", "QUOTE_USER");
  if ("error" in access) return access.error;
  const parsed = side.safeParse(request.nextUrl.searchParams.get("side") ?? "TO_CLIENT");
  if (!parsed.success) return NextResponse.json({ code: "PACKAGE_INPUT_INVALID", error: "Invalid rate side." }, { status: 400 });
  return NextResponse.json({ packages: await listReadyPackages(parsed.data, request.nextUrl.searchParams.get("search")?.trim() ?? "") });
}

export async function POST(request: NextRequest) {
  const access = await requireRole("ADMIN", "QUOTE_USER");
  if ("error" in access) return access.error;
  const parsed = preview.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ code: "PACKAGE_INPUT_INVALID", error: parsed.error.flatten() }, { status: 400 });
  try { return NextResponse.json({ calculation: await calculatePackage(parsed.data) }); }
  catch (error) { if (error instanceof PackageCalculationError) return NextResponse.json({ code: error.code, error: error.message, details: error.details }, { status: error.code === "PACKAGE_NOT_FOUND" ? 404 : 422 }); throw error; }
}
