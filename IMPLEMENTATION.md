# Current roadmap — 2 November 2026

## Whole-card navigation and faster book opening — 2 November 2026

Removed View book buttons from book tiles and the featured pick. Native stretched links make the card clickable with visible card-level keyboard focus, preserve modified-click navigation, and leave recommendation dismissal independent. Existing paper/sage materials and spacing remain.

Book pages render saved details before optional Google metadata recovery. Enrichment is cancellable and cannot replace a newer book's data. Independent detail queries and catalogue count/page/genre queries now run concurrently; out-of-range catalogue pages still clamp correctly. The live Sarah J. Maas catalogue returned 12 books in 439ms in one check; this is an observation, not a before/after benchmark or provider latency guarantee.

Verification: build/typecheck/formatting and strict UI audit passed; design lint has zero errors with existing runtime-token warnings. All 21 SQLite tests passed (hosted-only migration skipped), three focused PostgreSQL tests passed, and full browser regression passed all 66 route/viewport checks with zero runtime errors. Dedicated card tests cover padding clicks, keyboard navigation, 1440/390/320px layouts and saved content before a deliberately delayed enrichment response. Screenshots and independent code/design review found no material issues. The local Supabase server was restarted with the faster endpoints.

See [REMAINING-WORK.md](REMAINING-WORK.md) for the master-plan reconciliation, remaining feature checklist and deployment assessment. Complete book-review browsing is now implemented; list browsing and comment history are the next bounded gaps. Entries below are historical; later milestones supersede earlier pending-work statements. Email recovery remains explicitly deferred. The full application is not declared complete.

## Complete book-review browsing — 2 November 2026

Replaced the book-page 50-review cap with validated 20-item cursor pages. Added Recent/Most appreciated sorting, Everyone/Following filtering, preserved edition URL parameters, and independent own-review retrieval. Following excludes the viewer's own review from the list but retains its edit action. Shared cursor loading/footer and native controls preserve the paper/sage layout, retry behavior and loaded depth. No database migration or new dependency is required.

Appreciation ranks are live, not snapshots: concurrent likes can move results across cursor boundaries; explicit refresh rebuilds the loaded range. Server visibility filters precede pagination, and no private reading data contributes.

Verification: 21 SQLite tests passed with the hosted-only migration test skipped; the focused PostgreSQL review test passed, including mute/reverse-block/suspension exclusions. Dedicated browser checks passed 65-review traversal, initial/older-page retry, own-review editing outside the first page, like/unlike and refresh depth, sorting/filter persistence, guest Following recovery and keyboard controls at 1440/390/320px. Screenshots were inspected. The full browser regression passed all 66 route/viewport checks with zero runtime errors. Typecheck/build, formatting and strict UI audit passed. Independent code/screenshot review found no material defects; design documentation review confirmed no new tokens or visual-system changes. Impeccable's optional engine could not run because it was not installed; no detector pass is claimed. The restarted local PostgreSQL app serves the new endpoint successfully.

# Full-stack milestone — 13 October 2026

Root now runs React/TypeScript/Vite with a Node/Express API. The earlier frontend is preserved in `prototype/`. The supplied ZIP remains the visual reference.

## Decisions

The roadmap proposes Supabase/Postgres. No project credentials were supplied, so this milestone uses built-in SQLite and local session authentication to deliver a runnable backend. Supabase remains a hosting/authentication milestone requiring a real migration. Node 24 is required; its SQLite API currently emits an experimental-feature notice.

Private reading records, shelf assignments, reviews, and statistics are owner-only. Publishing posts/comments is an explicit public action. Reader names, usernames, and bios are public; emails, password hashes, sessions, and private reading behavior are not exposed.

Recommendation service `genre-affinity-v1` uses genre/author affinity from saved books and ratings, excludes saved/dismissed books, and provides plain-language reasons. Collaborative filtering, embeddings, social scoring, and diversity reranking remain future work.

## Evidence

Strict TypeScript and production build pass. API tests cover account/security flows, cross-account isolation, ownership, persistence, social interactions, and provider parsing. Browser checks use two separate sessions and a disposable database, including live Open Library search, desktop/mobile layouts, reload persistence, and Escape dismissal. Evidence is in `test-results/browser.json` and screenshots in the same directory.

