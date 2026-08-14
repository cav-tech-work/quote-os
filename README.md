# QuoteOS

QuoteOS is Clockwork AV's internal quotation application. It uses Next.js, PostgreSQL, Prisma, Auth.js, and Google Workspace authentication.

## Catalogue transition

QuoteOS contains the legacy flat catalogue used by all quote flows alongside the populated normalized catalogue. Active administrators manage normalized offerings and independent GLOBAL or CITY client/vendor rates at `/admin/catalogue`; this does not cut the quote builder over from the legacy catalogue. The domain contract is in [`docs/catalogue-domain.md`](docs/catalogue-domain.md).

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

The review file defaults every unresolved mapping, unknown unit, and alias conflict to `DEFER`. Apply verifies the exact workbook/review hashes and commits approved canonicals, offerings, aliases, global prices, mappings, and provenance atomically. Repeating the same reviewed apply is a no-op, including after an administrator changes a rate. The legacy catalogue and quote builder remain active; all 1,608 workbook city values remain historical evidence.

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

Apply is dry-run unless `--apply` is present, is transactional and audited, rejects stale review state, and treats an identical reapply as a no-op. Workbook `Days Applies? = N` is one-off evidence; `Y` only means duration matters and never establishes a multiplier. The engine remains headless: the quote builder has **not** been cut over.

Phase 5.6 applies the explicitly approved CAV `HALF_USE_DAYS_MIN_1` default only to individually reviewed ordinary reusable VC elements. The semantic inventory uses source descriptions, normalized identity, quantity semantics, rate availability, exception classification, and explicit evidence. Vanity, OPS, security, personnel, headcount-duty, generator/fuel, package, and ambiguous work remain deferred. There is no runtime VC/CCTV/OPS policy branch.

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

Production containers apply committed migrations before starting the application. Catalogue imports remain separate controlled operations. The recommended next phase is Normalized Quote-Line Snapshot + Ordinary Item Quote Builder Cutover.

## Continuous integration

GitHub Actions validates pull requests into `main` and pushes to `dev-mac` or `main` with `npm ci`, tests, typechecking, and a production build. CI uses no production database or OAuth secrets. Repository branch protection must be configured separately in GitHub settings before this check can be required for merges.
