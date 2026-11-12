# Shelves UX Contract

## Lists and complete note history — 10 November 2026

Lists now use server-filtered 20-item numbered pages. `scope=all|mine` and `page` persist in the hash URL; changing scope resets to page one, and the server clamps out-of-range pages after deletions. Visibility and reader safety apply before counting or limiting. `GET /api/lists` returns `{items,total,page,pages}`. NumberedPages owns the cancellable, timed request and shared previous/next controls for list browsing, the catalogue picker and Add to list. These pages reflect live ordering rather than a frozen snapshot.

ListBookPicker searches the entire saved catalogue, with 300 ms debounce, IME protection, immediate clear/Enter, stale-response protection and catalogue pages. Its query and page remain transient because they belong to an unsaved modal draft. Selected books remain visible while searching; existing 50-book and unique-book rules remain. Lists reuse the established paper surfaces, native visibility select, Form and Dialog. Dirty list drafts prompt before dialog dismissal and browser unload; inputs survive failed saves. The modal keeps ordinary in-app navigation outside the editing flow.

BookPage opens AddToList for signed-in readers, or authentication for guests. Only owned lists are offered, with private/public labels, paging, full/already-added states, retry and a create-new-list path prefilled with the book. `POST /api/lists/:id/books` locks the owner list and appends atomically; retries are idempotent, foreign lists are rejected, and existing entries/order/visibility are preserved. Success appears only after server confirmation. Full-list editing retains the established last-write-wins contract.

PostCard initially receives the latest 20 visible notes and their total, then loads older notes with timestamp/ID cursors. PostgreSQL timestamp precision is preserved in cursors. Notes display oldest-to-newest within the loaded range; older pages prepend. Failed loads retain current notes and the cursor, with retry. Prop/viewer refresh cancels older requests and returns to the newest 20 notes. Safety exclusions precede paging, post visibility is rechecked on every request, and notes remain inside spoiler disclosures. List discussions retain their existing numbered pagination.

Evidence: tests/lists-browser.cjs covers persisted list paging, full-catalogue selection, no-results/clear, narrow layouts, unsaved-close recovery, add failure/retry and 125-note history. The list pagination API test covers owner/privacy boundaries, ties, deleted cursor anchors, duplicates, capacity and concurrent additions on SQLite and PostgreSQL.

## Book-card navigation and fast details — 2 November 2026

BookCard and the featured book pick use native links with a stretched hit area covering the card. There is no separate View book button. Keyboard focus outlines the card; modified clicks retain native new-tab behavior. Not interested remains a separate button above the link hit area and never opens the book.

BookPage requests saved details with `cached=1` first. Incomplete Google volumes may then enrich through the existing bounded lookup, without blocking the readable page. Navigation aborts pending detail work and generation checks reject late responses. Failed optional enrichment preserves saved metadata. Catalogue count, requested page and genre queries execute concurrently, with a corrective page query only when a requested page needs clamping.

## Complete book-review browsing — 2 November 2026

BookPage loads public reviews in 20-item cursor pages using the shared useCursorPages and ActivityMore owners. Native Review order and Review readers selects use the existing library-tools layout. Recent and Most appreciated sorting and Everyone/Following filtering persist in `reviewSort`/`reviewFilter` hash parameters without replacing edition parameters. Loaded page depth is transient, resets when the book/viewer/filter changes, and is retained across refreshes and mutations.

The review endpoint validates cursors against book, sort and filter. Sort ties use descending creation time and ID; appreciation counts lead the popular sort. Counts are live, so concurrent appreciations may move reviews across page boundaries; Refresh reviews rebuilds the loaded range in current order. This is not a frozen ranking snapshot. Safety exclusions and Following apply before limiting results. Following includes followed readers only, with a separate own-review result preserving the owner's edit action regardless of filtering or page depth. Guests opening Following links see a sign-in action.

Loading, retry, empty and end states stay in the review panel. Failed refreshes retain visible reviews and retry the loaded range. Spoilers and owner controls reuse PostCard and existing dialogs; private library ratings/notes are never queried. The write-review action waits for own-review retrieval to avoid opening an empty editor over an existing review. Browser evidence: tests/reviews-browser.cjs; server/SQLite/PostgreSQL evidence: the book-review paging test in tests/api.test.ts.

