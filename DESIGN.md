---
version: alpha
name: "Shelves"
description: "A watercolor-inspired reading community for thoughtful readers, quiet rituals, and books worth sharing."
colors:
  ink: "#203548"
  paper: "#F7F1E7"
  sage: "#8D9F87"
  coral: "#C97B64"
  mist: "#D7E7E8"
  lavender: "#DED8E8"
  line: "#E5DCCD"
typography:
  display:
    fontFamily: "Playfair Display, Georgia, serif"
  sans:
    fontFamily: "DM Sans, Arial, sans-serif"
rounded:
  DEFAULT: "0.875rem"
  sm: "0.5rem"
  md: "0.875rem"
  lg: "1.25rem"
spacing:
  page-max: "1384px"
  section-gap: "1.5rem"
  card-padding: "clamp(18px, 2.2vw, 28px)"
components:
  button: { }
  card: { }
  dialog: { }
---

# Shelves Design System

## Overview

### Creative North Star

Shelves should feel like a small illustrated field journal kept beside a favorite reading chair: soft pigments bleeding at the edges, imperfect paper, pressed leaves, hand-drawn linework, and book covers that look screen-printed. The watercolor treatment is atmospheric, not an obstacle to reading.

### Product context and register

- **Audience and primary job:** Readers sharing book notes, tracking shelves, discovering books, and gathering in small clubs.
- **Target market(s) and evidence:** General English-language prototype; no market-specific research supplied.
- **Locale(s) and language policy:** English, browser-local dates and numbers.
- **Usage scene:** Frequent desktop reading, with a compact mobile experience for quick updates.
- **Register:** Hybrid: editorial warmth in the welcome area; clear, familiar controls in feed, shelves, and dialogs.
- **Memorable signature:** Watercolor washes and paper grain behind tidy, ink-like line icons and real book covers.
- **Restraint:** Keep feed copy and control labels legible; do not put texture beneath dense text or reduce contrast for the sake of softness.
- **Anti-references:** Generic SaaS blue dashboards, neon gradients, emoji-only navigation, hard glassmorphism, and overdecorated stationery.
- **Token ownership/runtime mapping:** This document owns visual intent. `src/app.css` owns existing tokens and watercolor surfaces; `src/design.css` is the Tailwind entry and maps those tokens into utilities and shared component refinements. `styles.css` belongs to the archived ZIP prototype and is not imported by React.

## Colors

- **Ink `#203548`:** primary text and high-emphasis actions.
- **Paper `#F7F1E7`:** warm page background, with low-opacity pigment washes and a subtle grain overlay.
- **Sage `#8D9F87`:** reading progress, selected navigation, and quiet positive states.
- **Coral `#C97B64`:** expressive accent and secondary emphasis, never the only signal for an action.
- **Mist `#D7E7E8` and lavender `#DED8E8`:** supporting washes for quote cards, cover art, and atmosphere.
- **Line `#E5DCCD`:** low-contrast separators that still remain visible against paper.

## Typography

Playfair Display carries bookish headlines and titles. DM Sans handles navigation, metadata, body copy, and forms. Body copy is 14px, utility copy 12–13px, essential controls 13px, and dialog inputs 16px. Decorative cover typography and small kickers may be smaller; the full book title and author are also rendered as ordinary readable text. Use sentence case and plain action verbs.

## Layout

The desktop shell pairs a stable left navigation rail with a flexible feed and contextual right rail. Below 1280px, the right rail moves under the feed; at 860px and below the sidebar becomes a bottom bar, with reading circle/journal links above the content. The sidebar middle scrolls independently so the brand and profile remain reachable. Cards use 18–28px inner padding (20px on phones), including empty states. Sections have 24px gaps, reduced to 20px on phones. Book grids use a minimum card width and fewer columns before covers overflow. Natural text height and wrapping govern card height; aligned actions sit below the text. Dialogs have a separate close row and a maximum height of the viewport minus 32px.

## Elevation & Depth