Email recovery/verification, hosted Supabase, moderation, clubs, lists, notifications, advanced recommendations, concurrency conflict detection, and production operations remain to be built.

## Milestone 2

Added shareable book pages, explicit public reviews, spoiler reveal, one-review-per-reader constraints, edits/deletion, community rating aggregates, and reuse of existing likes/comments. Private journal records remain separate. Added a consolidated authenticated snapshot endpoint to avoid refresh throttling. Four API tests and the expanded desktop/mobile two-account browser flow pass.

The supplied Supabase project, publishable key, Session pooler connection, and CA certificate have been verified. No external schema or data migration has run; the live app remains on SQLite. Local secrets and the CA certificate are ignored by Git. Cloud migration/activation is the next separate milestone.

## Milestone 3 — 14 October 2026

Activated Supabase PostgreSQL for the running app. The `shelves` schema is private, has RLS enabled, and denies client roles. The backend now awaits pooled queries and transaction-bound clients; SQLite stays available as a serialized offline store. Library reads and statistics use joins/aggregates to avoid per-book cloud round trips.

The actual import copied six starter books; there were zero local accounts, sessions, reading records, or posts. A consistent backup and verified import receipt are stored under ignored `data/`. Migration tests separately verified complete reading/social data, account IDs, password login and existing session preservation, safe reruns, protection of cloud edits, and denied direct client-role reads. The running health endpoint reports `postgres`, version `0.2.0`.

Five offline tests pass (one hosted-only test skipped), all six hosted API/migration tests pass, and the complete two-account browser flow passes on PostgreSQL for desktop/mobile with zero application runtime errors. No emails were sent or Supabase Auth accounts created. Email verification/recovery and a future Auth migration remain separate work.

## Milestone 4 — layout repair and library/community functions

Removed the React import of the prototype stylesheet. `src/app.css` now owns a single active layout and palette, preserving the paper/watercolor identity. Cards retain padding, grids size to available width, controls wrap, the sidebar middle scrolls without hiding its footer, and phone artwork occupies its own area. Dialog close controls have a dedicated row; bounded scrolling keeps fields/actions reachable at short heights. Shared inline form validation preserves native constraints without browser bubbles. Covers recover through a shared React fallback.

Added owner-scoped shelf renaming/deletion with confirmation and preserved library records; bookmarkable shelf filters; local title/author search and sorting; and public reader profiles with bio, social counts, posts/reviews and follow/unfollow. Public profiles exclude emails, goals, reading records and private shelves.

API checks verify ownership, duplicate names, preserved notes/progress, and profile privacy on SQLite and PostgreSQL. Browser coverage includes 48 populated route/width combinations, 320x480 forms, long unbroken names/long book titles, failed submissions, keyboard dismissal, and reduced motion. Screenshots and containment/overlap evidence are saved under ignored `test-results/`. The strict premium UI audit has no findings; DESIGN.md lint reports no errors (semantic token-reference warnings remain for the runtime-owned palette).

## Milestone 5 — notifications

Added recipient-private notifications for follows, appreciations and comments, a periodically refreshed header badge, unread filtering, individual/all read actions, and shareable post pages for exact conversation links. The inbox shows the latest 100 items with an all-history unread count. Creation is transactional, retry-safe for likes/follows, suppresses self-actions, and cleans up on undo/deletion. SQLite and PostgreSQL migrations add indexed notification storage; import includes notification/read state while retaining compatibility with earlier empty-notification receipts.

Verification: five SQLite tests pass (hosted import skipped), all six PostgreSQL tests pass, and the full Supabase browser flow passes with zero runtime errors. Notification privacy, retry deduplication, self-action suppression, read-state isolation, undo/deletion cleanup and import preservation are covered. Desktop/320px inbox and conversation checks pass alongside the existing 48-view layout matrix. Browser-only visual fixtures were inspected at 1440/390/320px without creating live sample data. The live PostgreSQL server was started with the new migration and guest inbox access returns 401.

## Milestone 6 — curated book lists

Added private-by-default collections with titles, descriptions and up to 50 unique ordered books. Readers can create/edit lists, add/remove/reorder books, publish or make them private again, copy public links, browse collections, and confirm deletion. Book lists are reachable from desktop and mobile navigation. The editor reuses the shared Dialog/Form and native visibility select; responsive wrapping and bounded picker scrolling preserve the established paper design.

