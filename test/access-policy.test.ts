import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { effectiveAccess, hasSystemAccessManagerAuthority, isClockworkEmail, isSystemAccessManager, normalizeEmail } from "../lib/access-policy";
import { canonicalRedirectTarget, publicRequestHost, shouldCanonicalizeAuthHost } from "../lib/auth-origin";
import { middleware } from "../middleware";

test("normalizes and accepts exact Clockwork AV addresses", () => {
  assert.equal(normalizeEmail(" Sourav@Clockwork-AV.com "), "sourav@clockwork-av.com");
  assert.equal(isClockworkEmail("employee@clockwork-av.com"), true);
  assert.equal(isClockworkEmail("clockwork-av.com@example.com"), false);
  assert.equal(isClockworkEmail("person@gmail.com"), false);
});

test("founders always resolve to active system administrators", () => {
  for (const email of ["sourav@clockwork-av.com", "joyjeet@clockwork-av.com"]) {
    const effective = effectiveAccess({ email, role: "QUOTE_USER" as const, active: false, accessManager: false });
    assert.deepEqual(effective, { email, role: "ADMIN", active: true, accessManager: true });
    assert.equal(isSystemAccessManager(email), true);
    assert.equal(hasSystemAccessManagerAuthority(effective), true);
  }
});

test("ordinary users retain their assigned role and disabled state", () => {
  const admin = effectiveAccess({ email: "admin@clockwork-av.com", role: "ADMIN" as const, active: true, accessManager: false });
  assert.deepEqual(admin, { email: "admin@clockwork-av.com", role: "ADMIN", active: true, accessManager: false });
  const disabled = effectiveAccess({ email: "employee@clockwork-av.com", role: "QUOTE_USER" as const, active: false, accessManager: false });
  assert.deepEqual(disabled, { email: "employee@clockwork-av.com", role: "QUOTE_USER", active: false, accessManager: false });
});

test("database access-manager state cannot grant system-manager authority", () => {
  const corruptedAdmin = { email: "admin@clockwork-av.com", role: "ADMIN" as const, active: true, accessManager: true };
  assert.equal(hasSystemAccessManagerAuthority(corruptedAdmin), false);
});

test("redirects the public Render hostname to the canonical OAuth origin", () => {
  const requestHost = publicRequestHost("quote-os.onrender.com", "internal-service:3000", "quotes.clockwork-av.com");
  assert.equal(requestHost, "quote-os.onrender.com");
  assert.equal(shouldCanonicalizeAuthHost(requestHost, "https://quotes.clockwork-av.com"), true);
  assert.equal(canonicalRedirectTarget("/signin", "?returnTo=%2Fquotes", "https://quotes.clockwork-av.com").toString(), "https://quotes.clockwork-av.com/signin?returnTo=%2Fquotes");
});

test("does not redirect requests already using the canonical or local host", () => {
  assert.equal(publicRequestHost(null, "quotes.clockwork-av.com", "quote-os.onrender.com"), "quotes.clockwork-av.com");
  assert.equal(shouldCanonicalizeAuthHost("quotes.clockwork-av.com", "https://quotes.clockwork-av.com"), false);
  assert.equal(shouldCanonicalizeAuthHost("localhost", "http://localhost:3000"), false);
});

test("middleware preserves path and query while canonicalizing the forwarded Render host", () => {
  const request = new NextRequest("https://internal-service/signin?returnTo=%2Fquotes", { headers: { host: "internal-service:3000", "x-forwarded-host": "quote-os.onrender.com", "x-forwarded-proto": "https" } });
  const response = middleware(request);
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://quotes.clockwork-av.com/signin?returnTo=%2Fquotes");
});