Prefer tonal layering, thin warm borders, paper translucency, and very soft shadows. Dialogs use a restrained blur backdrop and a clearly opaque paper surface. Watercolor texture must remain behind content, not over it.

## Shapes

Use rounded but not uniformly pill-shaped cards; controls can be pills when they represent a primary action. Illustrated book covers remain mostly rectangular. Icon containers are circular or softly rounded. Decorative shapes should feel like pigment blooms, not glossy gradients.

## Components

### Foundational visual states

Interactive controls need hover, focus-visible, active, and disabled states. Focus is a 3px coral outline. Selected navigation uses a sage wash and a narrow leading marker. Saved posts and liked posts combine an icon state with text or count changes.

### Buttons and actions

Primary actions use ink-colored pills. Secondary actions use transparent paper surfaces with warm borders. Destructive actions must be explicit and separated from routine navigation.

### Navigation and data display

Navigation uses consistent inline SVG line icons with rounded caps and a 1.7px stroke. Keep labels visible at desktop widths and pair icons with labels on mobile. Book lists use illustrated covers, titles, authors, and explicit shelf actions.

The header notification bell uses the same icon strokes and a 44px control. Its unread count sits in normal flex flow so it cannot overlap nearby actions. Inbox rows reuse warm borders and sage unread surfaces, with explicit unread text, wrapping names, and controls that reflow on phones.

### Forms and overlays

Use app-owned dialogs instead of browser prompts. Keep labels visible, retain user input after validation issues, close dialogs with Escape or the close button, and use live-region toast feedback for noncritical status.

### Iconography

Use the same hand-drawn-feeling, Lucide-like SVG stroke family: 18–21px in navigation, 16–18px in compact actions, no mixed emoji glyphs for core navigation. Decorative botanical marks may remain as illustration, never as the only meaning of a control.

### Motion

Use short 160–220ms transitions for hover and dialog appearance. Motion should confirm an action or clarify a surface. Respect `prefers-reduced-motion`.

### Content and data visualization

Keep social copy specific and gentle. Progress bars use sage; percentages must reflect the stored goal. The active React application saves account data through the Express API to Supabase PostgreSQL (or explicitly configured offline SQLite). Save feedback follows server confirmation. The archived prototype retains its localStorage behavior.

## Do's and Don'ts

- **Do:** Let watercolor live in large surfaces and illustrations while keeping text areas calm.
- **Do:** Use consistent SVG icons, clear accessible names, and visible keyboard focus.
- **Don't:** Use decorative glyphs as the sole affordance for primary navigation.
- **Don't:** claim local-only actions are synced with other readers or a backend.

## Archived prototype

The supplied ZIP remains the visual reference. CSS variables and shared styles in styles.css are the runtime token owner. Book details use a native modal dialog with Escape dismissal, focus containment, and focus restoration. Native select controls own reading status and rating input. library.js owns catalog, recommendations, shelf filtering, and reading record updates. Records remain browser-local; reviews are private. Custom shelf names are escaped before HTML rendering. Recommendation v1 derives genre affinity from high ratings and saved books and excludes saved or dismissed titles. Empty shelves offer discovery; exhausted discovery offers dismissal reset.

## Active full-stack implementation

The supplied ZIP remains the visual reference. `src/design.css` is the active stylesheet entry: Tailwind theme, legacy app.css, component refinements, then utilities. Tailwind Preflight is intentionally omitted to preserve the existing form reset. `src/app.css` continues to own runtime tokens, watercolor surfaces, and legacy responsive geometry. The archived prototype stylesheet remains available as a reference. Runtime CSS is canonical (Model B); this document mirrors its accepted values and intent. Native modal dialogs in `src/components.tsx` own focus containment, Escape dismissal, and focus restoration. The shared Form owns inline constraint errors and first-invalid focus; `src/forms.tsx` owns submission and API validation recovery. Native selects own popup behavior for status/rating/sorting. `src/App.tsx` owns the desktop/mobile shell and live-region feedback. Public profiles show public social activity; private reading records stay separate.

