import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export type AppRole = "ADMIN" | "QUOTE_USER";
export type Session = { email: string; role: AppRole };

const COOKIE = "quoteos_session";
const secret = () => process.env.AUTH_SECRET ?? "development-only-change-me";

function sign(value: string) { return createHmac("sha256", secret()).update(value).digest("base64url"); }

export function createSessionToken(session: Session) {
  const payload = Buffer.from(JSON.stringify({ ...session, expiresAt: Date.now() + 1000 * 60 * 60 * 12 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decode(token?: string): Session | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session & { expiresAt: number };
    return data.expiresAt > Date.now() && (data.role === "ADMIN" || data.role === "QUOTE_USER") ? { email: data.email, role: data.role } : null;
  } catch { return null; }
}

export async function getSession() { return decode((await cookies()).get(COOKIE)?.value); }

export async function requireRole(...roles: AppRole[]) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) } as const;
  if (!roles.includes(session.role)) return { error: NextResponse.json({ error: "Insufficient permission" }, { status: 403 }) } as const;
  return { session } as const;
}

export function setSession(response: NextResponse, session: Session) {
  response.cookies.set(COOKIE, createSessionToken(session), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
}

export function clearSession(response: NextResponse) { response.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 }); }