SQLite and PostgreSQL migrations add indexed lists/list_books tables. API reads enforce public-or-owner visibility; writes enforce ownership and save metadata/order atomically. Unknown or duplicate books cannot partially overwrite a list. Cloud bootstrap enables RLS and revokes browser-role grants on both tables. SQLite import includes collections and retains compatibility with older receipts when the new tables are empty.

Verification: six offline tests pass (hosted import skipped), all seven hosted tests pass, and the extended import fixture preserves private lists and book membership. The Supabase browser flow passes list creation, ordering, reload, second-account denial, publication and deletion, plus 54 route/viewport combinations and dedicated list checks down to 320px. Desktop and mobile list screenshots were inspected. The active local PostgreSQL server exposes the new routes successfully. Lists currently browse the latest 100 visible collections; pagination, list discussions and custom artwork remain future work.

## Milestone 7 — account controls

Added private account settings accessible from the profile, current-password-confirmed password changes, sign-out-all, and confirmed account deletion. Password changes invalidate all existing sessions; login rechecks credentials under a database lock to prevent stale concurrent logins. Deletion uses the existing ownership/cascade model, preserving other accounts and shared catalogue books. The new page and confirmation forms reuse the existing paper styling, Dialog and Form. No database migration is required.

Email delivery and password recovery were explicitly deferred by the user; no recovery infrastructure or mail configuration was retained. Settings expose only the current user's email and active-session count. Tests cover failed confirmations, password validation, old-password rejection, cross-session revocation and deletion isolation.

Validation completed: seven SQLite tests pass with hosted import skipped; all eight PostgreSQL tests pass. The full Supabase browser flow passed password mismatch/wrong-password recovery, password change and new login, sign-out-all, deletion/cancel, and 60 route/viewport checks with zero runtime errors. Account settings screenshots were inspected at desktop and 320px. Strict UI audit reports no findings. The development server was started with the new account endpoints.

## Milestone 8 — reading preferences

Added private, editable genre preferences and a home onboarding invitation. Up to five genres influence recommendations with explicit explanations; skipping is supported and saved. Account settings links back to preferences. Added SQLite/PostgreSQL storage and backward-compatible import support. Shared genre constants stay separate from server validation to avoid adding Zod to the browser bundle. This milestone does not add email recovery, social recommendation signals, or the full onboarding sequence.

Verification: eight SQLite tests pass (hosted import skipped), all nine Supabase API/migration tests pass, and the final Supabase browser suite passes with zero runtime errors and 66 route/viewport checks. Preference selection limits, reload, skip/reset, recommendation ranking, owner isolation and import preservation are covered. Desktop/320px screenshots were inspected; strict UI audit has no findings. The expanded rapid-navigation test initially exhausted the real global rate limit; the harness now respects its reset window before account-write tests, without changing application limits. The live server was restarted with the preference migration and guest reads return 401.

## Milestone 9 — catalogue discovery

Added a catalogue browser linked from Discover, with genre and publication-year filters, literal title/author search, title/newest/oldest sorting, and server pagination. URL state preserves filters/page through reload and book-page Back navigation. Shared Form, BookCard and library toolbar styles retain the existing responsive design. This operates on all stored catalogue books instead of the snapshot's first 100; live external search remains separate. No account setup or database migration is required.

Verification: nine SQLite API/transaction tests pass (hosted import skipped), all ten Supabase tests pass, and the final Supabase browser suite passes with zero runtime errors. Catalogue checks cover combined filters, reload, browser Back, year validation, empty results and desktop/390/320px layouts; existing 66 route/viewport checks also pass. Visual inspection led to extra spacing above result counts and pagination. Native dropdowns have explicit accessible names. The test harness now lets request windows reset before both rapid layout navigation and account-write tests; production rate limits remain unchanged. Strict UI audit and build pass. The running local server exposes the new catalogue endpoint.


## Milestone 10 — reader discovery and Google Books editions

Added public reader search, paginated follower/following lists, and follow controls. Google Books is now the live search provider with fixed-origin requests, server-only credentials, timeout, bounded caching, validated covers and plain-text descriptions. SQLite/PostgreSQL metadata tables preserve authors, categories, publisher, date, ISBNs and language without changing existing reading records. Import compatibility and private-schema RLS include the new tables.