| Intent | Runtime owner | Consumers |
|---|---|---|
| Paper, ink, sage, coral, mist, lavender | `src/app.css :root` variables | Shell, cards, forms, actions |
| Editorial / utility typography | `--serif` / `--sans` | Headings / body and controls |
| Watercolor materials | `src/app.css` surfaces | Welcome, covers, cards |
| Card padding and spacing | `--card-padding`, `--space-1…6` in `src/app.css` | Cards, shell and shared layout |
| Responsive layout | `src/app.css` | React shell and forms |
| Scrollbar geometry | `html` in `src/app.css` | Stable page gutter |

Profile portraits intentionally straddle the banner bottom edge by half their height (104px desktop, 80px mobile). Reserve space below before profile text. Verified staff use a compact sage Shelves check badge next to their name, controlled by server account IDs.

Social safety reuses the existing paper panels, wrapping action rows, shared Form and native Dialog. Dialogs render through a portal into document.body to avoid inheriting card layout. Reports use a quiet text action; destructive admin removal requires a separate confirmation.

Account moderation reuses the report queue’s paper panels and wrapping action rows. Required reasons and action history live in the shared native dialog; protected administrator accounts have no suspension action.

Feed pagination uses a centred outline action below the existing cards. Own-comment Edit/Delete controls use quiet, wrapping text actions under the note; editing and deletion reuse the existing paper dialog, spacing, focus handling and form feedback.

Edition comparisons reuse the paper panel, native language select and outline navigation actions. EditionFacts uses a semantic definition list with two columns on wider surfaces and one on phones; unknown publication/format information is explicit. Edition cards wrap in the available panel width and preserve the existing card padding.

The self profile has a dedicated Profile & account paper panel with wrapping navigation cards and two upload cards. Image previews use isolated preview-avatar/preview-banner classes, round portrait crops and a wide banner crop; file controls fit the narrow card content area.

Edition card headers pair a compact cover with wrapping title/author text. Bibliographic facts retain the shared definition-list layout; an absent ISBN occupies an explicit Not supplied row. Cover previews use the shared fallback and do not imply a physical binding.

Reader match explanations use small wrapping text beneath existing reader identity, shared by the community list and Readers to know rail. Community navigation reuses the wrapping account-actions row.

Book tiles and the featured book pick open through a native link covering the card, without a separate View book button. Sage hover borders and a coral card-level keyboard focus outline signal navigation. Recommendation dismissal stays a separate action above the link hit area. Existing card padding, covers and typography remain unchanged.


## Site identity and footer — 10 November 2026

BrandMark in src/SiteIdentity.tsx renders the user-supplied download.svg from public/branding/shelves.svg: stacked books, a bookmark and a path-based wordmark. Desktop, mobile and footer share the supplied artwork and its original burgundy, brown and gold colors. The tiny social-club strapline and generic sidebar slogan are removed. BrandLoading uses the same book paths in a looping animation; reduced-motion preferences disable movement.

HeaderSearch owns a rounded header field and an anchored, scrollable result panel. Covers, title and author form each clickable result. The panel fits 320px screens and leaves the current page in place until a result is selected. Search, language and pagination controls retain the existing typography and paper palette.

SiteFooter sits below the entire content grid, with the wordmark, copyright and Terms of use/Cookies links. Links wrap onto a second row on narrow screens. SiteInformation uses the existing paper panel and a single reading column. The legal links are accessible routes, not modal or dead-link placeholders.

All six starter books use real, locally served jacket images with provenance in public/covers/SOURCES.md. Seed backfill only updates null covers; custom/existing covers are retained. PaperCover remains a fallback for missing or failed images.

## Book collections — 11 November 2026

Author and personal-library routes use the full content width without the unrelated right rail. Their shared collection-books variant keeps cover columns at a consistent size even for a single book, with left-aligned titles and metadata on the page rather than inside large gradient cards. Existing BookCard links and focus behavior remain canonical. Status navigation uses underlined text buttons with explicit pressed state; search and sorting occupy compact fields.

