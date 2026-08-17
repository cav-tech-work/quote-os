import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_DEV_USER_EMAIL, isDevAuthBypassEnabled, localDevUserState } from "../lib/dev-auth";
import { hasSystemAccessManagerAuthority, isSystemAccessManager } from "../lib/access-policy";
import { shouldCanonicalizeAuthHost } from "../lib/auth-origin";

test("development auth bypass requires the explicit flag outside production", () => {
  assert.equal(isDevAuthBypassEnabled({ NODE_ENV: "development", DEV_AUTH_BYPASS: "true" }), true);
  assert.equal(isDevAuthBypassEnabled({ NODE_ENV: "development", DEV_AUTH_BYPASS: undefined }), false);
  assert.equal(isDevAuthBypassEnabled({ NODE_ENV: "development", DEV_AUTH_BYPASS: "false" }), false);
  assert.equal(isDevAuthBypassEnabled({ NODE_ENV: "production", DEV_AUTH_BYPASS: "true" }), false);
});

test("local development identity has deterministic full application access", () => {
  assert.deepEqual(localDevUserState("dev-user-id"), {
    id: "dev-user-id",
    email: LOCAL_DEV_USER_EMAIL,
    name: "Local QuoteOS Developer",
    role: "ADMIN",
    active: true,
    accessManager: true,
  });
  assert.equal(isSystemAccessManager(LOCAL_DEV_USER_EMAIL), false);
  assert.equal(hasSystemAccessManagerAuthority(localDevUserState()), false);
});

test("localhost remains local while the Render hostname remains canonicalized", () => {
  assert.equal(shouldCanonicalizeAuthHost("localhost", "http://localhost:3000"), false);
  assert.equal(shouldCanonicalizeAuthHost("127.0.0.1", "http://localhost:3000"), false);
  assert.equal(shouldCanonicalizeAuthHost("quote-os.onrender.com", "https://quotes.clockwork-av.com"), true);
});
