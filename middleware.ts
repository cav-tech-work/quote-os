import { NextRequest, NextResponse } from "next/server";
import { CANONICAL_AUTH_ORIGIN, canonicalRedirectTarget, publicRequestHost, shouldCanonicalizeAuthHost } from "@/lib/auth-origin";

export function middleware(request: NextRequest) {
  const canonicalOrigin = process.env.AUTH_URL ?? CANONICAL_AUTH_ORIGIN;
  const requestHost = publicRequestHost(request.headers.get("x-forwarded-host"), request.headers.get("host"), request.nextUrl.hostname);
  if (!shouldCanonicalizeAuthHost(requestHost, canonicalOrigin)) return NextResponse.next();
  return NextResponse.redirect(canonicalRedirectTarget(request.nextUrl.pathname, request.nextUrl.search, canonicalOrigin), 308);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
