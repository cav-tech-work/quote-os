import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createDurationPolicy, DurationPolicyInputError } from "@/lib/duration-policies";
import { prisma } from "@/lib/prisma";

const schema = z.object({ code: z.string(), name: z.string().trim().min(2), mode: z.enum(["ONE_OFF", "USAGE_DAYS", "CURVE", "MANUAL"]), chargeMultiplierNumerator: z.number().int(), chargeMultiplierDenominator: z.number().int(), minimumChargeNumerator: z.number().int(), minimumChargeDenominator: z.number().int(), roundingMode: z.enum(["NONE", "CEIL", "FLOOR", "HALF_UP"]), description: z.string().nullable().optional(), points: z.array(z.object({ usageDays: z.number().int(), chargeUnitsNumerator: z.number().int(), chargeUnitsDenominator: z.number().int() })).optional() });
export async function GET() { const access = await requireRole("ADMIN"); if ("error" in access) return access.error; return NextResponse.json({ policies: await prisma.durationPolicy.findMany({ orderBy: [{ active: "desc" }, { code: "asc" }], include: { points: { orderBy: { sortOrder: "asc" } }, _count: { select: { offerings: true } } } }) }); }
export async function POST(request: Request) { const access = await requireRole("ADMIN"); if ("error" in access) return access.error; const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Invalid duration policy." }, { status: 400 }); try { return NextResponse.json({ policy: await createDurationPolicy(parsed.data) }, { status: 201 }); } catch (error) { return NextResponse.json({ error: error instanceof DurationPolicyInputError ? error.message : "Policy code already exists." }, { status: 400 }); } }
