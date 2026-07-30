import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { findOrCreateCategory, inventoryInput } from "@/lib/inventory";
import { clientRateFromVendor } from "@/lib/pricing";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const access = await requireRole("ADMIN");
  if ("error" in access) return access.error;
  const parsed = inventoryInput.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await context.params; const input = parsed.data; const category = await findOrCreateCategory(input.category);
  try { return NextResponse.json(await prisma.catalogueItem.update({ where: { id }, data: { categoryId: category.id, name: input.item, manufacturer: input.brand || null, model: input.model || null, unit: input.unit, vendorRatePaise: input.vendorRatePaise, clientRatePaise: clientRateFromVendor(input.vendorRatePaise) } })); }
  catch { return NextResponse.json({ error: "Inventory item was not found" }, { status: 404 }); }
}

export async function DELETE(_: NextRequest, context: Context) {
  const access = await requireRole("ADMIN");
  if ("error" in access) return access.error;
  const { id } = await context.params;
  try { await prisma.catalogueItem.delete({ where: { id } }); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Inventory item was not found" }, { status: 404 }); }
}