Books link to name-based author profiles with local title/genre/year filtering, pagination and an explicit Google Books import action. Each volume stays separate. Edition metadata and related-edition search are visible on book pages. Language selection, author identity disambiguation and biographies are deferred.

Verification: 10 SQLite tests passed with the hosted import skipped; all 11 Supabase API/migration tests passed. The complete SQLite browser flow passed with zero runtime errors, the existing 66 route/viewport checks, and added reader-directory/author checks at 1440/390/320px. A live Google search returned 20 records; real edition metadata, author navigation and loading passed six responsive checks. Strict UI audit reported zero findings. Credentials remained out of test output and source control.


## Milestone 11 — public social recommendations

Moved recommendation scoring into a focused service. A parameterized SQL query ranks the complete catalogue using this reader's own genre/author affinity, selected preferences, bounded public-review signals from followed readers, and a small community signal requiring three reviews. Other readers' private records are excluded. Candidate selection is bounded after ranking; in-memory selection adds author limits, genre diversity and normalized title/author edition deduplication. Saved and dismissed matching editions remain excluded. Existing cards display the updated reasons, so no new UI or database migration is needed.

Added regression coverage with more than 500 candidate books: later catalogue entries can rank first; private ratings cannot influence another reader; public review changes and follow removal update reasons; community thresholds apply; saved/dismissed editions and repeated authors are controlled. Names/titles are only a conservative identity heuristic, not a full cross-language work graph.

Verification: 11 SQLite tests passed (hosted import skipped); all 12 Supabase tests passed. The full browser suite passed with zero runtime errors, 66 route/viewport checks and the reader/author checks. Production build and type checking passed. The live app returns 24 explained recommendations from the updated service.


## Milestone 12 — conversations on book lists

Added paginated public list conversations, authenticated posting, reader-profile links, author deletion and owner moderation. Privacy is checked transactionally against the current list row. Private lists preserve conversation history for the owner only and reject new comments. A client-generated submission ID prevents duplicate inserts on unchanged retries. Deletion confirms explicitly in the shared dialog.

SQLite/PostgreSQL migrations add indexed list_comments with list/account cascades. Private-schema RLS and backward-compatible SQLite import include the new table. API coverage verifies guest access, ownership, visibility changes, body validation, retries, pagination and cascades; the import fixture includes a preserved comment. Browser coverage adds second-reader posting, owner moderation/cancel and long-content responsive layouts.

Verification: 11 offline tests passed (hosted import skipped); all 12 Supabase tests passed, including preserved list comments. The complete browser suite passed with zero runtime errors, including second-reader posting, owner removal/cancel and long comments at 1440/768/390/320px. The 320px conversation screenshot was inspected; strict UI audit reports zero findings. Final build passed and the local server was restarted with the new migration.


## Milestone 13 — profile identity, wall and reading progress

Removed the composer type dropdown and kept ordinary posting at its existing home location. Added currently-reading cards on Home and Profile with private page updates and explicit opt-in progress sharing. The dedicated endpoint checks ownership/status/page bounds and updates progress plus optional public post transactionally, preserving private notes/rating/shelves.

Rebuilt self/public profile identity around banners, photos, bio and follower links. The self page includes a public wall, writing action, reading summary and collapsible editing. Added Sharp-based authenticated image processing, bounded input bytes/pixels/formats, metadata removal, JPEG normalization, public versioned image reads and removal. SQLite/PostgreSQL migrations store images with account cascade and import preservation. No cloud storage setup is required.

Verification: 12 SQLite tests passed (hosted import skipped), and all 13 Supabase tests passed. The full browser suite passed with zero runtime errors, including image uploads, progress sharing, profile-wall rendering and responsive checks at 1440/390/320px alongside the existing 66-view matrix. Desktop/mobile profile screenshots were inspected. Final build and strict UI audit passed, and the local server was launched with the new image migration.

## Social safety milestone

Added persistent block/mute controls, viewer-filtered feeds, comments, notifications, reader directory, lists and recommendation signals. Blocking removes follows and prevents direct interactions server-side. Added private report submission for posts, feed comments and profiles; server-authorized admin queue with pagination, dismissal and confirmed post/comment removal. Added SQLite/PostgreSQL migrations and importer compatibility. Profile reports currently support review/dismissal; suspensions and list-discussion reports remain future work.

## Moderation completion and discovery relevance

