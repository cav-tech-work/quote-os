import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAccessManager } from "@/lib/auth";
import { isSystemAccessManager } from "@/lib/access-policy";
import { prisma } from "@/lib/prisma";

const updateInput = z.object({ role: z.enum(["ADMIN", "QUOTE_USER"]).optional(), active: z.boolean().optional() }).refine((value) => value.role !== undefined || value.active !== undefined, "Choose a role or status change");

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireAccessManager();
  if ("error" in access) return access.error;
  const parsed = updateInput.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id }, select: { email: true } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (isSystemAccessManager(target.email)) return NextResponse.json({ error: "System access-manager accounts cannot be changed" }, { status: 403 });
  return NextResponse.json(await prisma.user.update({ where: { id }, data: parsed.data, select: { id: true, name: true, email: true, role: true, active: true, accessManager: true } }));
}