## Active application

React/TypeScript owns rendering. Express owns validation, authorization, persistence and recommendations. Supabase PostgreSQL is the configured source of truth; SQLite remains an explicit offline option. The browser-only implementation is archived under prototype/. English UI uses browser-local display dates; stored timestamps use UTC.

## Canonical UI map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Navigation | src/App.tsx hash views | Shared route state and this contract | Sidebar, bottom bar, secondary links | Browser flow and reload |
| Toast | App notice state | One live region; success follows server confirmation | Success/info | Browser flow |
| Dialog | src/components.tsx Dialog | Native modal; Escape, trapped focus, close button, focus restoration | Edit, create, confirmed delete | Escape check |
| Form | src/components.tsx Form, src/forms.tsx | Native constraints with app-owned inline feedback, first-invalid focus/association, preserved inputs, disabled pending submit; no browser validation bubbles | Create/edit | Account/reading flow |
| Select/Listbox | Native select in forms | Platform owns popup geometry and keyboard behavior | Native | Browser flow |
| CRUD | Shared Dialog/Form and owner-scoped server routes | Create/edit/delete/cancel refresh after confirmation; delete shelf keeps books and notes | Private shelves, public posts/reviews | Two-account API/browser flow |
| Search | App query effect and server searchBooks | Debounced/cancelled requests; loading, empty, error and provider-fallback states | Remote catalog, local library | Live search/provider tests |
| Library and shelves | server/services.ts | Owner-only records; atomic reading/membership changes; foreign shelf rejected | Offline SQLite, PostgreSQL | API security tests |
| Community | server app/feed service | Posts/comments public; deleting only by owner; likes/follows idempotent | Feed, public profiles, book pages | Two-account tests |
| Scrollbar | src/app.css html | Stable page gutter | Page, bounded sidebar middle and dialog | Desktop/mobile width |

## Data visibility

Reading records, ratings in private records, custom shelves, private reviews, and statistics are private to the authenticated owner. Display names, usernames, bios, posts, and comments are public. The composer explicitly describes public publication. Saving a private review does not publish a post. Personal profile display-name/bio changes affect reader discovery.

## Flow behavior

- Authentication: registration/login creates a server session in an HttpOnly cookie. Logout invalidates that token. Session cookies last seven days. No passwords/tokens are placed in localStorage.
- Reading updates: user opens a book, edits status/progress/rating/private review/shelves, submits, waits for server confirmation, and returns to the current view with refreshed counts. Invalid values retain the dialog and input.
- Finishing: the backend stores a completion timestamp and sets the page to the known book length. Moving back to another status clears completion. Annual totals derive from current finished records with completion timestamps in the current UTC year.
- Removing a reading record: the user confirms removal of the book and private notes. Related shelf membership is removed transactionally. Deletion failures keep the dialog open.
- Shelves: owner creates/renames a name; duplicates are rejected case-insensitively. Deletion requires confirmation and removes only the shelf and its memberships; library books and notes remain. Custom membership cannot be assigned across accounts. The selected shelf is stored in the hash URL and survives reload/back. Local title/author search and sort operate on that shelf.
- Posts: create explicitly public text; likes/comments/follows refresh after server confirmation. Deleting a post requires confirmation and removes related likes/comments. Private reviews do not appear in the public feed.
- Recommendations: account taste uses genre/author affinity and ratings. Library and dismissed books are excluded. Guest discovery uses the starter/imported catalog without fabricated personal signals.
- Search: provider request timeout/error yields a clear error, or matching cached books plus a fallback notice. Remote URLs and metadata IDs are validated. Clearing the Discover search restores discovery recommendations. Header search is independent and stays on the current route.

## Async and failure states

Initial load has a status panel. API errors show retry feedback. Search work is cancelled when query/view changes; older snapshot requests cannot replace newer state. Submissions disable duplicate actions and show pending text. Input remains when the server rejects a form. Mutations are pessimistic. Network requests time out. Data is refetched after confirmed writes.

Initial reading/profile edits use last-write-wins; conflict detection and realtime updates are future work. The feed, catalog and comments have documented bounded result sets. Main view and selected shelf hashes are bookmarkable; library text search and sorting remain transient.

## Responsive and accessibility