Added account suspension/restoration with required reasons and immutable action records, session revocation, protected admin accounts, private admin account search/history, and list-comment reporting/removal. Added separate additive migrations for both engines. Added persistent Google query caching, request coalescing, better title/author result ranking and a quality/relevance gate for recommendations. Upstream Google 503 errors remain external; previously successful results can be reused across restarts.

Verification completed 2026-10-22: final production build and full browser regression suite passed, including 66 route/viewport checks and zero runtime errors. The dedicated safety browser suite passed suspension/restoration, action history, and list-comment reporting/removal at desktop and mobile widths. All 15 PostgreSQL tests passed during implementation; final SQLite regressions passed (14 tests plus the PostgreSQL-only migration skip), and populated moderation/cache migration tests passed separately. Live Piranesi search succeeded; a repeated request took 91 ms. Dune recovered using persisted Google results during an upstream failure. The development server is running with the final changes. Google availability itself remains outside application control.

## Feed pages and owned comments — 2026-10-22

Added cursor-based 20-post pages to Home, Community and profile walls, with server-side following/review filters and stable timestamp/ID ordering. Pages respect existing reader controls and account suspensions. Social refreshes preserve loaded page depth; failed requests retain visible content and offer retry.

Added own-comment editing and confirmed deletion through shared dialogs. Server checks ownership, interaction permissions and original-body conflicts; deletion cascades notifications. No schema change is required.

Verification: 15 SQLite tests passed (one hosted-only migration skipped); all 16 PostgreSQL tests passed, including stable cursor ties/new arrivals, filters, ownership, edit conflicts and blocked edits. The dedicated browser suite passed pagination on home/profile, retained older posts after likes/edits, edit/delete/cancel flows and 1440/390/320px dialog layouts, with zero runtime errors. Production build, formatting and strict UI audit passed. The development server was restarted and confirmed healthy on PostgreSQL.

The full browser regression suite also passed, including all 66 route/viewport layout checks and zero runtime errors. Its accelerated multi-reader traffic now pauses before the list flows when the real request allowance is low; application rate limits are unchanged.

## Complete notification history — 2026-10-22

Replaced the latest-100 inbox cap with 20-item cursor pages. Unread filtering now queries the full recipient history before paging, so old unread entries are reachable. Existing hidden-reader and recipient-only permissions apply to every page; new notifications do not shift older cursor results. No database migration is needed.

Extracted useCursorPages and ActivityMore from feed paging for shared cancellation, explicit retry, preserved page depth after refresh/mutations, and 15-second request timeouts. Inbox state resets when the signed-in account changes. Read failures keep visible rows; mark-read/all still waits for server confirmation. Private filters remain transient. The established paper/sage inbox styling is unchanged.

Verification: 16 SQLite tests passed (one hosted-only migration skip); all 17 PostgreSQL tests passed. A new isolated inbox browser suite passed initial-load/older-page failures and retry, bulk-write failure recovery, unread history beyond 100 entries, all 125 fixture entries reachable, retained page depth, and 1440/390/320px layouts. The 320px screenshot was visually inspected. The social safety browser suite and full browser suite passed, including 66 route/viewport checks and zero runtime errors. Typecheck, production build and strict UI audit passed. The local Supabase development server was restarted.

## Book languages and edition selection — 2026-10-22

Added shared language controls to Discover, the catalogue and author views. Google requests use langRestrict and validate returned volume language; language-aware cache keys, coalescing and local fallback preserve the filter. Legacy unfiltered cache results remain available. Stored metadata language is filtered before catalogue pagination on both SQLite and PostgreSQL.

Added paginated edition comparison on book pages, with language/page URL persistence, explicit Google lookup, matching title/author grouping and selection links. Details include publisher, publication date, human-readable language, pages, ISBN and known e-book status. Physical binding is not inferred. This is conservative title/author matching rather than a translation work graph; differently titled translations remain separate. Selecting/saving a volume preserves other editions' notes and progress. Existing recommendation edition deduplication remains in place. No schema migration is required.

Verification: typecheck/build/formatting and strict UI audit passed; 17 SQLite tests passed with one hosted-only skip, and all 18 PostgreSQL tests passed. Dedicated edition browser tests passed grouping/pagination, language persistence, saving a new edition while preserving the original record, retry after a failed list request, empty results, Google import, author/catalogue/live-search filters, and 1440/390/320px layouts with zero runtime errors. The narrow screenshot was inspected. A live Piranesi search restricted to English returned 14 Google Books results without warnings; sample metadata reported en. The Supabase development server was restarted.

