# Google sign-in setup

QuoteOS uses Auth.js with the Google provider. Only invited users can sign in; `sourav@clockwork-av.com` and `joyjeet@clockwork-av.com` are automatically made administrators and access managers on their first sign-in.

## Create the Google OAuth client

1. Open Google Cloud Console and select the Clockwork AV project.
2. Configure the OAuth consent screen for the Clockwork AV organisation. Add the two access-manager accounts as test users if the app is still in testing mode.
3. Create an **OAuth client ID** of type **Web application**.
4. Add this authorised redirect URI exactly: `https://quote-os.onrender.com/api/auth/callback/google`
5. Copy the generated client ID and client secret.

## Configure Render

In the `quote-os` Render service, set `DATABASE_URL` to the internal Render PostgreSQL URL, plus `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET`. On its next deploy, the container automatically applies the committed Prisma migrations before starting QuoteOS.

## Granting access

After either bootstrap access manager signs in, visit `/access`. They can invite an email as a **Quote user** or **Administrator**. Only the two specified bootstrap users can manage access; that authority cannot be delegated through the interface or API.
