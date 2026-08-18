import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import {
  BusinessReviewError,
  listBusinessReviewOfferings,
  recordBusinessReview,
} from "@/lib/catalogue-business-review";
const body = z.object({
  offeringId: z.string().cuid(),
  status: z
    .enum(["UNREVIEWED", "APPROVED", "CHANGE_REQUIRED", "DEFERRED", "REJECTED"])
    .optional(),
  reviewNote: z.string().optional(),
  requiredChanges: z.string().optional(),
  field: z
    .enum([
      "IDENTITY",
      "CATEGORY",
      "BILLING_UNIT",
      "QUANTITY_SEMANTICS",
      "DURATION_POLICY",
      "TO_CLIENT_RATE",
      "TO_VENDOR_RATE",
      "ACTIVE_INCLUSION",
      "PACKAGE_TREATMENT",
    ])
    .optional(),
  fieldStatus: z
    .enum(["UNREVIEWED", "APPROVED", "CHANGE_REQUIRED", "DEFERRED", "REJECTED"])
    .optional(),
  proposedValue: z.string().optional(),
  reason: z.string().min(1),
});
export async function GET() {
  const access = await requireRole("ADMIN");
  if ("error" in access) return access.error;
  return NextResponse.json({ offerings: await listBusinessReviewOfferings() });
}
export async function PATCH(request: NextRequest) {
  const access = await requireRole("ADMIN");
  if ("error" in access) return access.error;
  const parsed = body.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await recordBusinessReview(parsed.data, access.user.id),
    );
  } catch (error) {
    if (error instanceof BusinessReviewError)
      return NextResponse.json(
        { code: error.code, error: error.message, details: error.details },
        { status: 422 },
      );
    throw error;
  }
}
