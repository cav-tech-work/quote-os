# QuoteOS project state

Updated: 2026-08-18

## Phase 10 package/recipe engine

- `PackageTemplate` and ordered `PackageComponent` recipes are first-class, version-keyed and internally authorized. Admin creates versions or toggles activity; in-place commercial recipe editing is not exposed.
- Exact bounded `FIXED`, `FIXED_PER_PACKAGE` and `PARENT_QUANTITY_MULTIPLIER` rules feed existing ordinary/personnel calculators. `BILLABLE` versus `INCLUDED` prevents double charging.
- `COMPONENT_SUM` and `FIXED_PACKAGE` run in V1. `HYBRID` is schema-visible but runtime-deferred. Nested packages and expression rules fail closed.
- A package persists as one amount-bearing QuoteLine plus immutable component snapshots. Draft creation, issue, retained PDF retrieval and revision cloning preserve composition and provenance.
- Production-data readiness remains TO_CLIENT 0 / TO_VENDOR 0 because no package data was populated. Medical/security composites remain deferred; controlled fixtures exist only in tests.
- Production/startup policy, Phase 9 decisions, Brand Profesor, generators, attributes and variants are unchanged.

## Phase 9 specialized contract review

- The unresolved population exactly matches the expected 17 rows. Workbook identity, Days Applies, formulas, notes, source mappings, normalized state and both GLOBAL rate sides were audited individually.
- All 17 are explicitly DEFERRED because billable unit or duration remains ambiguous; 12 also have no GLOBAL rate. The five priced rows do not establish per-meal, per-trip, per-vehicle, per-team or per-package unit meaning.
- No new PricingFamily, UnitCode, calculation, duration assignment or readiness was added. Coverage remains 164 TO_CLIENT and 153 TO_VENDOR combined.
- Guarded apply now supports reviewed pricing-family and billing-unit fields, but Phase 9 applied zero field changes. Production population, startup policy, Phase 8, Brand Profesor and generator/package boundaries are unchanged.

## Phase 8 revision lifecycle and retained documents

- QuoteRevision now has explicit DRAFT, ISSUED and SUPERSEDED states, one active draft per quote, creator/issuer identity, issued time, and revision-scoped PDF-visible metadata.
- PostgreSQL counters allocate concurrency-safe quote numbers; advisory locks plus unique constraints serialize next-revision creation and issue.
- Cloning preserves snapshots without repricing. Server-authoritative line edits recalculate only changed cloned lines; issued revisions reject mutation with `REVISION_IMMUTABLE`.
- The canonical issued PDF is retained in PostgreSQL with SHA-256, bytes, size, MIME type, filename, document type/version, template version and generator. Retrieval verifies and serves the retained bytes rather than rendering again.
- Dynamic draft preview and legacy-regeneratable output are explicitly distinguished from retained issued artifacts. QuoteEvent records clone, issue, supersession and document retention.

## Phase 7.6 full-use duration approval

- The exact 17 Phase 7.5 ordinary COUNT rows blocked only by duration were reconciled and individually approved for the existing FULL_USE_DAYS policy.
- Readiness is now 141 ordinary + 23 personnel (164) TO_CLIENT and 131 ordinary + 22 personnel (153) TO_VENDOR. Five facility rows remain rate-blocked on both sides; SEC_PLUGPOIN remains vendor-rate-blocked.
- Runtime behavior remains assignment-driven: four usage days resolve to two HALF_USE, four FULL_USE, one ONE_OFF, and no duration charge units for HEADCOUNT_DUTY.
- The 17 service/transport/consumption/composite deferrals remain excluded. No domain branch, specialized engine, schema change, or external reference integration was introduced.

## Phase 7.5 nos/duty semantic cleanup

- All 39 unresolved `nos/duty` rows have explicit, source-bound decisions; the source unit is no longer treated as personnel proof.
- Twenty-two countable equipment/item rows are normalized to `ORDINARY` + `COUNT` + `NOS`. Five are ready through retained ONE_OFF evidence, 17 remain duration-blocked, and 17 remain semantically deferred.
- Selectable coverage is now 129 ordinary + 23 personnel (152) TO_CLIENT and 120 ordinary + 22 personnel (142) TO_VENDOR. The 24 approved personnel master classifications remain unchanged.
- The apply is fingerprint-bound, authority-checked, transactional, idempotent, and field-audited. OPS/security duration, composites, packages, and generators remain deferred.

