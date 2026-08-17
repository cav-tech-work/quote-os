import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { catalogueRateHistory } from "@/lib/catalogue-rates";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireRole("ADMIN");
  if ("error" in access) return access.error;
  const { id } = await context.params;
  return NextResponse.json(await catalogueRateHistory(id));
}
