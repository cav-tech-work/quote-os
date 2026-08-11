# QuoteOS project state

Updated: 2026-08-07

## Production

- Repository: `https://github.com/varous/quote-os`
- Production branch: `main`
- Canonical application URL: `https://quotes.clockwork-av.com`
- Render service hostname: `https://quote-os.onrender.com` (redirected to the canonical URL)
- Runtime: Docker, Node.js 22, Next.js 15.5.22, PostgreSQL, Prisma 6.19.3.

## Authentication and authorization

- Auth.js / NextAuth v5 beta 32 with Google OAuth and Prisma adapter 2.11.3.
- Only verified Google identities with an exact `@clockwork-av.com` email can authenticate.
- New valid Workspace users are automatically provisioned as active `QUOTE_USER` accounts.
- Existing user roles and active state are preserved. Inactive users remain disabled after Google authentication.
- `sourav@clockwork-av.com` and `joyjeet@clockwork-av.com` are permanent system access managers and always reconcile to active `ADMIN` accounts.
- Only those system access managers can manage user roles/status through `/access`.
- Protected APIs use an authoritative PostgreSQL user lookup, so role/status changes revoke access even for old browser sessions.
- Google account linking remains enabled only for the Google provider to preserve historic manually provisioned user records.

## OAuth PKCE canonical-host repair

- `AUTH_URL` is `https://quotes.clockwork-av.com` in `render.yaml` and `.env.example`.
- `middleware.ts` derives the public request host from Render's forwarded-host header (falling back to `Host` and the request URL) and redirects `quote-os.onrender.com` to the canonical Clockwork URL before OAuth can begin.
- This keeps PKCE cookie creation and callback processing on the same hostname.
- No PKCE, state, nonce, cookie, or OAuth validation has been disabled or overridden.
- Production environment must retain one stable `AUTH_SECRET` and the Google redirect URI must be `https://quotes.clockwork-av.com/api/auth/callback/google`.
- Production authentication remains unvalidated until the post-deployment canonical-host and Google login smoke tests pass.

## Application features

- Shared quote builder with client/vendor prices and persisted drafts.
- Vendor price is the base price; client price is always 40% higher.
- Shared quote repository for active quote users/admins.
- Administrator-only inventory catalogue create/update/delete functions.
- System-access-manager-only user role and status management.
- Server-generated PDF export for saved quotes with repeatable Clockwork AV headers/footers.
- Imported rate catalogue is seeded idempotently from `prisma/cav-rates.mjs`.

## Verification

Latest checks passed:

```text
npm test
npm run typecheck
npm run build
```

Policy tests cover exact domain checks, founder privilege reconciliation, normal/disabled user preservation, and Render-host canonicalization.

## Operational notes

- Render automatically deploys `main`.
- `dev` exists as a future staging branch but production work is currently on `main`.
- Do not commit `AUTH_SECRET`, Google client secrets, or database URLs.
- Database migrations run with `prisma migrate deploy` at container startup; seeding is repeatable.
