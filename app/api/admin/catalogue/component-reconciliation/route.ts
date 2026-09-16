import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { decideCciReconciliation, listCciReconciliation } from "@/lib/component-reconciliation/database";

const decision = z.object({ id: z.string().cuid(), offeringId: z.string().cuid().nullable(), status: z.enum(["CONFIRMED", "DEFERRED"]) });

export async function GET() {
  const access = await requireRole("ADMIN"); if ("error" in access) return access.error;
  return NextResponse.json({ mappings: await listCciReconciliation() });
}

export async function PATCH(request: NextRequest) {
  const access = await requireRole("ADMIN"); if ("error" in access) return access.error;
  const parsed = decision.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try { return NextResponse.json(await decideCciReconciliation(parsed.data)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save component decision." }, { status: 422 }); }
}
