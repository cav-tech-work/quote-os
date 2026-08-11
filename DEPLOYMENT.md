# Render deployment

This project is packaged as a production, multi-stage Docker image.

1. In Render, create a new Blueprint from this GitHub repository, or create a Web Service that uses the `Dockerfile`.
2. Set `DATABASE_URL` to the internal URL of a Render PostgreSQL database.
3. Deploy. Render provides `PORT`; the container serves the application on that port.

The final image runs the Next.js standalone server as a non-root user. When database migrations are introduced, configure `npx prisma migrate deploy` as a Render pre-deploy command.

Production authentication requires one stable `AUTH_SECRET`, `AUTH_URL=https://quotes.clockwork-av.com`, and the Google callback `https://quotes.clockwork-av.com/api/auth/callback/google`. After deployment, confirm the Render service hostname redirects to the canonical domain before beginning a Google sign-in, then complete fresh and repeat login smoke tests.
