import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({ cityName: z.string().trim().min(2).max(100).optional(), state: z.string().trim().max(100).nullable().optional(), country: z.string().trim().length(2).optional(), active: z.boolean().optional() }).refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireRole("ADMIN");
  if ("error" in access) return access.error;
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid market update." }, { status: 400 });
  const { id } = await context.params;
  try {
    return NextResponse.json({ market: await prisma.rateMarket.update({ where: { id }, data: { ...parsed.data, country: parsed.data.country?.toUpperCase(), state: parsed.data.state || null } }) });
  } catch { return NextResponse.json({ error: "Rate market not found." }, { status: 404 }); }
}
