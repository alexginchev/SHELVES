# Shelves remaining work

Reconciled on 1 November 2026 against the master plan, implementation history, current routes, schemas and React views. The workspace master plan is byte-identical to the supplied Downloads copy. This is the current checklist; IMPLEMENTATION.md remains a chronological log, whose early pending-work statements can be superseded by later milestones.

The application is functional but the full master plan is not complete. “Implemented” below describes code present, not a claim that every production condition has been verified.

## Accepted boundaries

- Preserve Shelves and the supplied watercolor, paper-and-sage design in DESIGN.md.
- App-managed cookie sessions and Supabase PostgreSQL are the current architecture. Supabase Auth, Storage, Realtime, proposed libraries and example route names are not prerequisites for completing equivalent behavior.
- Private ratings, journals, shelves and preferences stay private. Public shelves, profile statistics or automatic activity publication require explicit visibility design; never expose existing records by default.
- Email verification, password recovery and transactional email remain explicitly deferred. Do not install a provider as part of another milestone.
- Separate editions retain their own records. Conservative title/credited-author grouping is not a translation/work identity system.

## Feature reconciliation

| Plan sections | Implemented and source evidence | Remaining work |
| --- | --- | --- |
| 5, 64, 113: accounts | Registration, login/logout, seven-day sessions, password change, session revocation, account deletion (`server/auth.ts`, `server/account.ts`, `src/AccountSettings.tsx`) | Reserved username protection; registration password confirmation and terms agreement; optional remember-session choice. Username maximum is currently 24, versus the plan's 30. Email workflows remain deferred. |
| 6: onboarding | Private genre choices with skip/reset (`src/ReadingPreferences.tsx`) | Favorite-book selection, favorite authors and a connected profile → interests → books → readers flow. Reader suggestions exist separately. |
| 9–10, 36: search | Google Books import/recovery, local fallback, title/author/ISBN query handling, language isolation, paginated local catalogue (`server/google-books.ts`, `server/catalog.ts`, `src/Catalog.tsx`) | Unified book/author/reader/list search; rating, format and page-count filters; popularity/review-count sorting. Current provider imports search results immediately, rather than only after a save. No active secondary-provider recovery pipeline. |
| 11, 14–16, 65–67: book pages/reviews | Metadata, covers, public averages, one public review per reader/edition, spoilers, edit/delete, likes and flat comments (`src/BookPage.tsx`, `server/services.ts`) | Review pagination and sorting/filtering, rating distribution, related books, public friends-review section, direct Add to list. Public rating currently requires a review; private star ratings do not count publicly. Review titles, formatting and profile pins are absent. |
| 12–13, 83: editions/authors | Edition comparison, language preservation, name-based author catalogue and import (`server/editions.ts`, `src/AuthorPage.tsx`) | Stable work/author identities, translated-work linkage, series, author biographies/photos and follows; safe duplicate review/merge tooling. Never infer binding or invent absent metadata. |
| 18–20, 24–25: reading | Want to read, reading, finished and DNF; page progress, optional public sharing, private shelves/journal, annual goal and summary totals (`shared/types.ts`, `server/reading-progress.ts`, `server/services.ts`) | Paused status, percentage input, reading-session/history model and rereads; monthly charts, rating/genre/author/format/language breakdowns and streaks. Public/follower-only shelves, descriptions and covers are absent. |
| 21, 57: lists | Ordered books, private/public visibility, share links, owner controls and paginated discussion (`server/lists.ts`, `server/list-comments.ts`, `src/Lists.tsx`) | Browse pagination and server-side own-list filtering; full-catalogue picker; likes, artwork, ranked/unranked mode and per-book notes. List browsing currently stops at 100. |
| 22–23, 46: profiles | Photo/banner, overlapping portrait, bio, public wall, follower directories and private management section (`src/ProfileIdentity.tsx`, `src/ReaderPage.tsx`) | Pinned favorite books, website/location and dedicated public list/review sections. Public reading/stats/genre sections need opt-in visibility. |
| 8, 16–17, 26–27, 33, 104: community | Cursor-paged feeds, follows, public-review reader matching, post/review likes, own-comment edit/delete, safety exclusions (`src/PagedFeed.tsx`, `server/services.ts`) | Comment history beyond 100, one-level replies, comment likes, list-comment editing, ranked For You feed and reading-activity filter. No general activity-event model. Reader matching does not yet compare full rating patterns or use follow-graph similarity. |
| 28–32, 105, 131: discovery | Personal genre/author weights, public followed-reader reviews, thresholded community signal, dismissal, quality checks, author/genre diversity and edition deduplication (`server/recommendations.ts`) | Similar-reader book recommendations, Because you loved sections, time-decayed trending, hidden gems, genre landing pages, community tags and editorial Explore modules. More/less-like-this feedback, event/version tracking, evaluation and candidate-generation scaling remain. Reader matching alone is not collaborative book recommendation. |
| 34, 73, 115: notifications | Recipient-private follow/like/comment history, full-history unread filter, cursor pages and read actions (`src/Notifications.tsx`, `server/services.ts`) | Preferences and new event types: replies, mentions, list likes, followed reviews and goal completion. Polling exists; realtime push does not. |
| 3, 61–62, 74, 79–82, 107, 116–117: moderation | Mute/block, reports including list comments, admin content removal, suspension/restoration and action history (`server/social-safety.ts`, `src/AdminAccounts.tsx`) | Separate moderator roles, role assignment, warnings/timed suspensions, dashboard analytics, book/author editing, duplicate merging and featured-content management. Review aggregates currently include suspended authors even though visible feeds exclude them; define and test the aggregate policy. |
| 112–115: settings/data | Account security, profile management, private genres and muted/blocked reader controls | User-owned JSON/CSV export, notification preferences, privacy settings and appearance preferences. |
| 38–49, 85–93, 119–124: experience | Responsive paper/sage shell, native dialogs/selects, validation, retry/empty states, cover fallback and reduced-motion support | Comprehensive assistive-technology/contrast audit, route splitting and performance budgets, light/dark/system preference, richer guest landing/discovery. Hash URLs limit per-page SEO/social previews. Preserve existing spacing and clipping regressions throughout. |

