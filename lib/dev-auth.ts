import type { AppRole } from "@/lib/access-policy";
import { prisma } from "@/lib/prisma";

export const LOCAL_DEV_USER_EMAIL = "dev-local@quoteos.local";

export type LocalDevUser = {
  id: string;
  email: string;
  name: string | null;
  role: AppRole;
  active: boolean;
  accessManager: boolean;
};

type DevAuthEnvironment = { DEV_AUTH_BYPASS?: string; NODE_ENV?: string };

export function isDevAuthBypassEnabled(environment: DevAuthEnvironment = process.env) {
  return environment.NODE_ENV !== "production" && environment.DEV_AUTH_BYPASS === "true";
}

export function isLocalDevUser(user: Pick<LocalDevUser, "email">) {
  return isDevAuthBypassEnabled() && user.email === LOCAL_DEV_USER_EMAIL;
}

export function localDevUserState(id = "local-development-user"): LocalDevUser {
  return { id, email: LOCAL_DEV_USER_EMAIL, name: "Local QuoteOS Developer", role: "ADMIN", active: true, accessManager: true };
}

export async function getLocalDevUser() {
  if (!isDevAuthBypassEnabled()) return null;
  const expected = localDevUserState();
  return prisma.user.upsert({
    where: { email: LOCAL_DEV_USER_EMAIL },
    update: { name: expected.name, role: expected.role, active: expected.active, accessManager: expected.accessManager },
    create: { email: expected.email, name: expected.name, role: expected.role, active: expected.active, accessManager: expected.accessManager },
    select: { id: true, email: true, name: true, role: true, active: true, accessManager: true },
  });
}
