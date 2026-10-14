# Shelves UX Contract

## Active application

React/TypeScript owns rendering. Express owns validation, authorization, persistence and recommendations. SQLite is the local source of truth. The browser-only implementation is archived under prototype/. English UI uses browser-local display dates; stored timestamps use UTC.

## Canonical UI map

| Capability | Owner | Contract | Verification |
|---|---|---|---|
| Navigation | src/App.tsx hash views | Desktop/sidebar and mobile use the same view state; browser back restores main views | Browser flow and reload |
| Toast | App notice state | One live region; success follows server confirmation | Browser flow |
| Dialog | src/components.tsx Dialog | Native modal; Escape, trapped focus, close button, focus restoration | Escape check |
| Forms | src/forms.tsx | Visible labels, native constraints, inline API error, inputs preserved on failure, disabled pending submit | Account/reading flow |
| Select | Native select in forms | Platform owns popup geometry and keyboard behavior | Browser flow |
| Search | App query effect and server searchBooks | Debounced/cancelled requests; loading, empty, error and provider-fallback states | Live search/provider tests |
| Library and shelves | server/services.ts | Owner-only records; atomic reading/membership changes; foreign shelf rejected | API security tests |
| Community | server app/feed service | Posts/comments public; deleting only by owner; likes/follows idempotent | Two-account tests |
| Scrollbar | src/app.css html | Stable page gutter | Desktop/mobile width |

## Data visibility

Reading records, ratings in private records, custom shelves, private reviews, and statistics are private to the authenticated owner. Display names, usernames, bios, posts, and comments are public. The composer explicitly describes public publication. Saving a private review does not publish a post. Personal profile display-name/bio changes affect reader discovery.

## Flow behavior

- Authentication: registration/login creates a server session in an HttpOnly cookie. Logout invalidates that token. Session cookies last seven days. No passwords/tokens are placed in localStorage.
- Reading updates: user opens a book, edits status/progress/rating/private review/shelves, submits, waits for server confirmation, and returns to the current view with refreshed counts. Invalid values retain the dialog and input.
- Finishing: the backend stores a completion timestamp and sets the page to the known book length. Moving back to another status clears completion. Annual totals derive from current finished records with completion timestamps in the current UTC year.
- Removing a reading record: the user confirms removal of the book and private notes. Related shelf membership is removed transactionally. Deletion failures keep the dialog open.
- Shelves: owner creates a name; duplicates are rejected case-insensitively. Custom membership cannot be assigned across accounts.
- Posts: create explicitly public text; likes/comments/follows refresh after server confirmation. Deleting a post requires confirmation and removes related likes/comments. Private reviews do not appear in the public feed.
- Recommendations: account taste uses genre/author affinity and ratings. Library and dismissed books are excluded. Guest discovery uses the starter/imported catalog without fabricated personal signals.
- Search: provider request timeout/error yields a clear error, or matching cached books plus a fallback notice. Remote URLs and metadata IDs are validated. Clearing search returns to discovery.

## Async and failure states

Initial load has a status panel. API errors show retry feedback. Search work is cancelled when query/view changes; older snapshot requests cannot replace newer state. Submissions disable duplicate actions and show pending text. Input remains when the server rejects a form. Mutations are pessimistic. Network requests time out. Data is refetched after confirmed writes.

Initial reading/profile edits use last-write-wins; conflict detection and realtime updates are future work. The feed, catalog and comments have documented bounded result sets. Main view hashes are bookmarkable; selected shelf filters currently reset after reload.

## Responsive and accessibility

Preserve the ZIP's three-column desktop, tablet fallback, and mobile bottom navigation. Forms/dialogs fit the viewport. Use semantic buttons, associated labels, native form controls, keyboard focus and reduced motion. Book covers have text alternatives and a typographic fallback. User-supplied text renders as text. The application targets WCAG 2.2 AA but has not undergone a comprehensive assistive-technology audit.

## Public book pages and reviews

`#book/:id` is a shareable page and survives reload. `src/BookPage.tsx` owns book information, public reviews, public averages, and their dialogs; it reuses the canonical `Dialog` and `PostCard`. Reading controls open the existing private `BookDialog`.

Each reader has one public review per book. PUT updates that review without duplicating it. Public rating averages count only published review ratings. Private reading ratings/reviews never contribute. Spoiler content and notes are enclosed in a native collapsed details element, including in the feed. The reader explicitly reveals spoilers. Edit/delete are owner-only; deleting a public review removes its likes and comments while preserving private records.

The application refreshes through `/api/snapshot` instead of eight individual HTTP requests. This keeps refreshes below normal rate-limit usage and returns a consistently owner-scoped state. Book page work invalidates stale responses during navigation.

Before an existing SQLite database receives a new schema migration, its account data is backed up using VACUUM INTO. Backups remain in the ignored data directory.
