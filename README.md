# QuoteOS

QuoteOS is Clockwork AV's internal quotation application. It uses Next.js, PostgreSQL, Prisma, Auth.js, and Google Workspace authentication.

## Catalogue transition

QuoteOS temporarily contains the legacy flat `CatalogueCategory` / `CatalogueItem` system used by all current screens and quote flows alongside an empty normalized catalogue foundation. No user-facing cutover or workbook import has occurred. The normalized concepts, source-authority rules, and bounded unit/quantity/duration contracts are defined in [`docs/catalogue-domain.md`](docs/catalogue-domain.md).

The authoritative master can be inspected without database writes:

```text
npm run catalogue:preview -- /absolute/path/to/CAV_Rates_VC_Ops_Power_v120826.xlsx
npm run catalogue:preview -- /absolute/path/to/CAV_Rates_VC_Ops_Power_v120826.xlsx --json
```

Add `--output preview.json` for deterministic machine-readable output. Only that workbook's `RateChart.ToClients` and `RateChart.ToVendors` are active-price candidates; `LookUp` is normalization vocabulary, venue-master data is operational evidence, and city/event files are historical evidence. Preview never populates normalized tables. Known warnings include unmapped source codes, two raw `unit` values, uncertain tour-specific duration semantics, and aliases shared across incompatible canonical targets.

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

Production containers apply committed migrations before starting the application. Catalogue imports are separate controlled operations; the production master-chart import will be implemented in a later phase.

## Continuous integration

GitHub Actions validates pull requests into `main` and pushes to `dev-mac` or `main` with `npm ci`, tests, typechecking, and a production build. CI uses no production database or OAuth secrets. Repository branch protection must be configured separately in GitHub settings before this check can be required for merges.
