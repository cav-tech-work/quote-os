export const CLOCKWORK_DOMAIN = "clockwork-av.com";
export const SYSTEM_ACCESS_MANAGER_EMAILS = new Set(["sourav@clockwork-av.com", "joyjeet@clockwork-av.com"]);

export type AppRole = "ADMIN" | "QUOTE_USER";
export type AccessState = { email: string; role: AppRole; active: boolean; accessManager: boolean };

export function normalizeEmail(email: string | null | undefined) { return email?.trim().toLowerCase() ?? ""; }
export function isClockworkEmail(email: string | null | undefined) {
  const normalized = normalizeEmail(email);
  return normalized.endsWith(`@${CLOCKWORK_DOMAIN}`) && normalized.split("@").length === 2;
}
export function isSystemAccessManager(email: string | null | undefined) { return SYSTEM_ACCESS_MANAGER_EMAILS.has(normalizeEmail(email)); }
export function hasSystemAccessManagerAuthority(user: AccessState) {
  return user.active && user.role === "ADMIN" && isSystemAccessManager(user.email);
}
export function effectiveAccess<T extends AccessState>(user: T): T {
  return isSystemAccessManager(user.email) ? { ...user, role: "ADMIN", active: true, accessManager: true } : user;
}
