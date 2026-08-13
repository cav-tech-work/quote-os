import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({ name: z.string().trim().min(2).optional(), description: z.string().trim().nullable().optional(), active: z.boolean().optional() }).refine((value) => Object.keys(value).length > 0);
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { const access = await requireRole("ADMIN"); if ("error" in access) return access.error; const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Only descriptive fields and active status can be edited; create a new policy version to change math." }, { status: 400 }); const { id } = await context.params; try { return NextResponse.json({ policy: await prisma.durationPolicy.update({ where: { id }, data: parsed.data }) }); } catch { return NextResponse.json({ error: "Policy not found." }, { status: 404 }); } }