Preserve the ZIP's three-column desktop, tablet fallback, and mobile bottom navigation. The active app imports src/design.css, which layers Tailwind theme, legacy app.css, shared components and utilities. Existing app.css tokens and materials remain canonical; no duplicate reset is introduced. Cards retain inner padding even in empty states; grids adapt to available content width. Navigation uses a bounded scrolling middle section, with brand and profile reachable. Below 861px the bottom bar and secondary links retain access to every main view. Dialogs scroll within the viewport; close buttons occupy their own row. Forms have labeled fields; textareas grow to a bounded height and then scroll. Decorative cover text may be abbreviated, with full titles/authors in adjacent readable text. User-supplied text wraps. The application targets WCAG 2.2 AA but has not undergone a comprehensive assistive-technology audit.

## Public reader profiles

`#reader/:id` is shareable and survives reload. Posts, review authors and reader discovery link to it. The server exposes only public name, username, bio, follower/following counts and the latest 50 public posts. No email, reading statistics, private records or shelves are included. Follow/unfollow requires an account and refreshes server state. Self profiles link to private profile settings. Unavailable profiles retain navigation and offer retry.

## Notifications — 17 October 2026

`#notifications` loads the recipient's notification history in 20-item cursor pages for new follows, appreciations, and comments. The total unread count includes older items, and the Unread filter queries the full history on the server. All/unread filters, refresh, individual read actions, and mark-all-read use server state. Load older notifications reveals subsequent pages. Refresh and read actions retain the loaded page depth; failed reads retain visible rows with an explicit retry. Filtering resets pages and remains transient within this private inbox. Opening an item marks it read before navigating to `#reader/:id` or the exact public conversation at `#post/:id`. Spoiler review content stays behind the shared PostCard disclosure. Notification previews contain no post/comment body.

The header badge checks the unread total every 30 seconds while visible and on focus; the inbox has an explicit refresh action. This milestone uses in-app activity only. Creation shares a database transaction with the originating action. Retries of an existing like/follow do not duplicate events, self-actions do not notify, undoing a like/follow removes its notification, and deleting a post/comment removes related notifications. Inbox reads and read mutations are recipient-only; RLS and revoked client grants cover the new table.

## Public book pages and reviews

`#book/:id` is a shareable page and survives reload. `src/BookPage.tsx` owns book information, public reviews, public averages, and their dialogs; it reuses the canonical `Dialog` and `PostCard`. Reading controls open the existing private `BookDialog`.

Each reader has one public review per book. PUT updates that review without duplicating it. Public rating averages count only published review ratings. Private reading ratings/reviews never contribute. Spoiler content and notes are enclosed in a native collapsed details element, including in the feed. The reader explicitly reveals spoilers. Edit/delete are owner-only; deleting a public review removes its likes and comments while preserving private records.

The application refreshes through `/api/snapshot` instead of eight individual HTTP requests. This keeps refreshes below normal rate-limit usage and returns a consistently owner-scoped state. Book page work invalidates stale responses during navigation.

Before an existing SQLite database receives a new schema migration, its account data is backed up using VACUUM INTO. Backups remain in the ignored data directory.

## Cloud persistence — 14 October 2026

The active backend uses `DATABASE_ENGINE=postgres` and the private `shelves` schema. `server/store.ts` owns async query/transaction behavior for PostgreSQL and offline SQLite; `server/postgres.ts` owns cloud schema migration. The Express server retains the existing scrypt/opaque-cookie authentication model and resolves each API request against persisted cloud sessions. Supabase Auth is not activated by this migration.

The trusted server credential is never sent to the browser. Anonymous and Supabase authenticated database roles have no access to the private schema; RLS is enabled with no browser policies. Existing API ownership and public/private UI boundaries remain the same. Security tests exercise both account isolation through the API and denied direct client-role access.

A database switch requires an explicit engine setting. Cloud failures never silently fall back to local data. Import creates a consistent backup and verifies counts/content before commit. Existing nonempty cloud data is protected; rerunning an identical import leaves newer cloud edits intact. Private reviews, shelf membership and server sessions are preserved. PostgreSQL queries normalize dates to UTC and numeric aggregate results to numbers.

## Curated book lists — 17 October 2026

