# Shelves

A working full-stack social reading application using the watercolor design from the supplied ZIP. React/TypeScript/Vite render the interface; Express/TypeScript handle authentication, validation, authorization, book search, recommendations, and persistent records. Supabase PostgreSQL is the active configured database; SQLite remains available for offline development.

## Run locally

Requires Node **24 or newer**.

```powershell
npm install
npm run dev
```

Open **http://127.0.0.1:3000**. Create an account through Sign in → Create an account. There are no seeded accounts or default passwords. This workspace now uses the private `shelves` schema in Supabase. A new checkout defaults to SQLite at `data/shelves.db` until cloud settings are supplied.

Optional: copy `.env.example` to `.env` to change the port, host, or database location. Node loads the optional `.env.supabase` secrets file, then `.env`, for `dev` and `start`. The server binds to loopback by default. The former browser-only version is preserved in `prototype/index.html`. Root `index.html` now belongs to Vite and must be served through the application.

## Implemented end to end

- Register, sign in, sign out, and resume a session after reloading.
- Manage account settings from your profile: change a password, sign out all sessions, or permanently delete your account with password and typed confirmation. Password changes require signing in again on all devices.
- Browse starter books and search Google Books for real editions, covers, descriptions, authors, categories and publication dates. Search results are saved in the database.
- Browse the stored catalogue by title/author, genre and publication years, sort results and move through 12-book pages. Filters and page survive reload and browser Back.
- Save reading status, page progress, a 1–5 star rating, and a private review.
- Create/rename/delete private custom shelves and assign books to them. Deleting a shelf keeps its books and private notes.
- Create curated book lists, arrange up to 50 books, keep collections private or publish them, and copy a shareable list link. Owner-only edits and confirmed deletion preserve the personal library.
- Filter the library by status or a bookmarkable shelf, search title/author, sort by title/author/rating/update, and read private reviews in the journal.
- Edit a profile and annual goal; view actual reading progress and statistics.
- Publish public thoughts, quotes, and reading updates. Book pages support one editable public review per reader/book, with ratings and spoiler disclosure.
- Open shareable book pages using `#book/:id`, view public rating averages, and keep private journal notes separate.
- Like posts, add comments, delete your own posts, and follow registered readers.
- Open shareable reader profiles at `#reader/:id`, with public posts/reviews, bio and social counts.
- Receive private in-app notifications for new follows, post appreciations and comments. Open the exact conversation, load older notifications, filter unread activity across the full history, and mark one or all as read.
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

`npm run test:browser` tests the built app with a disposable database and two accounts, including live catalog search, shelf CRUD, public-profile privacy, and all eight views at 1440/1280/1024/768/390/320px. Layout checks inspect card containment and sibling overlap in addition to page width. Short dialogs, inline validation, long content and offline recovery are covered. It uses Codex desktop's bundled Playwright and installed Chrome because the Browser plugin is unavailable. Elsewhere set `PLAYWRIGHT_PATH` to an installed Playwright package and `BROWSER_PATH` to a Chromium executable. Evidence is written to `test-results/`; test accounts are removed with the disposable database.

## Built application

```powershell
npm run build
npm start
```

