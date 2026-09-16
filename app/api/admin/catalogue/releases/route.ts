import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createCatalogueRelease } from "@/lib/catalogue-business-review";
import { prisma } from "@/lib/prisma";
const body = z.object({
  code: z.string().regex(/^CAV-CATALOGUE-[A-Z0-9_-]+$/),
  notes: z.string().optional(),
});
export async function GET() {
  const access = await requireRole("ADMIN");
  if ("error" in access) return access.error;
  return NextResponse.json({
    releases: await prisma.catalogueRelease.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { name: true, email: true } },
        approvedBy: { select: { name: true, email: true } },
        audits: true,
      },
    }),
  });
}
export async function POST(request: NextRequest) {
  const access = await requireRole("ADMIN");
  if ("error" in access) return access.error;
  const parsed = body.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  return NextResponse.json(
    await createCatalogueRelease(parsed.data, access.user.id),
    { status: 201 },
  );
}