`#lists` browses the latest 100 public or owner-visible collections; signed-in readers can filter that result to their own lists. `#list/:id` preserves the selected collection across reload and supports public sharing. New lists default to private. Only the owner can edit, reorder, remove books, change visibility or delete a list. Deletion requires confirmation and preserves personal library records. Private and missing lists return the same 404 to other readers and guests. Public lists expose the curator's display name and ordered catalogue books, never private reading records.

The shared Dialog/Form owns the editor, labeled native visibility select, validation, pending state and preserved drafts on failure. The picker searches books already loaded in the catalogue or personal library; Discover can supply additional saved books. Lists allow up to 50 unique books, titles of 100 characters and descriptions of 1,000 characters. Empty drafts are allowed. Ordering and metadata save in one transaction. Concurrent edits use last-write-wins. Public link copying has an address-bar fallback if clipboard access is unavailable. List comments, appreciations and custom cover art are future work.

## Account settings — 18 October 2026

`#settings`, linked from the private profile, shows the owner's email and number of unexpired login sessions. The count represents sessions, not uniquely identified physical devices. Guests receive a sign-in prompt; no account email is added to public profiles.

Password change requires the current password and a matching new-password confirmation (10–128 characters). Successful changes revoke every session, including the current browser, and require a fresh login. Sign-out-all also requires the current password. Account deletion requires an app-owned confirmation dialog, current password, and the literal DELETE; Cancel receives initial focus. Deletion removes the account and related library, shelves, lists, posts, reviews, comments, likes, follows and notifications through existing foreign-key cascades. Replies to deleted posts disappear with those posts; other users' accounts and the shared book catalogue remain. Existing database backups are subject to the deployment's retention policy and are not rewritten by this action.

Sensitive endpoints are rate limited and use the existing same-origin request guard. Password verification and mutation share a transaction and user-row lock on PostgreSQL. Login rechecks the verified password hash under that lock before creating a session, preventing an old-password login racing password rotation from restoring access. Forms retain input on validation/network failure, disable duplicate submissions, and show persistent success feedback after sign-out. Dialogs use shared focus and responsive behavior.

Email delivery, forgotten-password recovery and verification were explicitly deferred by the user. This milestone adds no mail provider, recovery routes, token tables or email side effects.

## Reading preferences — 18 October 2026

A private `#preferences` page lets readers choose up to five genres from a shared validated catalogue or continue without favorite genres. New and existing accounts without a saved choice see a home invitation. Saving either explicit genres or an empty selection dismisses that invitation. Account settings retains a link for later edits. Preferences are never included in public reader profiles.

Genre choices add a starting weight to the existing genre/author recommendation score. Matching suggestions explain “Because you chose …”; saved books and explicit dismissals remain excluded. Recommendations still use the bounded local catalogue, so a selected genre may have no available books. This is the first onboarding step, not collaborative filtering or the complete onboarding roadmap. Input survives failed saves, requests are cancelled on navigation, and checkbox choices are keyboard accessible with the five-genre limit enforced on client and server.

SQLite/PostgreSQL migrations add owner-keyed preference storage with account-deletion cascade. Cloud RLS/client-role revocation covers the new table. Import preserves preferences and remains compatible with old snapshots and receipts where the table was absent or empty.

## Catalogue browsing — 18 October 2026

Discover links to `#catalog`. This browser searches the existing Shelves catalogue, including imported books, with title/author text, genre, inclusive publication-year bounds and title/newest/oldest sorting. The existing live Open Library search remains in Discover for books outside this catalogue. Missing publication years sort last and do not match year ranges.

Filters and page are encoded in the hash URL. Apply resets paging; Clear restores defaults; reload and browser Back retain committed filters. Native labeled controls reuse the library toolbar and Form. The server validates filters, escapes wildcard characters for literal text search, uses parameterized values and whitelisted ordering, and returns at most 12 books per page with an exact result count. Out-of-range pages clamp to the last available page. Empty, loading and retry states retain navigation. Requests cancel on route/filter changes to prevent stale results replacing newer ones.


### Reader directory and book editions

Reader search uses public name/username, explicit submit/clear, stable pagination, loading/error/empty states and authenticated follow controls. Follower and following counts link to the corresponding public directory scope.

