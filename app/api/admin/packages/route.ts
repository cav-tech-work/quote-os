import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createPackageVersion, PackageDefinitionError } from "@/lib/package-admin";
import { prisma } from "@/lib/prisma";

const component = z.object({ commercialOfferingId: z.string().cuid(), quantityRuleType: z.enum(["FIXED", "FIXED_PER_PACKAGE", "PARENT_QUANTITY_MULTIPLIER"]), quantityValue: z.string(), billingMode: z.enum(["BILLABLE", "INCLUDED"]), dutyUnitsPerPerson: z.string().optional(), sortOrder: z.number().int(), required: z.boolean().optional(), notes: z.string().optional() });
const definition = z.object({ code: z.string(), name: z.string().min(1), description: z.string().optional(), version: z.number().int().positive(), pricingMode: z.enum(["COMPONENT_SUM", "FIXED_PACKAGE", "HYBRID"]), parentCommercialOfferingId: z.string().cuid().optional(), active: z.boolean().optional(), components: z.array(component).min(1) });

export async function GET() {
  const access = await requireRole("ADMIN"); if ("error" in access) return access.error;
  return NextResponse.json({ packages: await prisma.packageTemplate.findMany({ orderBy: [{ code: "asc" }, { version: "desc" }], include: { parentCommercialOffering: true, components: { orderBy: { sortOrder: "asc" }, include: { commercialOffering: true } } } }) });
}
export async function POST(request: NextRequest) {
  const access = await requireRole("ADMIN"); if ("error" in access) return access.error;
  const parsed = definition.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ code: "PACKAGE_DEFINITION_INVALID", error: parsed.error.flatten() }, { status: 400 });
  try { return NextResponse.json(await createPackageVersion(parsed.data), { status: 201 }); }
  catch (error) { if (error instanceof PackageDefinitionError) return NextResponse.json({ code: error.code, error: error.message }, { status: 422 }); throw error; }
}
