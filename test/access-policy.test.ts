import assert from "node:assert/strict";
import test from "node:test";
import { effectiveAccess, isClockworkEmail, isSystemAccessManager, normalizeEmail } from "../lib/access-policy";
import { shouldCanonicalizeAuthHost } from "../lib/auth-origin";

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
  }
});

test("ordinary users retain their assigned role and disabled state", () => {
  const admin = effectiveAccess({ email: "admin@clockwork-av.com", role: "ADMIN" as const, active: true, accessManager: false });
  assert.deepEqual(admin, { email: "admin@clockwork-av.com", role: "ADMIN", active: true, accessManager: false });
  const disabled = effectiveAccess({ email: "employee@clockwork-av.com", role: "QUOTE_USER" as const, active: false, accessManager: false });
  assert.deepEqual(disabled, { email: "employee@clockwork-av.com", role: "QUOTE_USER", active: false, accessManager: false });
});

test("redirects the Render hostname to the canonical OAuth host only", () => {
  assert.equal(shouldCanonicalizeAuthHost("quote-os.onrender.com", "https://quotes.clockwork-av.com"), true);
  assert.equal(shouldCanonicalizeAuthHost("quotes.clockwork-av.com", "https://quotes.clockwork-av.com"), false);
  assert.equal(shouldCanonicalizeAuthHost("localhost", "http://localhost:3000"), false);
});
