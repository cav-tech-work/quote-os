import { NextRequest, NextResponse } from "next/server";
import { CANONICAL_AUTH_ORIGIN, shouldCanonicalizeAuthHost } from "@/lib/auth-origin";

export function middleware(request: NextRequest) {
  const canonicalOrigin = process.env.AUTH_URL ?? CANONICAL_AUTH_ORIGIN;
  if (!shouldCanonicalizeAuthHost(request.nextUrl.hostname, canonicalOrigin)) return NextResponse.next();
  const canonical = new URL(canonicalOrigin);
  canonical.pathname = request.nextUrl.pathname;
  canonical.search = request.nextUrl.search;
  return NextResponse.redirect(canonical, 308);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