## Completed priority: complete book-review browsing — 2 November 2026

The former 50-review cap has been replaced by 20-item cursor pages, Recent/Most appreciated sorting and a Following filter. The feature table above records the 1 November baseline; book-review pagination and these controls are now implemented.

- [x] Add validated server pagination, retaining independent access to the viewer's own review.
- [x] Add Recent/Most appreciated and Following controls with URL state and pre-pagination safety filters.
- [x] Reuse shared cursor loading and activity footer with preserved refresh depth and retry recovery.
- [x] Preserve spoilers, ownership and private/public separation.
- [x] Add API and browser coverage with 65 reviews, tied timestamps/ranks, filter changes, anchor deletion, unauthenticated access and failures.
- [x] Verify 1440/390/320px layout and keyboard controls.

Suggested sequence after the completed lists milestone: public-review-based similar-reader book recommendations; pinned favorite books/onboarding; then richer statistics and remaining administration. Production preparation can proceed alongside these features without selecting a paid host or publishing changes implicitly.

## Completed priority: lists and comment history — 10 November 2026

- [x] Paginated list browsing and server-side My lists filtering, with URL state.
- [x] Full saved-catalogue book picker with search, clear, pages and preserved selection.
- [x] Add to list from book pages, including a prefilled new-list path and atomic/idempotent additions.
- [x] Complete post-comment history beyond 100, in 20-note cursor pages with safety exclusions and retry.
- [x] Preserved private defaults, ordering, 50-book capacity, spoilers and ownership checks.
- [x] API coverage on SQLite/PostgreSQL and focused responsive browser coverage.

The baseline feature table above predates this milestone. List likes/artwork/ranked mode/per-book notes and comment replies/likes remain later work. Next recommended feature: public-review-based similar-reader book recommendations.

## Deployment readiness

| Area | Current evidence | Remaining acceptance work |
| --- | --- | --- |
| Hosting/runtime | `server/start.ts` serves the build, requires HTTPS PUBLIC_ORIGIN in production, supports HOST/PORT and SIGTERM | Choose host/domain, configure secrets, restart policy, TLS/proxy topology and bounded shutdown; exercise production startup and rollback. No deployment configuration was found. |
| Health/monitoring | `/api/health` returns status, engine and version | It does not query the database. Add dependency readiness, request IDs, sanitized structured logs, provider failure/latency metrics and actionable alerts. |
| Backups | SQLite pre-migration backup and verified import receipts | Hosted backup retention and restore access have not been verified. Document and rehearse PostgreSQL restore, including profile-image data, with recovery targets. |
| Security | Password hashing, hashed sessions, Secure production cookie, origin/header guard, validation, server ownership checks, private-schema RLS and basic response headers | Validate actual proxy/rate-limit behavior; current limiter storage is process-local and trust-proxy topology is not configured. Review CSP/HSTS delivery, dependency risk and production configuration. This audit is not a security certification. |
| Performance | Indexed queries and pagination exist for feeds, inbox, catalogue and directories | Feed hydration performs per-post likes/comments queries; recommendation ranking considers the catalogue before LIMIT 500 and loads all metadata. Measure realistic PostgreSQL latency/load, reduce these costs, and bound client payloads. |
| Release | Local automated API/browser suites; many existing uncommitted changes | CI, reproducible release verification, secret-safe staging review, migrations/rollback runbook and a reviewed commit/push. No hosted deployment was verified. |

## Explicit later scope

- [ ] Messaging, clubs/groups, quote collections, Goodreads import, annotations, audiobook/e-reader integrations and native mobile app (35, 108–111).
- [ ] Command search, localization and richer public-page SEO (37, 92–93).
- [ ] Recommendation embeddings/pgvector, learned ranking and experimentation (131 later phases). Rule-based personalization remains the immediate foundation.

## Verification and publication snapshot

- `npm run check` passed. `npm test`: 20 passed, one hosted-only migration test skipped. Initial sandbox loopback failures were resolved by running with network access; no application fix was needed.
- Restarted `npm run dev`; the health endpoint reports PostgreSQL, version 0.2.0. Initial sandbox DNS failure was not a database configuration fault.
- Live English-language searches returned Google Books results without fallback warnings: ACOTAR (10 results, 7.3s), A Little Life (1, 2.1s), `intitle:Dune inauthor:Frank Herbert` (17, 8.7s), and Piranesi (9, 4.3s). These are single-request observations, not a reliability benchmark. The first results were the expected titles/authors, but ACOTAR included an edition credited to a corporation, Dune included notebooks/collections, and Piranesi included a different author's same-title work. Add targeted relevance fixtures and verify provider authorship before tightening exclusions; title-only queries can legitimately be ambiguous. Metadata completeness was not established by these searches.
- GitHub `origin/main` was checked with `git ls-remote`: `2a2e9a8423c088a8ef4e45e93d77b22a884f27a0`, matching local HEAD. The later milestones remain uncommitted/unpublished. No commit or push was made during reconciliation.
- Browser and hosted test successes in IMPLEMENTATION.md are historical evidence; those full suites were not rerun for this documentation-only reconciliation.