Book author names link to name-based author pages. Existing catalogue controls filter that author's saved editions; an explicit Google Books action loads more candidates. Publisher/date/ISBN/category metadata distinguishes editions. Language is retained for a later selector. Provider descriptions are text, missing covers use the established fallback, and long metadata wraps within the paper panels. Same-name authors are disclosed without invented biographies.


### Social recommendation explanations

Home and Discover reuse the existing recommendation cards and reason field. “Rated highly by a reader you follow” is backed only by a public four- or five-star review. Community explanations require at least three public reviews and an average above three stars. The viewer's private taste remains private; recommendations expose neither other readers' private activity nor review text. Following, unfollowing, review edits/deletion, library saves and dismissal affect the next snapshot. Repeated authors/genres are limited or penalized and matching saved/dismissed editions stay excluded.


### Book-list conversations

The list detail page owns a conversation panel using the shared Form, Dialog, Avatar and error components. Public comments are text only, at most 1,000 characters, newest first, 20 per page. Public profile links use existing reader routes. A signed-in reader can comment on a public list; the author or list owner may delete a comment through a confirmation dialog with Keep comment initially focused. Drafts survive failed submission; action buttons disable while saving; successful actions display persistent feedback. Retries of an unchanged submission reuse its ID.

Every API call checks current list visibility. Private lists and their conversations are unavailable to non-owners; the owner sees retained history but cannot add comments until publication. List-row locking serializes comment mutation with privacy changes. Deleting the list removes its conversation; deleting an account removes that reader's comments. Loading/error/empty states are explicit, and long names and comment text wrap at phone widths.


### Profile identity and progress placement

The home composer retains its location and creates ordinary posts without a post-type select. Currently-reading cards own page updates; an unchecked-by-default sharing checkbox controls whether a public progress post is also created. Private reading notes are never copied into shared posts.

ProfileIdentity is the shared owner of banners, portraits, bio and follower links on self/public profiles. ProfileImages owns visible authenticated upload/removal controls with current-image previews inside ProfileManagement. The profile text and reading-goal form remains in Edit profile and reading goal. ReaderPage owns the public wall and existing like/comment/delete behaviors; the self profile uses its wall-only variant. Avatar supports processed photos with an initials fallback. Shared Form/Dialog retain validation and focus behavior. Images are publicly visible, centre-cropped, and limited to static JPEG/PNG/WebP; upload errors preserve the existing image. Long profile names and wall text wrap at narrow widths.

## Social safety and moderation

Signed-in readers can mute or block from another reader’s profile and undo these from Profile → Muted and blocked readers. Mute hides activity, suggestions and notifications for the viewer; block applies both ways and prevents follow/like/comment interactions, including list discussions, while removing follows and existing mutual notifications. Unblocking never restores follows. Public profile identity and signed-out public content remain visible.

Posts, feed comments and reader profiles can be reported once per reporter/target. Reports are private to server-designated administrators. Profile → Community reports offers paginated open/dismissed/removed reports. Post/comment removal is confirmed and transactional; profile reports can be dismissed or investigated through the separate account moderation screen. Resolution records the actor and time; account deletion cascades the reporter’s reports. Existing controls do not expose who blocked a viewer.

Canonical owners: server/social-safety.ts for controls, reports and permission checks; src/SocialSafety.tsx for shared safety UI; src/components.tsx Dialog/Form for focus and validation. Browser evidence: tests/safety-browser.cjs; authorization and migration evidence: API and migration tests.

## Account moderation and discovery reliability

Administrators can suspend/restore non-admin accounts with a required reason and persistent actor/time history. Suspension revokes sessions, prevents sign-in and excludes public activity from discovery and feeds; public profile identity remains visible. Restoration requires a fresh sign-in. List-discussion comments can now be reported; private list contents cannot be reported by outsiders. Reports do not automatically suspend accounts.

Google Books uses bounded transient retries, a database cache (5-minute freshness, up to 24-hour stale fallback), and coalescing of simultaneous identical searches. Source/fallback labels remain explicit. Title/author matches rank above incidental matches. Recommendations require positive reader or community relevance; cold starts use the curated starter collection. Imported Google editions need adequate bibliographic metadata; derivative study guides, proceedings and incomplete records do not fill recommendation slots. Short books and books without covers are not automatically rejected.

AdminAccounts owns the private username filter and pagination; its search is deliberately transient rather than shared in URLs. Dialog/Form/feedback owners remain the existing shared components.

