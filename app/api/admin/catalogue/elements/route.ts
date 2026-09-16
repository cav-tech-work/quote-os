import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { CatalogueDomain, OfferingKind, QuantityBasis, UnitCode } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { createCatalogueElement, ElementInputError } from "@/lib/element-admin";

const bodySchema = z.object({
  name: z.string(),
  code: z.string(),
  kind: z.string().optional(),
  parentCode: z.string(),
  parentName: z.string(),
  parentCategory: z.string(),
  billingUnit: z.string(),
  measurement: z.string(),
  toClientRupees: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const access = await requireRole("ADMIN");
  if ("error" in access) return access.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "ELEMENT_INVALID", error: "Enter the element name, element code, parent details, billing unit and measurement." }, { status: 400 });

  try {
    const result = await createCatalogueElement({
      actorId: access.user.id,
      name: parsed.data.name,
      code: parsed.data.code,
      kind: parsed.data.kind as OfferingKind | undefined,
      parentCode: parsed.data.parentCode,
      parentName: parsed.data.parentName,
      parentCategory: parsed.data.parentCategory as CatalogueDomain,
      billingUnit: parsed.data.billingUnit as UnitCode,
      measurement: parsed.data.measurement as QuantityBasis,
      toClientRupees: parsed.data.toClientRupees ?? null,
    });
    return NextResponse.json({
      element: result.offering,
      parent: result.parent,
      parentCreated: result.parentCreated,
      toClientAmountPaise: result.toClientAmountPaise,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ElementInputError) return NextResponse.json({ code: "ELEMENT_INVALID", error: error.message }, { status: 400 });
    throw error;
  }
}
