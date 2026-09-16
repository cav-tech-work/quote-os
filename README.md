# QuoteOS

QuoteOS is Clockwork AV's internal quotation application. It uses Next.js, PostgreSQL, Prisma, Auth.js, and Google Workspace authentication.

## Catalogue transition

QuoteOS retains the legacy flat catalogue for historical quote compatibility alongside the populated normalized catalogue. New quotes use ready ordinary or explicitly approved personnel commercial offerings and immutable commercial snapshots. Active administrators manage normalized offerings and independent GLOBAL or CITY client/vendor rates at `/admin/catalogue`; quote creation resolves GLOBAL only. The domain contract is in [`docs/catalogue-domain.md`](docs/catalogue-domain.md).

Phase 7.5 independently reviews all 39 ambiguous `nos/duty` rows: raw units are evidence, not personnel semantics. See [`docs/phase-7-5-nos-duty-review.md`](docs/phase-7-5-nos-duty-review.md). Use `npm run catalogue:nos-duty-apply -- --decisions catalogue-nos-duty-decisions.json --actor-email <admin>` for dry-run and add `--apply` for the guarded transaction.

Phase 7.6 explicitly assigns the existing FULL_USE_DAYS policy to 17 reviewed reusable OPS, security, sanitation, and facility equipment offerings. See [`docs/phase-7-6-full-use-review.md`](docs/phase-7-6-full-use-review.md). Apply uses the existing `catalogue:semantic-apply` dry-run/`--apply` workflow with `catalogue-full-use-decisions.json`.

Phase 8 makes QuoteRevision the commercial-history boundary and GeneratedDocument the retained issued-document boundary. Drafts can be previewed and server-recalculated; issue atomically retains an immutable, SHA-256-addressed PDF in PostgreSQL; later changes clone into a new monotonically numbered draft without implicit repricing. See [`docs/phase-8-revision-documents.md`](docs/phase-8-revision-documents.md).

Phase 9 audits the remaining 17 service, transport, consumption, cabling, facility and composite rows. None has sufficient quantity plus rate-unit evidence for safe approval, so all remain explicitly deferred through the guarded workflow; no pricing family or billing unit was invented. See [`docs/phase-9-specialized-contract-review.md`](docs/phase-9-specialized-contract-review.md).

Phase 10 adds version-safe package recipes with bounded quantities, explicit included/billable components, component-sum and fixed-package pricing, per-side readiness, immutable component snapshots, builder/admin surfaces, and Phase 8 revision/PDF integration. No real composite was promoted because authoritative composition and rate-unit evidence remains incomplete; controlled fixtures are test-only. See [`docs/phase-10-package-recipe-engine.md`](docs/phase-10-package-recipe-engine.md).

Phase 11 adds an ADMIN-only business catalogue review boundary and deterministic immutable release candidates. Field decisions identify approval/change/defer/reject requirements without mutating audited master data. Releases contain only explicitly approved, provenance-backed subsets and are future bootstrap inputs—not deployments. See [`docs/phase-11-business-catalogue-review.md`](docs/phase-11-business-catalogue-review.md).

Phase 12A's CCI component-label reconciliation queue has been removed. The bounded package recipe builder remains available at `/admin/packages`. It imports no prices, never creates packages automatically, and stays local-development only.

The authoritative master can be inspected without database writes:

```text
npm run catalogue:preview -- /absolute/path/to/CAV_Rates_VC_Ops_Power_v120826.xlsx
npm run catalogue:preview -- /absolute/path/to/CAV_Rates_VC_Ops_Power_v120826.xlsx --json
```

Add `--output preview.json` for deterministic machine-readable output. Only that workbook's `RateChart.ToClients` and `RateChart.ToVendors` are active-price candidates; `LookUp` is normalization vocabulary, venue-master data is operational evidence, and city/event files are historical evidence. Preview never populates normalized tables. Known warnings include unmapped source codes, two raw `unit` values, uncertain tour-specific duration semantics, and aliases shared across incompatible canonical targets.

