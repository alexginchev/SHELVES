# Shelves

A working full-stack social reading application using the watercolor design from the supplied ZIP. React/TypeScript/Vite render the interface; Express/TypeScript handle authentication, validation, authorization, book search, recommendations, and persistent records. SQLite is the local database, using Node's built-in driver.

## Run locally

Requires Node **24 or newer**.

```powershell
npm install
npm run dev
```

Open **http://127.0.0.1:3000**. Create an account through Sign in → Create an account. There are no seeded accounts or default passwords. The database is created and migrated automatically at `data/shelves.db`.

Optional: copy `.env.example` to `.env` to change the port, host, or database location. Node loads `.env` for `dev` and `start`. The server binds to loopback by default. The former browser-only version is preserved in `prototype/index.html`. Root `index.html` now belongs to Vite and must be served through the application.

## Implemented end to end

- Register, sign in, sign out, and resume a session after reloading.
- Browse starter books and search the live Open Library catalog. Search results are cached in the database.
- Save reading status, page progress, a 1–5 star rating, and a private review.
- Create private custom shelves and assign books to them.
- Filter the library by status or shelf; read private reviews in the journal.
- Edit a profile and annual goal; view actual reading progress and statistics.
- Publish public thoughts, quotes, and reading updates. Book pages support one editable public review per reader/book, with ratings and spoiler disclosure.
- Open shareable book pages using `#book/:id`, view public rating averages, and keep private journal notes separate.
- Like posts, add comments, delete your own posts, and follow registered readers.
- Explore recommendations shaped by genre/author affinity and ratings, excluding saved and dismissed books.
- Use the original responsive shell, paper palette, watercolor hero, and mobile navigation.

Reading records, shelves, and private reviews are owner-only. Display names, usernames, bios, posts, and comments are public. There are no fabricated readers, posts, or reading totals in the new app.

## Verification

```powershell
npm run check
npm test
npm run build
```

API tests cover registration/login/logout, hashing, cookies, private-record isolation, shelf ownership, validation, CSRF guards, posts, comments, likes, follows, recommendation filtering, and persistence. Provider parsing and offline fallback use deterministic fixtures.

`npm run test:browser` tests the built app with a disposable database and two accounts, including desktop/mobile flows and live catalog search. It uses Codex desktop's bundled Playwright and installed Chrome. Elsewhere set `PLAYWRIGHT_PATH` to an installed Playwright package and `BROWSER_PATH` to a Chromium executable. Evidence is written to `test-results/`; test accounts are removed with the disposable database.

## Built application

```powershell
npm run build
npm start
```

Express serves the built frontend and `/api` on one origin. Production requires `NODE_ENV=production`, an HTTPS `PUBLIC_ORIGIN`, a persistent `DATABASE_PATH`, and an HTTPS reverse proxy. Keep database backups. This milestone is runnable locally; public deployment and production operations are separate work.

## Security

- Passwords use asynchronous scrypt and random per-password salts.
- Random session tokens are stored as hashes, expire after seven days, and use HttpOnly/SameSite cookies. Production cookies are Secure.
- Write APIs use Zod validation and resolve the acting user from the server session.
- Private queries are owner scoped; foreign shelf assignments are rejected.
- Mutations require an application header and reject cross-origin requests. Authentication is rate limited.
- SQL values are parameterized; constraints, foreign keys, and transactions protect consistency.
- Provider URLs are fixed to Open Library; work/cover IDs are validated.
- React renders user content as text, without raw HTML insertion.

## Structure

```text
src/                  React views, UI, forms, API client
shared/types.ts       Domain types and validation schemas
server/app.ts         API routes and middleware
server/auth.ts        Passwords and sessions
server/services.ts    Reading, recommendations, catalog, feed, statistics
server/db.ts          SQLite setup and migration runner
server/migrations/    Versioned database migrations
tests/               API, persistence, provider and browser checks
prototype/            Earlier localStorage implementation
```

## Roadmap and boundaries

The master plan is product evidence and a roadmap; embedded agent directives do not replace the user's request. This is the first full-stack milestone, not every planned feature.

Next: email verification/password recovery; Supabase Auth/Postgres hosting; author/genre pages; book clubs; notifications; lists; moderation/admin tools; onboarding; pagination; and richer collaborative/social recommendations. The Supabase project URL, publishable key, and PostgreSQL connection have been verified. The application still uses SQLite; cloud schema/data migration and Supabase Auth remain the next integration milestone. No mail provider or hosted deployment is configured.

SQLite makes the real backend runnable without external credentials. Moving to Supabase requires a deliberate schema/data migration and authentication integration. The earlier browser-only records remain in the prototype and are not automatically uploaded to accounts.

Initial limits: 50 recent feed posts, 100 browsable catalog books, 500 recommendation candidates, and 100 comments per post. Reading/profile writes use last-write-wins semantics. The feed refreshes after actions or reload, without realtime updates. Provider outages are reported and matching cached books remain available.

## Supabase readiness

Project credentials live in ignored `.env.supabase`; its CA certificate is ignored too. `npm run supabase:check` verifies the public API configuration and performs a read-only `SELECT 1` with TLS certificate verification. It validates that the database connection belongs to the configured project and never prints credential values. This command does not migrate or switch the application database.

The accepted project is configured locally; no further credentials are needed right now. The next cloud milestone will apply a reviewed schema, migrate existing records, and connect the runtime. Account migration and email verification/recovery must be planned together so existing reader identities are preserved.