Final full browser regression passed, including 66 route/viewport checks and zero runtime errors. Final SQLite/PostgreSQL focused checks also verified legacy cache compatibility and isolation of unknown-author titles. Final build and strict UI audit passed; the development server runs the final changes.

## Profile management space — 27 October 2026

Added a dedicated Profile & account section to the self profile, grouping muted/blocked reader controls, administrator-only community reports and account settings as labelled navigation cards. Moved profile image controls out of the closed profile/goal editor into visible upload cards with current portrait/banner previews. Existing authenticated upload, replace, remove, validation and persistence behavior is reused. Text/bio/goal editing, public identity and the overlapping portrait/banner layout remain intact.

The focused browser check passed for both image uploads, reload persistence, invalid-file recovery, all three navigation targets, administrator-only reports visibility, absence from Home, and 1440/390/320px layouts with zero runtime errors. Visual inspection caught and fixed a shared avatar-class collision and narrow file-input text. Production build and typecheck passed; 17 SQLite tests passed with the hosted-only migration test skipped. Strict UI audit passed. The local Supabase development server is running.

The complete browser regression suite also passed, including 66 route/viewport checks and zero runtime errors.

## Google Books recovery and metadata preservation — 28 October 2026

Reproduced intermittent upstream 503 responses, structured title/author searches returning zero results, and sparse search metadata. Added bounded retry with a simpler list request, structured-query recovery that retains title/author/ISBN and language constraints, and field-aware local fallback. ACOTAR expands to A Court of Thorns and Roses. When a multiword search finds an exact title, unrelated broad text matches are excluded. Search cache version advanced to v3.

Sparse responses now merge with existing metadata for the same provider volume, retaining author indexes and identifiers. PostgreSQL advisory locks in consistent order protect concurrent merges. Incomplete book pages attempt a bounded individual-volume lookup; requests coalesce and attempts are throttled for one hour per server instance (bounded to 500 entries). Failures leave the saved book readable. Cached search results read enriched saved book records. Missing provider data is not invented or copied between editions.

Live app checks returned ACOTAR and A Little Life successfully; the latter no longer included Little Dorrit or The Pleasures of Life. Google still intermittently returns 503s and some individual volume records also lack descriptions. Regression coverage includes sparse overwrites, detail identity/coalescing, query fallback, constraints, acronym expansion and title relevance. SQLite: 18 passed, one hosted-only test skipped; build/typecheck passed.
Final verification: all three focused PostgreSQL tests passed. Live browser checks passed book details, author navigation/loading, six responsive layout checks and zero runtime errors. The local development server is running the updated integration.

## Discovery ranking and edition comparison — 28 October 2026

Expanded search penalties for companion titles, colouring books, reading guides and derivative discussions; collections/boxed sets receive a smaller penalty. Explicit searches for these types remain supported. Recommendation quality excludes the derivative categories. Ranking fixtures cover A Court of Thorns and Roses, A Little Life, Dune and Piranesi, including author and companion searches.

Edition comparison now includes shared cover previews, explicit missing ISBN values, and guidance to compare the ISBN with the reader's copy. Choosing an edition retains the language filter. Google import failures have separate feedback from list failures and leave saved editions available. Imports abort on navigation/filter changes. Discover has a keyboard-accessible retry action, a 15-second request deadline and IME composition protection.

Verification: 19 SQLite tests passed with one hosted-only skip; typecheck, build, formatter and strict UI audit passed. Dedicated edition browser checks passed failed-import recovery, keyboard search retry, language retention, edition save without loss of original notes/progress, empty and paginated results, and 1440/390/320px layouts with zero runtime errors. The 320px screenshot was inspected.
Final checks: the full browser regression passed all flows, including 66 route/viewport checks and zero runtime errors. Live ACOTAR and A Little Life searches returned successfully with the new ranking. The updated development server is running.

## Reader matching and Following discovery — 28 October 2026

Added public-review-based reader ranking with shared-book and shared-genre explanations. Deduplicates repeated editions by title/credited author, uses no private reading data, and applies safety exclusions before the result limit. Existing follow controls remain available. Added a following-directory link and distinct empty/quiet Following states.