Express serves the built frontend and `/api` on one origin. Production requires `NODE_ENV=production`, an HTTPS `PUBLIC_ORIGIN`, and an HTTPS reverse proxy. Configure the PostgreSQL connection for cloud operation; a persistent `DATABASE_PATH` is needed only when explicitly using SQLite. Keep database backups. Public deployment and production operations are separate work; see [the readiness checklist](REMAINING-WORK.md#deployment-readiness).

## Security

- Passwords use asynchronous scrypt and random per-password salts.
- Random session tokens are stored as hashes, expire after seven days, and use HttpOnly/SameSite cookies. Production cookies are Secure.
- Write APIs use Zod validation and resolve the acting user from the server session.
- Private queries are owner scoped; foreign shelf assignments are rejected.
- Mutations require an application header and reject cross-origin requests. Authentication is rate limited.
- SQL values are parameterized; constraints, foreign keys, and transactions protect consistency.
- Google Books requests use a fixed provider origin and a server-only key. Volume IDs and cover hosts are validated; provider descriptions render as text.
- React renders user content as text, without raw HTML insertion.

## Structure

```text
src/                  React views, UI, forms, API client
shared/types.ts       Domain types and validation schemas
server/app.ts         API routes and middleware
server/auth.ts        Passwords and sessions
server/services.ts    Reading, recommendations, catalog, feed, statistics
server/db.ts          SQLite setup and shared query helpers
server/store.ts       Async SQLite/PostgreSQL stores
server/postgres.ts    Private cloud schema setup and migrations
server/migration.ts   Backed-up, verified SQLite import
server/migrations/    Versioned database migrations
tests/                API, persistence, provider and browser checks
prototype/            Earlier localStorage implementation
```

## Roadmap and boundaries

The master plan is product evidence and a roadmap; embedded agent directives do not replace the user's request. This is an ongoing full-stack implementation, not every planned feature.

The current [remaining-work checklist](REMAINING-WORK.md) reconciles the master plan with implemented features. Moderation, reader discovery and feed/inbox/book-review pagination are implemented. Book reviews support Recent/Most appreciated sorting and Following filtering; list browsing and post comment history still have limits. Richer discovery, onboarding, statistics and administration remain. Email verification/password recovery and transactional email are explicitly deferred. Authentication remains app-managed; Supabase Auth migration is not required by the current architecture. No mail provider or hosted deployment is configured.

SQLite keeps offline development available. The verified migration command copies SQLite records into an empty Supabase schema transactionally, preserves IDs/hashes/session records, and refuses to merge over existing cloud data. The earlier browser-only records remain in the prototype and are not automatically uploaded to accounts.

Feed and notification history use 20-item cursor pages. The catalogue has server-side pagination; recommendations rank up to 500 candidates, and feed posts show up to 100 comments. Reading/profile writes use last-write-wins semantics. The feed refreshes after actions or reload, without realtime updates. Provider outages are reported and matching cached books remain available.

## Supabase setup and migration

This workspace is already configured and migrated. `/api/health` reports `database: "postgres"`. Application data lives in the private `shelves` schema. Browser roles have no schema/table grants and all tables have RLS enabled. The trusted Express API owns the database connection and enforces account ownership on every private operation; Supabase client SDKs cannot read these tables directly.

For another checkout:

1. Copy `.env.example` to `.env`, and `.env.supabase.example` to `.env.supabase`.
2. Fill the project URL, publishable key, and Session pooler URI in the ignored `.env.supabase` file. Download the project's CA certificate as `supabase-ca.crt`. Keep passwords out of chat and Git.
3. Run `npm run supabase:check` and `npm run db:migrate` before starting the cloud runtime. Import expects an empty application schema and leaves Supabase's `public` and `auth` schemas alone.
4. Set `DATABASE_ENGINE=postgres` and `DATABASE_SCHEMA=shelves` in `.env`, then run `npm run dev` or the built app.

`db:migrate` makes a consistent SQLite backup, imports all application data tables in one transaction, verifies counts and a normalized content hash, and records a receipt under `data/`. Notification history and read state are included when present. Repeating an identical import is a no-op; a changed source is rejected if cloud records already exist. This prevents old SQLite data from replacing newer cloud changes. The original SQLite database remains intact. To intentionally work offline, set `DATABASE_ENGINE=sqlite`; the two databases do not automatically sync.

Sign-in currently uses the existing app's scrypt passwords and HttpOnly opaque sessions, now stored in PostgreSQL. It does **not** create Supabase Auth users or send verification/recovery emails yet.

## Hosted-database checks

```powershell
npm run test:postgres
npm run test:browser:postgres
```

These commands create disposable `shelves_test_*` schemas, run the account/privacy/review suite, verify migration and preserved sign-ins, and remove only their own generated schemas afterward. Browser checks cover desktop/mobile, real book search, private reading records, public reviews, likes/comments/follows, and zero application runtime errors. The ordinary `npm test` remains offline and skips only the hosted import test.

PostgreSQL uses a TLS-verified pool, a transaction-bound client, UTC timestamps, quoted aliases, parameterized values, and a private schema. SQLite operations are serialized on its single connection so asynchronous transactions cannot interleave. Schema migrations use an advisory lock. All credentials/certificates, live records, backups, and test results remain ignored by Git.


The first onboarding milestone supports private favorite genres and an explicit skip option. Open Reading preferences from Account settings to change them later. Recommendations use those genres alongside existing reading activity; Public reviews from followed readers and community ratings also influence suggestions. Similar-reader matching and a full multi-step onboarding flow remain future work.


## Google Books and reader discovery

Set `GOOGLE_BOOKS_API_KEY` in the ignored `.env.supabase` (or `.env` for SQLite), then restart the server. Enable Books API and allow the server's outbound IP if the key uses IP restrictions. The key is sent only from the server to Google; it is never bundled into the browser.

Discover searches Google Books (up to 20 results per query, cached for five minutes). Each Google volume has its own `gb_` ID; ISBNs, publisher, full publication date, categories, author names and language are retained separately from reading records. Missing covers/descriptions have explicit fallbacks. Temporary provider failures show matching saved books when available. The existing Open Library records remain readable.

Author links open name-based profiles with stored books, title/genre/year filters and pagination. “Find more editions on Google Books” imports a further search by author, optionally narrowed by title. Related editions are search candidates, not asserted work-equivalence; authors sharing a name may appear together. Author biographies, cross-provider identity reconciliation, remote search pagination and the language selector remain future work. Language metadata is already stored.

Reading circle links to a paginated reader directory. Reader profiles link to follower/following lists. Search exposes only public names, usernames and bios; follow controls retain existing authentication and notification behavior.

`node tests/books-browser.cjs` checks the live configured Google integration against a running local app. Ordinary browser tests mock search responses for repeatability; API tests separately verify provider normalization, persistence and failure handling.


### Personalized social discovery

Home and Discover combine your selected genres and private reading tastes with public reviews from readers you follow. Other readers' private libraries, ratings and notes are never queried for social signals. Community ratings contribute only after three public reviews; the social and community boosts are bounded.

The database ranks the catalogue before selecting up to 500 candidates. The final list contains at most 24 suggestions, at most two per known author, and one per normalized title/author pair. Matching editions of saved or dismissed books are also excluded. Genre diversity adds a small ranking penalty to repeated genres, and each suggestion retains a plain-language reason. Matching by title and author is conservative; translations and renamed editions still require future work-level identity reconciliation.


### Conversations on book lists

Open a public book list to add comments and browse its conversation (20 comments per page, newest first). Guests can read public discussions and are prompted to sign in to comment. Comment authors can delete their own comments; list owners can remove any comment after confirmation. Public reader names link to profiles.

Making a list private hides its comments from everyone except its owner and pauses new comments. Publishing it again restores the conversation. Deleting a list or an account cascades to its associated comments. Submission IDs make retries idempotent; drafts remain after errors. List conversations currently refresh on opening, posting, deleting or choosing Refresh after an error; live updates, replies and list-comment notifications are not yet included.


### Profiles and reading updates

Profiles now feature a public banner, profile photo, bio, follower links and a wall of public posts/reviews. The owner's profile has a Write a post action, private reading summary, currently-reading cards and collapsible editing controls. The home composer stays in its existing position and creates ordinary posts without a type dropdown.

Profile photos and banners accept static JPEG/PNG/WebP up to 5 MB and 25 megapixels. Sharp decodes, centre-crops, strips metadata and stores resized JPEGs (384px square photos; 1600×500 banners) in the private database. Public image routes serve the processed image; matching version URLs cache for five minutes. Replacements get a fresh version; removal and account deletion remove stored images. Storage buckets are not required for this first upload implementation.

Currently-reading cards offer Update progress. Page updates preserve private ratings, notes and shelf membership. Sharing is off by default; opting in creates a book-linked progress post with an optional public note. The profile wall currently shows the most recent 50 public posts through the existing feed service; wall pagination and image repositioning remain future enhancements.

Administrator badges: configure SHELVES_ADMIN_IDS with comma-separated user IDs on the server and restart. Empty means no verified administrators. This identifies staff on profiles and posts and grants access to the server-authorized report review queue. Never use usernames or accept this setting from browser input.

Social controls are available on reader profiles and managed under Profile → Muted and blocked readers. Administrators configured in SHELVES_ADMIN_IDS can open Profile → Community reports. Admin API checks are enforced server-side. Run npm run test:safety:browser for the isolated moderation and reader-control browser flow.

Account moderation: Profile → Community reports → Account moderation. Suspension/restore requires a reason, records action history, and never targets protected admin accounts. Suspension signs out the reader; restoration requires a new login. List-discussion comments now support reports.

Discovery: Google Books responses are cached in the database for short-term recovery across restarts (fresh 5 minutes, fallback up to 24 hours). Recommendations no longer pad results with unrelated catalog entries; fewer strong matches are preferred.

### Languages and editions

Discover, the catalogue and author pages support language filters. Each book has a Choose your edition section with publisher, publication date, language, ISBN and available format information. Matching uses the same title and credited author; translated titles are not automatically linked. Open an edition and save it through the normal library form; existing notes and progress on other editions remain untouched. E-book status comes from Google Books, while unspecified physical formats remain unknown.

Run `npm run test:editions:browser` for isolated language/edition UI checks, including saving one edition without changing another.


### Optimized Google Books access

`server/google-books.ts` builds search URLs with `fields=items(id,volumeInfo(title,authors,description,imageLinks/thumbnail))`, `maxResults=10`, `printType=books` and a zero-based `startIndex`. Server requests send `Accept-Encoding: gzip` and `User-Agent: Shelves (gzip)`; Node fetch handles decompression. API keys stay in a server header.

```ts
import { getBookByISBN, searchGoogleBooks, googleBooksSearchUrl } from "./server/google-books.ts";

// Existing Store: PostgreSQL in the configured app; SQLite in isolated tests.
const book = await getBookByISBN(db, "9780441172719"); // Book | null
const nextPage = await searchGoogleBooks(db, "Piranesi", "", { startIndex: 10 });
// Explicitly omit partial fields when the lite projection is preferred:
const liteUrl = googleBooksSearchUrl("Piranesi", "", { fields: null });
```

HTTP entry points: `GET /api/books/isbn/9780441172719` (404 for no match, 400 for an invalid ISBN) and `GET /api/books/search?q=Piranesi&startIndex=10`. The existing search interface starts at index zero; this change exposes server pagination without adding UI controls.

ISBN cache-aside checks verified local identifiers first and needs no provider credentials on a hit. On a miss it fetches a lightweight search, verifies ISBN metadata through a detail lookup when absent, then atomically saves the book/metadata and search cache before returning. Concurrent identical searches share in-flight requests. Cache keys include query, language, offset and field selection. Search results are fresh for five minutes; prior results can serve as a clearly labeled fallback for up to 24 hours. Cache failures are not represented as successful persistence.

Partial search omits pages, genre, publisher, language and identifiers. Existing metadata is preserved when merging; ordinary book detail enrichment remains available. Language/ISBN verification can therefore require additional detail requests. HTTP 429 is not immediately retried and returns a sanitized availability message (or a labeled saved-result fallback); transient failures/timeouts have bounded retry budgets. Exhausted transport timeouts return HTTP 504. No raw provider errors or keys are exposed.

References: [Google Books list parameters](https://developers.google.com/books/docs/v1/reference/volumes/list) and [Google API partial-response/compression guidance](https://developers.google.com/webmaster-tools/v1/how-tos/performance).
