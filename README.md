# SkillSwap

SkillSwap is a student skill-exchange application. The frontend is a React + TypeScript app, and the backend is an Express API backed by SQLite.

## Production first-admin setup

The backend can create the configured first administrator during startup. In the hosting provider's backend environment settings, set:

- `ADMIN_FULL_NAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD` (12–128 characters)

Deploy/restart the backend after setting these values. On startup, the backend creates that account as an administrator, or promotes the matching existing account if there is no active administrator. It records this bootstrap in the admin audit log. If a different active administrator already exists, it will not create another one. The configured password is hashed with Argon2id.

Keep these variables configured when using ephemeral SQLite storage. If the host resets its filesystem and the database is recreated, startup can seed the administrator again. Keep in mind that an ephemeral filesystem can also lose other application data.

## Local development

Install each app's dependencies, then run the backend and frontend in separate terminals:

```bash
npm --prefix backend install
npm --prefix frontend install
npm --prefix backend run dev
npm --prefix frontend run dev
```

The backend listens on port `3000`; the frontend development server uses Vite's configured port.

## Google sign-in setup

Google sign-in and account creation use the Google Identity Services button. Google issues an ID token in the browser; the backend verifies its signature, issuer, audience, expiry, and verified email before it creates a normal `user` account or starts a session. Existing verified Google accounts are matched by Google account ID. Existing accounts may be linked by verified Gmail address or a Google Workspace domain claim; for other email providers, sign in with the existing password first.

1. In Google Cloud Console, configure the OAuth consent screen and create an OAuth client ID with application type **Web application**. Add the exact browser origins you use under **Authorized JavaScript origins**, such as `http://localhost:5173`, `http://localhost:5174` (or `https://localhost:5174` when local HTTPS is enabled), `https://swapskil1.vercel.app`, and `https://swapskil1-2uc5.vercel.app`. This popup flow does not need an authorized redirect URI.
2. Set the same Web client ID in both deployment environments:
   - Vercel frontend: `VITE_GOOGLE_CLIENT_ID`
   - Render backend: `GOOGLE_CLIENT_ID`
3. For local development, copy the values from `frontend/.env.example` to `frontend/.env.local` and from `backend/.env.example` to `backend/.env`. Keep real environment files out of Git.
4. To enable AI career roadmaps, set `OPENAI_API_KEY` in the backend environment (Render for production, `backend/.env` locally). The key must stay server-side; roadmap generation also uses OpenAI web search and may incur API charges.
4. Restart the local servers or redeploy the frontend and backend after setting the variables. If Google's consent screen is in testing mode, add the accounts that will test sign-in as test users.

The client ID is public configuration and must match between frontend and backend. Do not put a Google client secret in frontend code or expose it in Vercel variables prefixed with `VITE_`.