## Feed pagination and comment ownership

Home, community and profile walls load 20 posts at a time through an opaque timestamp/ID cursor. Following and review filters apply before pagination on the server. Changing the feed resets its pages; refreshing after a social action reloads the existing page depth. Loading failures retain existing posts and offer an explicit retry. Blocking, muting and suspensions apply to every page.

Authors can edit their own feed comments in the shared dialog or confirm permanent deletion. Editing checks the original body to prevent overwriting another edit, retains the draft on failure, and respects blocking/suspension permissions. Own comment deletion remains available after a block. Comment deletion also removes its notification. List discussions retain their separate controls.

Canonical owners: PagedFeed for feed loading and retry state; CommentActions for own-comment dialogs; PostCard for shared rendering. Browser coverage includes pagination retained after likes/edits and dialog layout at 1440/390/320px.

Shared cursor loading for feeds, notifications and book reviews is owned by src/useCursorPages.ts; ActivityMore provides the shared loading/error/retry/footer controls. Requests abort on navigation and time out after 15 seconds. Notification paging and failure recovery are covered by tests/inbox-browser.cjs; book reviews by tests/reviews-browser.cjs.

## Language and edition selection

Discover sends the chosen language to Google Books and excludes provider records that do not declare that language. Catalogue and author filters apply to stored metadata before pagination. A language-specific provider cache and local fallback never reuse another language's results; previous unfiltered cache entries remain usable. Unknown languages remain in unfiltered results.

Book pages group stored editions conservatively by exact case-insensitive trimmed title and credited author. This is not a translated-work identity graph; differently titled translations remain discoverable through normal search. Edition filters and page number are preserved in the book URL. Find more editions explicitly queries Google and imports results; the comparison only lists matching records. Each volume remains independent, with its own private notes, progress and public reviews. Choosing an edition opens its book page; saving uses the existing reading form without moving or deleting prior records.

LanguageSelect owns the shared native language selector; BookEditions and EditionFacts own comparison/publisher/date/language/ISBN presentation. Runtime styling uses the design.css entry and legacy app.css layer with the existing paper panels and responsive action rows. Google isEbook=true is displayed as E-book; paperback/hardcover are never inferred from a false or missing value. Unknown binding information is labelled Format not supplied. Loading, retry, empty, unknown metadata, paging, mobile layout and preserved reading records have isolated browser/API coverage.

ProfileManagement groups muted/blocked reader controls, administrator-only community reports and account settings into a labelled private navigation section on the self profile. It is not shown on Home or public reader profiles. Photo and banner uploads remain visible without opening the text editor, reuse the existing image endpoints, preserve previous images after validation errors, and show current versions after refresh.

Search ranking places derivative guides, companions, colouring books and collections after original books unless the query explicitly requests their type. Discover offers keyboard-accessible retry and a 15-second timeout; composition defers requests. Edition selection preserves the chosen language. Failed Google edition lookups retain the local comparison and have separate recovery from failed edition-list loading.

Reader suggestions rank shared public four- and five-star book reviews first, then shared genres from those reviews. Private library ratings, notes and reading preferences do not contribute. Same-title/credited-author editions count once; unknown authors do not imply a shared book. Muted, blocked (both directions) and suspended accounts are excluded before the 30-reader limit. Fallback readers have a neutral explanation. Following empty states distinguish no follows from a quiet circle; Find readers opens the directory. Community includes a link to the current reader's following directory.


## Site information and covers — 10 November 2026

The user requested general terms and cookie information. #terms and #cookies are public, reloadable routes with document titles, a Back to Home link and the shared footer. Their text describes existing account/public-private/moderation behavior; it does not invent paid-service terms, operator identity or jurisdiction. Cookie details trace to server/auth.ts: shelves_session, seven-day maximum, logout clearing, HttpOnly and Secure in production. There is no advertising/analytics cookie consent control because this app does not implement those cookies. External image/font loading is disclosed.

SiteIdentity owns the shared logo, footer and information pages. The sidebar no longer shows a promotional note. Starter covers come from local assets and null-only backfill in server/db.ts/server/runtime-db.ts; no reading records are changed. Tests/site-identity-browser.cjs verifies natural image dimensions, image failure fallback, footer destination/reload, keyboard navigation and 1477/390/320px layouts.

