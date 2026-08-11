# QuoteOS

QuoteOS is Clockwork AV's internal quotation application. It uses Next.js, PostgreSQL, Prisma, Auth.js, and Google Workspace authentication.

## Local setup

Requirements: Node.js 22+, npm, and PostgreSQL.

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env` and set local values for `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, and the Google OAuth credentials. Do not commit `.env`.
3. Apply committed migrations with `npx prisma migrate deploy`.
4. For a new disposable local database only, optionally load the legacy development catalogue with `npm run db:seed`.
5. Start development with `npm run dev`.

Neither `npm run dev` nor production container startup seeds catalogue data. Seeding is always an explicit operator action. The current seed contains legacy rates and the obsolete 40% client-rate rule; do not run it against production.

## Validation

Run:

```text
npm test
npm run typecheck
npm run build
```

Production containers apply committed migrations before starting the application. Catalogue imports are separate controlled operations; the production master-chart import will be implemented in a later phase.
