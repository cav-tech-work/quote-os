# Render deployment

This project is packaged as a production, multi-stage Docker image.

1. In Render, create a new Blueprint from this GitHub repository, or create a Web Service that uses the `Dockerfile`.
2. Set `DATABASE_URL` to the internal URL of a Render PostgreSQL database.
3. Deploy. Render provides `PORT`; the container serves the application on that port.

The final image runs the Next.js standalone server as a non-root user. Its startup sequence is:

```text
prisma migrate deploy
start the Next.js standalone server
```

Migration failure stops startup. Container deployment, replacement, and restart do not seed, import, or update catalogue business data.

For a new local or disposable database, developers may explicitly run `npm run db:seed`. The legacy seed must not be run against production. Production catalogue imports are explicit controlled operations; the master-chart import workflow will be implemented separately.

Production authentication requires one stable `AUTH_SECRET`, `AUTH_URL=https://quotes.clockwork-av.com`, and the Google callback `https://quotes.clockwork-av.com/api/auth/callback/google`. After deployment, confirm the Render service hostname redirects to the canonical domain before beginning a Google sign-in, then complete fresh and repeat login smoke tests.
