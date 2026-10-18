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
