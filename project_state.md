# QuoteOS project state

Last updated: 2026-07-30

## Product purpose

QuoteOS is Clockwork AV's quotation engine: a central rate catalogue for producing professional client and vendor quotations while preserving immutable historical prices.

## Live environments

- Production: https://quote-os.onrender.com/
- GitHub (private): https://github.com/varous/quote-os
- Default branch: `main`

## What is implemented

- Next.js 15 / TypeScript application shell and responsive quote builder.
- Client and vendor quote modes with correct rate selection, quantity, days, discount, GST, and live totals.
- In-memory sample catalogue search and line-item management for the UI prototype.
- Prisma/PostgreSQL domain schema plus committed initial migration for users, roles, hierarchical catalogue, quotes, immutable quote revisions, snapped quote lines, audit events, and generated documents.
- Google OAuth with database-backed sessions, server-side `ADMIN` / `QUOTE_USER` guards, and two non-delegable bootstrap access managers (`sourav@clockwork-av.com`, `joyjeet@clockwork-av.com`).
- Protected catalogue and access-management APIs, server-side paise calculation helper, and catalogue seed script.
- Production multi-stage Docker image using Next.js standalone output and a non-root runtime user.
- Render Blueprint (`render.yaml`) with health check and production environment variables.

## Verified

- `npm run build` succeeds.
- `docker build --tag quote-os:local .` succeeds.
- Render service is reported live by the project owner at the production URL above.

## Deliberately not implemented yet

- Catalogue administration and quote-user workflow integration with the protected APIs.
- Database-backed quote persistence (the catalogue API is the first Prisma-backed endpoint).
- Catalogue administration/import/export.
- Quote persistence, duplication, revisions, statuses, search repository, and audit UI.
- PDF generation, document storage, email sending, and settings administration.

## Critical product rules

- Store all monetary values as integer paise; do not use floating-point values for persisted calculations.
- Drafts may be edited. Generated/sent versions must be locked; changes create a new revision or duplicate quote.
- Quote-line item names, units, rates, discounts, tax inputs, terms, and settings are snapshots.
- Catalogue changes must never modify historical quotes.
- Quotes must never be hard-deleted.
- Authoritative calculation happens server-side inside the quote-write transaction.

## Deployment configuration

- Render uses the repository `Dockerfile`, tracks `main`, and auto-deploys new commits; it supplies `PORT` automatically.
- Keep `DATABASE_URL` as a Render secret, pointing to the **internal** URL of a same-region Render PostgreSQL instance.
- The current UI does not query the database yet, so provisioning the database now is preparatory.
- Before persistence is launched, add an initial Prisma migration and deploy it with `prisma migrate deploy` during the release process.

## Recommended next increment: foundation and persistence

1. Build the protected catalogue administration screen and replace in-memory quote-builder catalogue data with the API.
2. Add draft quote write/read APIs with transactional calculation and immutable line snapshots.
3. Add quote revision locking, duplication, status events, and repository search.
4. Add calculation, snapshot, and permissions tests before PDF/email work.

## Useful files

- `PLAN.md` — approved MVP scope and delivery sequence.
- `Dockerfile` — production image definition.
- `render.yaml` — Render Blueprint.
- `DEPLOYMENT.md` — Render deployment notes.
- `prisma/schema.prisma` — current data model.
- `app/quote-workspace.tsx` — current interactive UI prototype.
