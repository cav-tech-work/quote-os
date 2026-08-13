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

The resolver reads only active/effective normalized GLOBAL `Price` rows. Client and vendor sides never fall back to one another, CITY, legacy rates, workbook values, or markup rules. Charge-day-dependent offerings return their per-charge-period base amount as `NEEDS_PRICING_SCHEDULE`. This engine is headless: the quote builder has **not** been cut over.

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

Production containers apply committed migrations before starting the application. Catalogue imports remain separate controlled operations. The recommended next phase is Quote Pricing Schedule + Charge-Day Resolution; normalized quote integration and cutover remain out of scope until then.

## Continuous integration

GitHub Actions validates pull requests into `main` and pushes to `dev-mac` or `main` with `npm ci`, tests, typechecking, and a production build. CI uses no production database or OAuth secrets. Repository branch protection must be configured separately in GitHub settings before this check can be required for merges.