Generate or update the hash-bound review decisions, inspect a database-aware dry-run, and apply only with the explicit flag:

```text
npm run catalogue:review -- /absolute/path/to/CAV_Rates_VC_Ops_Power_v120826.xlsx
npm run catalogue:apply -- /absolute/path/to/CAV_Rates_VC_Ops_Power_v120826.xlsx --decisions ./catalogue-import-decisions.json
npm run catalogue:apply -- /absolute/path/to/CAV_Rates_VC_Ops_Power_v120826.xlsx --decisions ./catalogue-import-decisions.json --apply
```

The review file defaults every unresolved mapping, unknown unit, and alias conflict to `DEFER`. Apply verifies the exact workbook/review hashes and commits approved canonicals, offerings, aliases, global prices, mappings, and provenance atomically. Repeating the same reviewed apply is a no-op, including after an administrator changes a rate. Legacy catalogue data remains isolated for historical compatibility; all 1,608 workbook city values remain historical evidence.

## Catalogue and rate administration

Active `ADMIN` users can open `/admin/catalogue` to filter the normalized catalogue, distinguish explicit zero from unavailable prices, change or clear either rate side independently, inspect history and import issues, and maintain city markets. Every change requires a reason, preserves imported provenance, closes the previous price rather than overwriting it, and creates an actor-linked audit event. Stale edits return a conflict and must be retried after refresh. Inactive markets retain history but reject new rates. Quote users cannot access these routes or see their navigation.

## Headless normalized calculation core

Phase 4 adds reusable pure measurement and quantity calculation under `lib/catalogue-calculation`, plus a server-side current GLOBAL rate resolver and pricing orchestrator. Decimal inputs are strings parsed into reduced `BigInt` rational values. Quantities stay exact internally, are rendered to 12 decimal places using half-up rounding, and are multiplied by integer-paise rates before one final half-up money rounding. Supported quantity bases are `COUNT`, `AREA_LW`, `AREA_LH`, `LINEAR`, `VOLUME`, and `FIXED`; whole units are required for COUNT/FIXED. `HEADCOUNT_DUTY`, `GENERATOR`, `MANUAL`, missing semantics, missing configuration, and incompatible units return typed domain states.

The resolver reads only active/effective normalized GLOBAL `Price` rows. Client and vendor sides never fall back to one another, CITY, legacy rates, workbook values, or markup rules.

Phase 5.5 supports version-safe `ONE_OFF`, rational `USAGE_DAYS`, exact point-based `CURVE`, and caller-supplied `MANUAL` duration policies. Curves require an exact positive whole-day point and never interpolate or extrapolate. An explicit headless charge-unit override wins over policy resolution and records its provenance. Policy authority is explicit, and only active `INTERNAL_APPROVED` policies may be assigned; domain and imported `durationBasis` never select arithmetic.

The reviewed semantic decision set is fingerprint-bound and guarded:

```text
npm run catalogue:semantic-review -- --json
npm run catalogue:semantic-apply -- --decisions ./catalogue-semantic-decisions.json
npm run catalogue:semantic-apply -- --decisions ./catalogue-semantic-decisions.json --actor-email admin@example.com --apply
```

Apply is dry-run unless `--apply` is present, is transactional and audited, rejects stale review state, and treats an identical reapply as a no-op. Workbook `Days Applies? = N` is one-off evidence; `Y` only means duration matters and never establishes a multiplier.

Phase 5.6 applies the explicitly approved CAV `HALF_USE_DAYS_MIN_1` default only to individually reviewed ordinary reusable VC elements. The semantic inventory uses source descriptions, normalized identity, quantity semantics, rate availability, exception classification, and explicit evidence. Vanity, OPS, security, personnel, headcount-duty, generator/fuel, package, and ambiguous work remain deferred. There is no runtime VC/CCTV/OPS policy branch.

## Normalized ordinary quote builder

