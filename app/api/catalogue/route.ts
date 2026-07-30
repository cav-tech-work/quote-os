import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

const itemInput = z.object({ code: z.string().trim().min(2).max(32), name: z.string().trim().min(2), categoryId: z.string().cuid(), vendorRatePaise: z.number().int().nonnegative(), clientRatePaise: z.number().int().nonnegative(), unit: z.string().trim().min(1).default("Per Day"), discountEligible: z.boolean().default(true), description: z.string().trim().optional(), manufacturer: z.string().trim().optional(), model: z.string().trim().optional(), taxCategory: z.string().trim().optional() });

export async function GET(request: NextRequest) {
  const access = await requireRole("ADMIN", "QUOTE_USER");
  if ("error" in access) return access.error;
  const search = request.nextUrl.searchParams.get("search")?.trim();
  const items = await prisma.catalogueItem.findMany({ where: search ? { active: true, OR: [{ code: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }, { manufacturer: { contains: search, mode: "insensitive" } }, { model: { contains: search, mode: "insensitive" } }] } : { active: true }, include: { category: true }, orderBy: { name: "asc" }, take: 50 });
  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const access = await requireRole("ADMIN");
  if ("error" in access) return access.error;
  const parsed = itemInput.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try { return NextResponse.json(await prisma.catalogueItem.create({ data: parsed.data }), { status: 201 }); }
  catch { return NextResponse.json({ error: "Item code already exists or category is invalid" }, { status: 409 }); }
}
