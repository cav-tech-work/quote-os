import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAccessManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const grantInput = z.object({ email: z.string().email().transform((value) => value.toLowerCase()), role: z.enum(["ADMIN", "QUOTE_USER"]), active: z.boolean().default(true) });

export async function GET() {
  const access = await requireAccessManager();
  if ("error" in access) return access.error;
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, active: true, accessManager: true, createdAt: true }, orderBy: { email: "asc" } });
  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const access = await requireAccessManager();
  if ("error" in access) return access.error;
  const parsed = grantInput.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { email, role, active } = parsed.data;
  if (["sourav@clockwork-av.com", "joyjeet@clockwork-av.com"].includes(email)) return NextResponse.json({ error: "Bootstrap access-manager accounts cannot be changed here" }, { status: 400 });
  const user = await prisma.user.upsert({ where: { email }, update: { role, active }, create: { email, role, active } });
  return NextResponse.json(user, { status: 201 });
}
