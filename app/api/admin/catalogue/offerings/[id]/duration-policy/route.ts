import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { assignDurationPolicy, DurationPolicyInputError } from "@/lib/duration-policies";

const schema = z.object({ policyId: z.string().min(1).nullable(), reason: z.string() });
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) { const access = await requireRole("ADMIN"); if ("error" in access) return access.error; const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Invalid policy assignment." }, { status: 400 }); const { id } = await context.params; try { return NextResponse.json(await assignDurationPolicy({ actorId: access.user.id, offeringId: id, ...parsed.data })); } catch (error) { if (error instanceof DurationPolicyInputError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; } }
