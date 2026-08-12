# QuoteOS project state

Updated: 2026-08-12

## Production

- Repository: `https://github.com/cav-tech-work/quote-os`
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
- A legacy development catalogue can be loaded explicitly with `npm run db:seed`; it is never loaded during application startup and must not be used as a production import process.

## Catalogue redesign status

- Phase 0 adds an empty normalized catalogue schema alongside the operational legacy flat catalogue; no workbook data or historic quote data has been migrated.
- The normalized foundation separates canonical identity, commercial offerings, approved independent client/vendor prices, aliases, source mappings, city markets, historical rate observations, and import provenance.
- Current `/catalogue`, quote creation/search, quote history, pricing, and PDFs continue to use `CatalogueItem` unchanged. The legacy 40% client-price rule remains technical debt until an explicit cutover.
- The checked-in contract is [`docs/catalogue-domain.md`](docs/catalogue-domain.md).
- Phase 1 now provides `npm run catalogue:preview -- <workbook.xlsx>` plus `--json`/`--output`. The parser is pure and does not import Prisma or write `ImportBatch`, `ImportRow`, or normalized catalogue entities.
- `CAV_Rates_VC_Ops_Power_v120826.xlsx` is the sole active commercial-master authority for preview. Candidate global client/vendor rates come independently from `RateChart`; `LookUp` is normalization vocabulary. Venue-master and city/event workbooks cannot override active rates.
- The first real preview found unmapped source codes, two unknown raw `unit` values, tour-specific duration uncertainty, and conflicting aliases. These remain explicit review items.
- Phase 2 adds the version-controlled, SHA-bound `catalogue-import-decisions.json`, deterministic review generation, database-aware apply planning, and an explicit transactional `--apply` boundary. Unresolved candidates fail closed to `DEFER`.
- The disposable-database guarded real-master validation result is 113 canonical items, 197 distinct offerings, 1,094 non-conflicting aliases, 197 source mappings, 327 independent GLOBAL prices, one ImportBatch, and 452 provenance rows. Twenty-six source rows and 18 conflicting alias-target rows remain deferred; no human approvals or rejections were asserted.
- Entity type, offering kind, quantity basis, and duration basis may remain null when source evidence does not determine them. This prevents arbitrary calculation/business classifications while allowing approved identity and pricing data.
- The 1,608 city values remain inactive and produce no Price, RateMarket, or RateObservation rows. Legacy `/catalogue`, quotes, pricing, and PDFs still use `CatalogueItem` exclusively.
- The next major phase is **Normalized Catalogue + Rate Admin Dashboard**. It must manage `CommercialOffering × TO_CLIENT/TO_VENDOR × GLOBAL/CITY`, while V1 quote resolution remains GLOBAL-only and no quote/catalogue cutover occurs implicitly.

## Verification

GitHub Actions runs the following validation for pull requests into `main` and pushes to `dev-mac` or `main`:

```text
npm ci
npm test
npm run typecheck
npm run build
```

The workflow uses Node.js 22, matching the production Docker image, and does not receive production secrets or connect to PostgreSQL. Policy tests cover exact domain checks, founder privilege reconciliation, normal/disabled user preservation, Render-host canonicalization, and production startup safety.

## Operational notes

- Render automatically deploys `main`.
- `dev-mac` is the localhost development/staging branch. It uses isolated local PostgreSQL and may enable `DEV_AUTH_BYPASS=true`; there is no hosted staging service.
- The local bypass is effective only outside `NODE_ENV=production` and reconciles `dev-local@quoteos.local` as an active local administrator. It cannot grant production access or production system-manager authority.
- Do not commit `AUTH_SECRET`, Google client secrets, or database URLs.
- Production container startup runs `prisma migrate deploy` and then starts the application. Migration failure prevents startup. Catalogue seeding/import is never part of the production lifecycle.