## Phase 7 normalized ordinary + personnel quote builder

- Normalized quote search combines 124/118 ordinary TO_CLIENT/TO_VENDOR offerings with 23/22 independently approved personnel offerings, for 147/140 selectable totals.
- Ordinary configuration follows its normalized quantity basis; personnel uses explicit headcount and duties/person. `eventDays` defaults ordinary line `usageDays` but never determines personnel duties.
- New `QuoteLine` normalized fields snapshot identity, configuration, exact quantity, GLOBAL Price provenance, duration policy definition, override provenance, amounts, and bounded version identifiers. Existing legacy snapshots are unchanged.
- Server persistence recalculates inside a serializable transaction, rejects unready/specialized offerings and stale Price IDs, and has no CITY/opposite-side/legacy/external fallback.
- Quote totals, readback, and PDFs use persisted snapshots. Tests prove historical values survive master rate/policy/name changes while subsequent quotes use the new master state.
- Charge-unit override plus reason is supported by API and snapshot persistence; initial UI exposure is deferred.
- Full revision editing/document retention, generators/fuel, packages, and unresolved OPS equipment/composite semantics remain deferred.

## External market reference snapshot

- A reproducible, robots-aware collector captures public Brand Profesor product/category/variation pricing and published commercial policy pages under `reference-data/brandprofesor`.
- The snapshot is explicitly `EXTERNAL_MARKET_REFERENCE`, carries source URLs, capture time and hashes, and has no Prisma or active QuoteOS pricing/import integration.
- External prices and policy wording remain time-sensitive observations requiring human review; zero-listed or ranged products must not be interpreted as approved or directly comparable rates.

## Phase 5 configurable duration policies

- Added first-class `DurationPolicy` (`ONE_OFF`, `USAGE_DAYS`, `MANUAL`) with rational multiplier/minimum and bounded rounding, plus nullable offering assignment.
- Runtime pricing now uses assigned policy data—not domain or imported `durationBasis`—to resolve exact charge units and final integer-paise amounts.
- Policy calculation fields are immutable after creation. New math requires a new policy and audited reassignment; descriptive fields/status remain safely editable.
- The migration explicitly bootstraps `ONE_OFF`, `FULL_USE_DAYS`, `HALF_USE_DAYS_MIN_1`, and `MANUAL` but assigns no offerings automatically.
- Real source evidence contains 203 Y / 20 N rows overall; among applied offerings, 180 are Y and 17 are N. N offerings are safe one-off review candidates; Y offerings remain mathematically unassigned.
- Catalogue & Rates now filters assigned/unassigned offerings, manages policies, assigns policies with a reason, and exposes source duration classification.
- The engine remains headless. Specialized DUTY/generator behavior and quote-model cutover remain deferred.
- Recommended Phase 6: Normalized Quote-Line Snapshot + Ordinary Item Quote Builder Cutover.

## Phase 4 measurement and deterministic pricing core

- `lib/catalogue-calculation` separates pure exact rational arithmetic/unit conversion, pure quantity calculation, normalized GLOBAL database rate lookup, and orchestration.
- Implemented `COUNT`, `AREA_LW`, `AREA_LH`, `LINEAR`, `VOLUME`, and `FIXED`; missing/unsupported semantics and incomplete configurations return typed outcomes.
- Quantity stays rational internally, snapshot/display quantity rounds half-up at 12 decimal places, and integer-paise money rounds half-up once after exact multiplication.
- Current GLOBAL client/vendor rates resolve independently. Explicit zero is valid; missing, conflicting, CITY, opposite-side, legacy, and derived fallback rates are never substituted.
- Charge-day offerings return `NEEDS_PRICING_SCHEDULE` and a per-charge-period base amount. No duration schedule was implemented.
- Real-data coverage: 197/197 known billing units, 177/197 known quantity bases, and 197/197 known duration bases. Of 63 mechanically normalized `HEADCOUNT_DUTY` rows, 24 evidence-clear people offerings have audited personnel approval; 39 equipment/composite/uncertain rows continue to fail closed.
- Phase 4 is headless. The quote workspace, legacy catalogue/pricing, quote persistence, and PDFs remain unchanged.
- Recommended Phase 5: Quote Pricing Schedule + Charge-Day Resolution.

