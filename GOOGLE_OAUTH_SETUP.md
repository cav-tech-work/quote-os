# Google OAuth setup

QuoteOS uses Auth.js and Google OAuth. Any verified `@clockwork-av.com` Google Workspace account can sign in; the system access managers are provisioned automatically as administrators.

## Google Cloud

Create a Web application OAuth client and register this exact authorised redirect URI:

```text
https://quotes.clockwork-av.com/api/auth/callback/google
```

Do not use the Render hostname as the production callback. The Render hostname is redirected to the canonical Clockwork domain before an OAuth flow can begin.

## Render

Set the following production environment variables in the `quote-os` service:

```text
DATABASE_URL=<Render internal PostgreSQL URL>
AUTH_SECRET=<one stable, long random value>
AUTH_URL=https://quotes.clockwork-av.com
AUTH_GOOGLE_ID=<Google client ID>
AUTH_GOOGLE_SECRET=<Google client secret>
```

Keep `AUTH_SECRET` stable across deploys. Do not regenerate it while users may be completing OAuth sign-in.
