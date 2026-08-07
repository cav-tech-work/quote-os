import { NextResponse } from "next/server";
import { requireAccessManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const access = await requireAccessManager();
  if ("error" in access) return access.error;
  return NextResponse.json(await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, active: true, accessManager: true, createdAt: true }, orderBy: { email: "asc" } }));
}
