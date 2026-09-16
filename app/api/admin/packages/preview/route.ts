import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { PackageDefinitionError, previewPackageDefinition } from "@/lib/package-admin";

const component = z.object({ commercialOfferingId: z.string().cuid(), quantityRuleType: z.literal("FIXED_PER_PACKAGE"), quantityValue: z.string(), billingMode: z.enum(["BILLABLE", "INCLUDED"]), dutyUnitsPerPerson: z.string().optional(), sortOrder: z.number().int(), required: z.boolean().optional(), notes: z.string().optional() });
const definition = z.object({ code: z.string(), name: z.string().min(1), description: z.string().optional(), version: z.number().int().positive(), pricingMode: z.enum(["COMPONENT_SUM", "FIXED_PACKAGE"]), parentCommercialOfferingId: z.string().cuid().optional(), active: z.literal(false).optional(), components: z.array(component).min(1) });

export async function POST(request: NextRequest) {
  const access = await requireRole("ADMIN"); if ("error" in access) return access.error;
  const parsed = definition.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ code: "PACKAGE_DEFINITION_INVALID", error: parsed.error.flatten() }, { status: 400 });
  try { return NextResponse.json(await previewPackageDefinition(parsed.data)); }
  catch (error) { if (error instanceof PackageDefinitionError) return NextResponse.json({ code: error.code, error: error.message }, { status: 422 }); throw error; }
}