### Inline header search and supplied branding — 11 November 2026

### Author profiles and personal collections — 11 November 2026

AuthorPage retains name-based catalogue identity and edition import. Profile initials are decorative, not a verified author photo; the same-name limitation remains available under About this profile. Catalog remains the canonical filter/sort/pagination owner. Its native Filters & sort disclosure starts collapsed for authors, indicates committed filters, preserves URL/reload behavior and retains entered values when toggled. Other catalogue routes initially show the form. Catalogue and author import requests are timed and canceled on navigation. Existing validation, empty and retry states remain.

App owns private library search/sort/status and shelf CRUD as before. Status buttons expose aria-pressed, and New shelf remains visible alongside the collection title. Both routes omit the unrelated right rail and reuse BookCard in the shared collection-books layout. tests/collections-browser.cjs checks single-item width, 1477/390/320px layouts, disclosure keyboard operation, filter/sort URL reload, empty search and failed catalogue retry.

### Header behavior

### Signed-in home — 12 November 2026

### Watercolor and staff identity — 12 November 2026

ReaderName/ShelvesBadge share administrator-name presentation across profiles, posts, community and directory. Reader directory responses now include public avatar/banner versions and server-derived isAdmin; profile edits cannot set this flag. Server configuration in server/admin.ts remains the role authority. The requested existing @alexginchev account was resolved to its immutable ID and added to the local ignored server configuration; no username-based privilege rule or credentials were committed.

Route changes remount the feed-column animation container. Existing transient page state resets when leaving a route; same-route filters keep their component state. CSS entry/hover transitions are finite, do not block pointer events, and honor reduced motion. Decorative SVG images have empty alt text and local paths. tests/watercolor-browser.cjs verifies community/profile/directory layouts, adjacent badges, directory admin metadata, reduced motion and community-list navigation.

### Signed-in reading behavior

Home shows CurrentlyReading first for authenticated readers and the welcome banner only for visitors. The optional preferences link follows current reading. CurrentlyReading remains the sole owner of progress updates, with sharing off by default and existing validation, error retention and reload persistence. An empty reading list links to Discover and My shelves. tests/home-browser.cjs covers guest separation, first-content placement, empty-state navigation, mobile layouts and private progress save failure/retry/reload.

### Discovery and header behavior

List preview artwork is decorative and never changes list visibility or exposes books outside the server-authorized response. The native title link covers the card and preserves modified-click navigation. List editing/deletion remains on the detail page. Icon links and manifest describe browser-tab/touch/app-shortcut identity; no service worker or offline cache is introduced. tests/list-design-browser.cjs verifies populated/empty artwork, keyboard navigation, narrow layouts and declared icon dimensions.

Discover and home recommendations use the shared collection-books variant. Discover's existing query, language, IME, cancellation, provider notices and retry behavior are unchanged. Advanced genre/year filtering remains in Catalog. BookCard still owns native card links and the independent Not interested action. Site identity browser checks include full-width Discover and home at 1477/390/320px, including failed-cover fallback and legal-route navigation.

HeaderSearch owns transient query, language, page and popup state independently of Discover. Typing never navigates. Queries require two characters, debounce for 300ms, pause during IME composition, cancel superseded requests and time out after 15 seconds. Enter and pagination request immediately. Loading, empty, provider fallback and retry states stay within the popup. Escape/Close restore input focus; outside interaction and route changes dismiss it. Arrow keys move among native result links; selecting a result opens its book route. No search state is written to the URL.

BrandMark uses the supplied SVG unchanged; BrandLoading uses a derived looping book-stack SVG with reduced-motion support. Startup, book opening, Discover and header search share this loader. tests/header-search-browser.cjs covers inline navigation behavior, loading, pagination, empty/error recovery, IME, keyboard selection and desktop/mobile layout.


## Tailwind profile layout

ProfileIdentity remains shared between self/public routes. ProfileManagement appears only on the self profile; desktop settings occupy a separate column, with reading activity first in mobile document order. Upload, error recovery, profile editing, follower links and public wall controls retain their existing owners. The circular verification icon scales with the name and retains its accessible administrator label. Shared Tailwind utilities read the existing paper/ink/sage tokens; reduced-motion and focus rules remain active in the legacy layer.