Verification: 20 SQLite tests passed, one hosted-only migration test skipped. Three focused PostgreSQL tests passed covering reader matching, feed pagination and notification privacy. Dedicated two-account browser checks passed match explanations, follow visibility, mute/reverse-block exclusion, directory navigation and 1440/390/320px layouts. Inspected the narrow screenshot. Build/typecheck and strict UI audit passed.
Final verification: full browser regression passed, including 66 route/viewport checks, account/social flows and zero runtime errors. Final formatting and strict audit passed. The local development server runs the updated implementation.


## 10 November 2026 — Lists and complete comment history

Replaced the list browser's fixed 100-result response with numbered 20-item pages and owner filtering, preserving visibility/safety before counting. Added shared numbered-page loading/navigation, a searchable full saved-catalogue picker, and book-page Add to list/new-list creation. Atomic additions lock the owner list, preserve order, enforce capacity and accept duplicate retries without duplication. Dirty list editors use the shared dialog's opt-in discard protection.

Post hydration now includes the latest 20 visible notes, total and a cursor; the new history endpoint and shared PostCard load all older notes with retry and cancellation. Timestamp/ID cursors retain PostgreSQL precision and survive deleted anchors. Existing spoilers and edit/delete/report actions remain.

Validation: API suite 22 passed, one hosted migration check skipped; focused PostgreSQL tests (curated lists, feed comments, new list/history milestone) 3 passed. Build/typecheck and strict UI audit passed. Focused browser checks cover URL/reload, catalogue beyond the initial batch, failed-save retry, 125-note history, unsaved edits and 1440/390/320px layouts. Full browser suite passed with 66 route/viewport checks. No deployment or commit/push was performed.


## 10 November 2026 — Google Books request and cache optimization

Added five-field partial search responses, gzip request headers, 10-result book-only pages and startIndex-aware caches. Explicitly omitting fields selects projection=lite. Search fallback never removes printType=books. Cache reads precede provider configuration checks. Added checksum-validated getBookByISBN and GET /api/books/isbn/:isbn with local verified-identifier lookup before provider access. Compact responses receive detail enrichment only when language/ISBN validation requires metadata; normal detail enrichment and metadata-preserving merges remain.

Verification: 23 API/SQLite tests passed, one hosted-only migration check skipped; two focused PostgreSQL tests passed for language/edition isolation and optimized requests/ISBN cache-aside. Tests include response fields/headers, pagination/cache isolation, missing API key on hits, concurrent misses, malformed cache, checksum errors, empty partial results, timeout and non-retried 429. Typecheck/production build passed. No live Google latency or payload-size improvement is claimed from mocked-provider tests.

Edition browser checks also passed: paging, language reload/filtering, distinct-edition saves, desktop/mobile layouts and live-search language. Restarted the local development server with the updated integration.


## 12 November 2026 — Watercolor visuals, transitions and administrator identity

Added local grain and book/plant SVG artwork to page materials, the reading-circle introduction and default profile banner. Added finite route/panel arrivals and cover-hover lift with reduced-motion support. ReaderName now keeps a compact accessible admin check beside names across profiles, posts, recommendations and directory results. The directory now includes public profile-image versions and server-derived admin status, and renders uploaded portraits. Added a direct community-list link.

Resolved the requested existing @alexginchev account to its immutable ID and added it to the ignored local server configuration, preserving other configured administrators. Restarted the server and verified its public profile returns isAdmin=true. This configuration is intentionally not committed; no username-based role bypass was introduced.

Validation: production build/typecheck, formatting and strict UI audit passed; 23 API tests passed with one hosted migration test skipped. Corrected the directory image query to reuse the existing mediaColumns owner, then reran the full browser suite successfully (66 layout checks). Focused watercolor tests passed community/profile/directory layouts at 1477/390/320px, badge placement, reduced motion and navigation. Profile-management checks passed uploads, invalid-upload recovery, admin-only links and reload persistence. Reviewed screenshots and removed banner copy that overlapped decorative art on narrow screens.

## 12 November 2026 — Reading-first signed-in home

Home now opens with CurrentlyReading for authenticated readers, retaining the illustrated welcome only for visitors. Reused the existing progress dialog and private-by-default sharing behavior. Added a useful empty state linking to discovery and saved shelves, reduced the preference prompt to an optional inline reminder, and hide the recommendations section when there are no picks.

