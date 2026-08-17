import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const marketSchema = z.object({ code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_-]+$/), cityName: z.string().trim().min(2).max(100), state: z.string().trim().max(100).nullable().optional(), country: z.string().trim().length(2).default("IN") });

export async function GET() {
  const access = await requireRole("ADMIN");
  if ("error" in access) return access.error;
  return NextResponse.json({ markets: await prisma.rateMarket.findMany({ orderBy: [{ active: "desc" }, { cityName: "asc" }] }) });
}

export async function POST(request: Request) {
  const access = await requireRole("ADMIN");
  if ("error" in access) return access.error;
  const parsed = marketSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid unique code, city, and two-letter country." }, { status: 400 });
  try {
    return NextResponse.json({ market: await prisma.rateMarket.create({ data: { ...parsed.data, code: parsed.data.code.toUpperCase(), country: parsed.data.country.toUpperCase(), state: parsed.data.state || null } }) }, { status: 201 });
  } catch { return NextResponse.json({ error: "That market code is already in use." }, { status: 409 }); }
}
