# QuoteOS upgraded delivery plan

## Current position

The project is deployed to Render as a working UI prototype. Docker packaging, the data model, the initial PostgreSQL migration, signed session groundwork, and the first protected catalogue API are being established now.

## Phase 1 — secure commercial foundation (current)

Outcome: authorised users can safely access a database-backed catalogue.

1. Signed HTTP-only sessions with server-side `ADMIN` and `QUOTE_USER` permission checks.
2. Prisma singleton, initial migration, seed catalogue, and server-side paise calculation module.
3. Protected catalogue read API and admin-only item creation/update/archive APIs.
4. Admin catalogue screen; quote-user search screen uses the API instead of sample data.

Exit criteria: unauthenticated requests return 401, quote users cannot mutate catalogue data, a fresh PostgreSQL database can migrate and seed, and catalogue items are searchable from the quote builder.

## Phase 2 — persisted quotations and revisions

Outcome: draft quotes are real records and financial history is immutable.

1. Draft quote creation and update API with transactional server-side calculation.
2. Snapshot item names, units, rates, discounts, tax, terms, and settings into each revision.
3. Quote numbering, duplication, status events, repository list/search, and revision locking.
4. Replace browser-only quote builder state with draft load/save and optimistic UI feedback.

Exit criteria: rate-card changes cannot change any existing revision; generated/sent revisions cannot be edited; duplicating creates a new quote number; totals are reproducible from persisted lines.

## Phase 3 — document delivery and operational readiness

Outcome: users can issue a professional, traceable quotation.

1. Company settings and branded template configuration.
2. Server-side PDF generation, private document storage, checksum, and generated timestamp.
3. Email delivery with recipient validation, delivery audit, and retry-safe job handling.
4. Role/access audit, error monitoring, backup/recovery checks, and UAT with production catalogue data.

Exit criteria: a user can create, generate, send, find, and duplicate a quote end-to-end; every issued PDF retains its exact revision and audit trail.

## Phase 4 — commercial enhancements

Reusable packages, approval controls, richer GST rules, pricing/margin analytics, Monark import, and ProjectOS conversion are sequenced after MVP usage validates the core workflow.

## Release gates

- No production credential is stored in Git.
- `DATABASE_URL`, `AUTH_SECRET`, and initial user credentials are set only in Render.
- Every schema change has a committed Prisma migration.
- Unit tests cover calculations and immutability; integration tests cover RBAC and quote writes.
- Docker build and a Render staging deployment pass before promotion.