Author profiles lead with a book-shaped initials mark, the credited name and a short collection label. The mark uses existing --blue-pale and --sage tokens; it never implies a verified portrait. No biography is invented from book metadata. Catalog owns the filter form, now inside a native disclosure on author pages. Existing palette and typography remain unchanged.

Discover now shares this collection layout: full-width covers, a compact title/search-language toolbar, and one route to advanced catalogue filters. Home recommendations reuse the same cards without a surrounding panel. Recommendation reasons remain visible and dismissal remains independently actionable. Empty feed pagination occupies no space. The unrelated static quotation is removed from the rotating book pick.

### Next design priorities

- Home now prioritizes public conversations. Current reading stays in a collapsed nightstand strip, with the existing progress dialog inside. The welcome illustration remains for visitors; reading preferences remain in account settings.
- Author identity: verified biography, portrait and source attribution require a reliable author record and identity matching, not inference from credited names.
- Editions: offer a work-level browsing view only once grouping reliably distinguishes translations, editions and same-title books; keep existing edition-specific records intact.
- Mobile navigation: consolidate secondary links into an accessible menu to bring content closer to the top; preserve keyboard access and all current destinations.

## Watercolor materials, motion and staff identity — 12 November 2026

Local SVG artwork in public/art supplies seamless grain and a small book-and-plant illustration. Grain tiles sit in page/panel backgrounds rather than above controls. The reading-circle introduction uses a sage/mist wash with the decorative illustration; default profile banners reuse the artwork without overlapping promotional copy. Uploaded banners remain unchanged. Artwork provenance is in public/art/SOURCES.md.

Route content uses a 300ms, 8px upward arrival with restrained 35/65ms staggering. Dialog and search panels use 180ms entry, and pointer-hover book covers lift 4px. All motion is finite and disabled by the existing global prefers-reduced-motion rule. No continuous floating animation or full-page transition blocks interaction.

ReaderName owns adjacent text/check alignment on profiles, posts, community suggestions and the reader directory. ShelvesBadge is a compact inline mark with an accessible administrator label and tooltip; its size follows the name and never becomes a separate text pill. Administrator authority remains server-configured immutable account IDs.

List summaries now pair up to three tilted cover previews with title, visibility, count and creator metadata on a lightly textured sage surface. Empty lists reuse the book-and-plant illustration. The title's native link covers the whole summary, with an explicit card-level keyboard outline. Covers stack above the copy on narrow screens.

Browser identity uses a static square stacked-book SVG and generated PNG variants; the full animated wordmark remains in page branding. The manifest supplies standalone-window name, theme and icons without promising offline behavior or installing anything automatically.


## Tailwind profile refinement — 12 November 2026

Tailwind v4 utilities and shared component rules refine the existing watercolor/editorial identity. This is an incremental migration, not a replacement of all legacy CSS. Shared actions have quieter rounded corners and panels softer shadows. Self and public profiles use the collection-width shell without unrelated right-rail recommendations. The self profile separates reading/activity from private settings at 1200px and stacks them on mobile. The team label stacks below the name on narrow screens. ShelvesBadge uses a symmetrical circular check; the accessible administrator label and server authority stay unchanged.


## Social Home — 13 November 2026

Home keeps the paper palette and restrained serif header, with a compact composer, four icon-and-label feed tabs and border-separated posts. Current reading is an expandable nightstand strip. Removed the book recommendation grid, goal widget and daily book pick from Home; desktop retains a quiet reader-suggestions column. Mobile secondary destinations use named SVG icon links. Like, comment and report controls use accessible SVG icons; comments expand inside each post. Other routes retain their established controls.

## Visual collections and reader spaces — 14 November 2026

Book lists, list detail, Reading circle, the reader directory and journal use the collection-width shell without unrelated rail widgets. A shared visual-page-heading pairs the title with a restrained SVG emblem. Named 44px icon actions provide back, edit, delete, share and search controls; creation and scope toggles retain brief text labels. List cards prioritize larger jacket previews, visibility icons and actual descriptions. Empty collections reuse the local watercolor illustration. Journal entries pair real covers with private notes and ratings. Community navigation uses icon actions and the match explanation sits in a disclosure.