Verification: production build/typecheck, formatting and strict UI audit passed; API tests passed 23 checks with one hosted migration check skipped. The full browser suite passed 66 route/viewport checks. The focused Home test covers guest separation, empty-state navigation, reading-first content order, 1477/390/320px layouts and private progress failure/retry/reload. Reviewed desktop/mobile screenshots. Started the local development server for review.

## 11 November 2026 — Discover and home design refinement

Extended the shared collection layout to Discover with full-width covers and a compact search/language toolbar. Simplified home recommendations to a cover-led section with one browse link, removed the unrelated quotation from the rotating book pick, and removed empty feed-pagination spacing. Existing provider search states, language filters, card navigation and dismissal behavior remain. Recorded further design priorities in DESIGN.md: useful signed-in home, verified author identity, reliable work/edition grouping and compact mobile secondary navigation.

Validation: production build/typecheck, formatting and strict UI audit passed. API tests: 23 passed, one hosted migration check skipped. Full browser suite passed 66 route/viewport checks with no runtime errors. Focused identity tests verified home/Discover at 1477/390/320px and failed-cover fallback; inline search regression passed. Reviewed screenshots at desktop and narrow mobile sizes.

## 11 November 2026 — Author profiles and library redesign

Replaced the author page's stacked panels with a full-width profile header, decorative initials and a cover-led bibliography. Filters and sorting live inside Catalog's native disclosure, with committed-filter indication and preserved URL behavior. About this profile retains the name-collision limitation without inventing biographies or verified portraits. Author import and catalogue requests now cancel on navigation and have bounded timeouts.

Personal shelves use the same compact collection grid, with underlined status navigation, a clear New shelf action, smaller search/sort controls and consistent book widths even for a single item. Both routes omit unrelated right-rail widgets. Shared BookCard navigation and private shelf behavior remain unchanged.

Verification: build/typecheck and formatting passed; 23 API tests passed with one hosted migration check skipped. Full browser suite passed 66 route/viewport checks with no runtime errors. Focused collection checks passed at 1477/390/320px, including filter disclosure keyboard operation, sort/filter URL reload, empty library/catalogue and error retry. Edition browser checks passed including language filters and imports. Strict UI audit reported no findings. Reviewed desktop/mobile screenshots. GitHub publication was requested for the accumulated application changes; environment secrets, local databases and test screenshots remain excluded by .gitignore.

## 11 November 2026 — Supplied logo and inline header search

Replaced the previous custom mark with the user's download.svg, shared across desktop, mobile and footer. Derived a looping loader from the same book/bookmark paths, preserving the artwork and reduced-motion support. Shared loading states cover startup, book opening, Discover and header search.

Header search now opens an anchored results panel without navigating on input. Added debouncing, IME protection, cancellation, bounded requests, language filtering, ten-result pagination, cover/title/author links, keyboard navigation, dismiss/reopen behavior and empty/error retry states. Discover retains its independent search.

Validation: typecheck, production build, formatting and strict UI audit passed; 23 API tests passed with one hosted migration test skipped. Focused inline-search browser checks passed at 1477/390/320px. The full browser suite passed all 66 route/viewport checks with no runtime errors. Visually inspected desktop/mobile results and the loader. Started the development server and confirmed HTTP 200 for health and both branding assets. No commit, push or public deployment.

## 10 November 2026 — Covers, branding and site footer

Addressed all four browser comments: downloaded and visually verified real jackets for all six starter books; set local cover paths and backfilled null covers without replacing existing images. Added shared book-spine BrandMark for desktop/mobile, removed the social-club strapline and generic sidebar slogan, and moved copyright into a site-wide footer below the content grid. Added public #terms/#cookies pages following the user's request for general terms and cookie information, grounded in existing account/privacy/moderation and session behavior.

Verification: 23 API tests passed (one hosted migration test skipped), typecheck/build/format and strict UI audit passed. Focused browser checks verified actual loaded image dimensions, failed-image fallbacks, footer links/reload, keyboard logo and 1477/390/320px layouts. Full browser suite passed, including 66 route/viewport checks, with no runtime errors. Restarted the development server and confirmed all six real cover assets on the running app. Cover provenance is recorded in public/covers/SOURCES.md. No commit, push or public deployment.
