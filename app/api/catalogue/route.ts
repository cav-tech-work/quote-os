import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { findOrCreateCategory, inventoryInput } from "@/lib/inventory";

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
  const parsed = inventoryInput.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const category = await findOrCreateCategory(input.category);
  const code = `INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  return NextResponse.json(await prisma.catalogueItem.create({ data: { code, categoryId: category.id, name: input.item, manufacturer: input.brand || null, model: input.model || null, unit: input.unit, clientRatePaise: input.unitPricePaise, vendorRatePaise: input.unitPricePaise } }), { status: 201 });
}