## Phase 3 normalized catalogue and rate administration

- `/admin/catalogue` is the permanent active-ADMIN surface for one-row-per-`CommercialOffering` inspection, filtering, independent client/vendor rate edits, explicit zero/unavailable states, history, latest import issues, and market maintenance.
- `lib/catalogue-rates.ts` centralizes exact rupee parsing, append-only price versioning, required reasons, actor audit, inactive-market rejection, and optimistic concurrency.
- PostgreSQL partial unique indexes enforce one active price per offering/side/GLOBAL and offering/side/CITY market, including correct NULL handling.
- Quote users and inactive accounts are forbidden. Catalogue administrators do not gain `/access`; that remains restricted to system access managers.
- The legacy `/catalogue`, quote builder, quote APIs, PDFs, snapshots, and 40% legacy behavior are unchanged. CITY rates are configurable but are not quote inputs.
- Phase 4 subsequently delivered the headless Measurement + Deterministic Pricing Core described above.

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

- Normalized ordinary quote builder with independent approved client/vendor GLOBAL prices and persisted immutable revision snapshots.
- Legacy 40%-derived prices remain only in the isolated legacy catalogue compatibility path.
- Shared quote repository for active quote users/admins.
- Administrator-only inventory catalogue create/update/delete functions.
- System-access-manager-only user role and status management.
- Server-generated PDF export for saved quotes with repeatable Clockwork AV headers/footers.
- A legacy development catalogue can be loaded explicitly with `npm run db:seed`; it is never loaded during application startup and must not be used as a production import process.

## Catalogue redesign status

- Phase 0 adds an empty normalized catalogue schema alongside the operational legacy flat catalogue; no workbook data or historic quote data has been migrated.
- The normalized foundation separates canonical identity, commercial offerings, approved independent client/vendor prices, aliases, source mappings, city markets, historical rate observations, and import provenance.
- `/catalogue` remains the legacy inventory administration surface, while new ordinary quote creation uses normalized offerings. Quote history and PDFs render both snapshot forms without recalculation.
- The checked-in contract is [`docs/catalogue-domain.md`](docs/catalogue-domain.md).
- Phase 1 now provides `npm run catalogue:preview -- <workbook.xlsx>` plus `--json`/`--output`. The parser is pure and does not import Prisma or write `ImportBatch`, `ImportRow`, or normalized catalogue entities.
- `CAV_Rates_VC_Ops_Power_v120826.xlsx` is the sole active commercial-master authority for preview. Candidate global client/vendor rates come independently from `RateChart`; `LookUp` is normalization vocabulary. Venue-master and city/event workbooks cannot override active rates.
- The first real preview found unmapped source codes, two unknown raw `unit` values, tour-specific duration uncertainty, and conflicting aliases. These remain explicit review items.
- Phase 2 adds the version-controlled, SHA-bound `catalogue-import-decisions.json`, deterministic review generation, database-aware apply planning, and an explicit transactional `--apply` boundary. Unresolved candidates fail closed to `DEFER`.
- The disposable-database guarded real-master validation result is 113 canonical items, 197 distinct offerings, 1,094 non-conflicting aliases, 197 source mappings, 327 independent GLOBAL prices, one ImportBatch, and 452 provenance rows. Twenty-six source rows and 18 conflicting alias-target rows remain deferred; no human approvals or rejections were asserted.
- Entity type, offering kind, quantity basis, and duration basis may remain null when source evidence does not determine them. This prevents arbitrary calculation/business classifications while allowing approved identity and pricing data.
- The 1,608 city values remain inactive and produce no Price, RateMarket, or RateObservation rows. Legacy `/catalogue`, quotes, pricing, and PDFs still use `CatalogueItem` exclusively.
- Phase 3 delivered normalized rate administration, Phases 4-5.6 delivered exact calculation and reviewed duration coverage, Phase 6 delivered the ordinary builder cutover, and Phase 7 adds explicit personnel-duty pricing while retaining legacy history.

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
