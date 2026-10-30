# RateMyProf — NIT Warangal

A React + plain CSS frontend with a Node.js/Express/MongoDB backend. **Modules 1–3 are implemented with MongoDB and Google OAuth.**

- Catalog: official departments/faculty and current B.Tech courses, with source links and verified teaching assignments.
- Accounts: configured NITW email domain (`@student.nitw.ac.in`), password login/logout, Google OAuth login, MongoDB sessions, CSRF protection, password recovery and OTP verification.
- Reviews: six ratings, optional text, up to five predefined tags, semester, and confirmation. Reviews persist anonymously; one submission per account × professor × course is enforced.
- Module 4's advanced discovery/aggregates, Module 5's moderation, and Module 6's analytics remain future work. Helpful votes/reports are clearly marked frontend previews. Insights is blank and comparison is removed.

## Run locally

Requires Node.js 20.19+ (or newer), npm, and MongoDB 6.0+ (running locally or via MongoDB Atlas).

```sh
npm install
npm run setup:local
```

Setup creates a private `.env`, initializes MongoDB collections and indexes, imports the checked-in official NITW catalog, and creates a local website administrator. It preserves an existing `.env` and existing account data. Initial admin credentials are in `.local/admin-account.txt`.

Run the following in two separate terminals:

```sh
npm run dev:server
```

```sh
npm run dev
```

Open **http://localhost:5173/**. The configured browser origin must match `APP_ORIGIN`. Vite proxies `/api` to Express on port 3000.

### Google OAuth Configuration (Optional)
To enable Google Sign-In:
1. Create a Web OAuth 2.0 Client ID in [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Set Authorized Javascript Origins to `http://localhost:5173` and `http://localhost:3000`.
3. Add `GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com` to `.env`.
4. Only `@student.nitw.ac.in` Google accounts are permitted to authenticate; accounts are automatically created on first sign-in.

### Email & OTP Verification
- Students can also register and log in with email and password.
- Verification OTPs can be requested via `POST /api/auth/send-otp` and verified via `POST /api/auth/verify-otp`.
- In development (`MAIL_MODE=file`), generated OTPs and password reset codes are saved privately in `.local/mail/`. No real emails are sent in this mode. In production, set `MAIL_MODE=smtp` with your SMTP server details.

## Refresh the official catalog

The checked-in `shared/nitwCatalog.json` snapshot allows setup without scraping the website each time. See [NITW_CATALOG.md](docs/NITW_CATALOG.md) for sources, verification, and known source discrepancies.

To collect a fresh snapshot, install the development browser and Poppler's `pdftotext` command:

```sh
npx playwright install chromium
# On macOS, install Poppler if pdftotext is missing:
brew install poppler
npm run catalog:collect
```

The collector visits NITW's department rosters (including published adjunct tabs), the **current** central B.Tech curriculum tab, all its PDFs, and roster-linked public ERP profiles. It extracts public catalog facts, checks coverage, and writes a verification report. It does not collect student details, faculty phone numbers, or email addresses.

```sh
npm run catalog:sync
```

Sync privately backs up catalog tables, applies migrations, and imports the snapshot. It preserves account/review data, stable IDs, and manually created records. Official records are refreshed; existing manual teaching links are retained. `npm run db:seed` instead inserts missing initial records without overwriting edits. No command seeds reviews.

Optional collector settings: CHROMIUM_PATH, PDFTOTEXT_PATH. `node server/scripts/collect-nitw.js --cached` reuses already downloaded PDFs/profile pages for debugging; use a normal collection run to refresh those sources. Raw pages/PDFs/backups remain ignored under `.local/nitw/`.

## Main API routes

| Route                                                           | Purpose                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------ |
| GET /api/catalog                                                | Public departments, professors, courses, and teaching links  |
| GET /api/professors, /api/courses                               | Public list/search/filter                                    |
| GET /api/professors/:id, /api/courses/:id                       | Public detail                                                |
| POST/PUT/DELETE /api/departments, /api/professors, /api/courses | Admin catalog changes; detail IDs required for edits/deletes |
| GET /api/auth/session                                           | Own account, CSRF token, allowed domains, Google client ID   |
| POST /api/auth/register, /api/auth/login, /api/auth/logout      | Password account lifecycle                                   |
| POST /api/auth/google                                           | Google ID token login/signup (@student.nitw.ac.in)           |
| POST /api/auth/send-otp, /api/auth/verify-otp                   | Email verification codes for @student.nitw.ac.in             |
| POST /api/auth/forgot-password, /api/auth/reset-password        | Recovery                                                     |
| GET /api/auth/review-eligibility                                | Signed-in teaching-link check                                |
| GET /api/reviews                                                | Anonymous saved reviews                                      |
| POST /api/reviews                                               | Student-only validated submission; duplicate returns 409     |

All mutations require the session's CSRF token. Public review responses never include email, user ID, password hash, private seed, or duplicate-enforcement key. A catalog record with saved reviews cannot be deleted without removing referencing reviews.

## Tests and learning

```sh
npm test
npm run test:integration
npm run build
```

Unit tests cover helpers, review validation, and extraction/snapshot integrity. Integration tests use an isolated temporary MongoDB database, covering permissions, CRUD, sessions/recovery, review persistence/privacy, duplicate races, and repeatable catalog import.

- [30-minute backend guide](docs/BACKEND_30_MIN_GUIDE.md)
- [Project file map](docs/PROJECT_CODE_GUIDE.md)
- [Backend request walkthrough](docs/BACKEND_CODE_GUIDE.md)
- [Six-module status](docs/MODULE_GUIDE.md)
- [Official catalog audit](docs/NITW_CATALOG.md)

`.env`, `.local/`, node_modules, dist, and credentials are excluded from Git. Share `.env.example`, never your actual secrets. A production deployment additionally needs its public listening address, HTTPS/origin/cookie configuration, encrypted remote MySQL connection, and real mail delivery configured; this change does not deploy hosting.
