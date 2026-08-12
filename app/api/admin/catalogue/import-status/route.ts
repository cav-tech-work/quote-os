import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const access = await requireRole("ADMIN");
  if ("error" in access) return access.error;
  const batch = await prisma.importBatch.findFirst({ orderBy: { createdAt: "desc" }, include: { rows: { where: { status: { in: ["WARNING", "ERROR", "SKIPPED"] } }, orderBy: [{ sheet: "asc" }, { rowNumber: "asc" }], take: 100 } } });
  return NextResponse.json({ batch });
}
