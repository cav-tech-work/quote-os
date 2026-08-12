import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { effectiveAccess, hasSystemAccessManagerAuthority, isSystemAccessManager, type AppRole } from "@/lib/access-policy";
import { getLocalDevUser, isLocalDevUser } from "@/lib/dev-auth";
import { prisma } from "@/lib/prisma";

export { type AppRole } from "@/lib/access-policy";

export async function getCurrentUser() {
  const localUser = await getLocalDevUser();
  if (localUser) return localUser;
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, email: true, name: true, role: true, active: true, accessManager: true } });
  if (!user) return null;
  const effective = effectiveAccess(user);
  if (isSystemAccessManager(user.email) && (user.role !== "ADMIN" || !user.active || !user.accessManager)) await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN", active: true, accessManager: true } });
  return effective;
}

export async function requireRole(...roles: AppRole[]) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) } as const;
  if (!user.active) return { error: NextResponse.json({ error: "Your QuoteOS access has been disabled" }, { status: 403 }) } as const;
  if (!roles.includes(user.role)) return { error: NextResponse.json({ error: "Insufficient permission" }, { status: 403 }) } as const;
  return { user } as const;
}

export async function requireAccessManager() {
  const access = await requireRole("ADMIN");
  if ("error" in access) return access;
  if (!isLocalDevUser(access.user) && !hasSystemAccessManagerAuthority(access.user)) return { error: NextResponse.json({ error: "System access-manager permission required" }, { status: 403 }) } as const;
  return access;
}
