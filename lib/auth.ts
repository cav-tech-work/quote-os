import { NextResponse } from "next/server";
import { auth } from "@/auth";

export type AppRole = "ADMIN" | "QUOTE_USER";

export async function requireRole(...roles: AppRole[]) {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) } as const;
  if (!session.user.active || !roles.includes(session.user.role)) return { error: NextResponse.json({ error: "Insufficient permission" }, { status: 403 }) } as const;
  return { session } as const;
}

export async function requireAccessManager() {
  const access = await requireRole("ADMIN");
  if ("error" in access) return access;
  if (!access.session.user.accessManager) return { error: NextResponse.json({ error: "Access-manager permission required" }, { status: 403 }) } as const;
  return access;
}