Phase 6 changes new-quote selection to `CommercialOffering` while retaining legacy quote rows and APIs for history compatibility. Search returns only active ordinary offerings with supported quantity semantics, an active `INTERNAL_APPROVED` non-manual duration policy, and exactly one current GLOBAL rate for the selected side. The server repeats every readiness and calculation check inside the quote transaction.

Phase 7 adds an independently approved `HEADCOUNT_DUTY` personnel family. Personnel is priced as explicit whole-number headcount × explicit positive duties/person × the selected side's current GLOBAL rate per duty. Event days and ordinary duration policies never multiply personnel amounts. Approval is guarded by `catalogue-personnel-decisions.json` and `npm run catalogue:personnel-apply`; equipment and composite services that inherited the source `nos/duty` unit remain unavailable. Personnel and ordinary lines coexist in the same immutable normalized revision and PDF.

Each normalized `QuoteLine` copies offering/canonical identity, original and normalized configuration, exact billable-quantity numerator/denominator, Price ID and unit rate, GLOBAL scope, policy identity/mode/definition, usage days, override provenance, charge units, base/final amounts, and explicit engine/snapshot versions. Readback, totals, and PDFs use this immutable snapshot rather than live catalogue data. `eventDays` defaults line usage duration; a line may override usage days. Charge-unit override and reason are supported by the typed API/snapshot contract but intentionally remain absent from the initial UI.

Legacy catalogue items are not automatically mapped or used as fallback. Historical legacy lines continue to render from their existing snapshots. CITY, opposite-side, external-reference, historical workbook, and legacy 40% fallback pricing are excluded from normalized creation.

## External market reference data

`npm run reference:crawl:brandprofesor` captures the public Brand Profesor product catalogue, variation prices, categories, quantity constraints, and published refund/privacy/terms pages into `reference-data/brandprofesor`. It checks `robots.txt`, uses public WordPress/WooCommerce APIs, throttles requests, and records provenance and hashes. This snapshot is external research only: it has no Prisma, normalized import, price resolver, admin, or quotation connection and must never be treated as an approved Clockwork AV rate automatically.

## Local setup

Requirements: Node.js 22+, npm, and PostgreSQL.

1. Check out `dev-mac` and install dependencies with `npm ci`.
2. Create an isolated local PostgreSQL database such as `quoteos_dev`. Never use the Render production database URL for local development.
3. Copy `.env.example` to `.env`, replace the local database credentials, and generate a local `AUTH_SECRET`. Keep `AUTH_URL=http://localhost:3000` and explicitly set `DEV_AUTH_BYPASS=true`. Do not commit `.env`.
4. Apply committed migrations with `npx prisma migrate deploy`.
5. For a new disposable local database only, optionally load the legacy development catalogue with `npm run db:seed`.
6. Start development with `npm run dev`, then open `http://localhost:3000`.

Neither `npm run dev` nor production container startup seeds catalogue data. Seeding is always an explicit operator action. The current seed contains legacy rates and the obsolete 40% client-rate rule; do not run it against production.

The local auth bypass works only when `DEV_AUTH_BYPASS=true` and `NODE_ENV` is not `production`. It reconciles `dev-local@quoteos.local` as an active local administrator so quotes have a valid owner and all current admin screens can be developed without Google OAuth. Production ignores the bypass flag even if it is configured accidentally; Google Workspace authentication and the two permanent production system-manager identities remain unchanged.

## Validation

Run:

```text
npm test
npm run typecheck
npm run build
```

Production containers apply committed migrations before starting the application. Catalogue imports remain separate controlled operations. Specialized personnel, generator/fuel, and package pricing remain outside the ordinary builder.

## Continuous integration

GitHub Actions validates pull requests into `main` and pushes to `dev-mac` or `main` with `npm ci`, tests, typechecking, and a production build. CI uses no production database or OAuth secrets. Repository branch protection must be configured separately in GitHub settings before this check can be required for merges.
