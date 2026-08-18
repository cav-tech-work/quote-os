import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { PackageDefinitionError, setPackageActive } from "@/lib/package-admin";
const change = z.object({ active: z.boolean() });
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireRole("ADMIN"); if ("error" in access) return access.error;
  const parsed = change.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ code: "PACKAGE_DEFINITION_INVALID", error: parsed.error.flatten() }, { status: 400 });
  try { return NextResponse.json(await setPackageActive((await context.params).id, parsed.data.active)); }
  catch (error) { if (error instanceof PackageDefinitionError) return NextResponse.json({ code: error.code, error: error.message }, { status: 422 }); throw error; }
}
