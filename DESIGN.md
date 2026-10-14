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
  page-max: "1250px"
  section-gap: "1.5rem"
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
- **Memorable signature:** Watercolor washes and paper grain behind tidy, ink-like line icons and typographic book covers.
- **Restraint:** Keep feed copy and control labels legible; do not put texture beneath dense text or reduce contrast for the sake of softness.
- **Anti-references:** Generic SaaS blue dashboards, neon gradients, emoji-only navigation, hard glassmorphism, and overdecorated stationery.
- **Token ownership/runtime mapping:** This document owns visual intent. `styles.css` implements the corresponding CSS custom properties at `:root`; visual tokens and shared surface rules are kept together in that file.

## Colors

- **Ink `#203548`:** primary text and high-emphasis actions.
- **Paper `#F7F1E7`:** warm page background, with low-opacity pigment washes and a subtle grain overlay.
- **Sage `#8D9F87`:** reading progress, selected navigation, and quiet positive states.
- **Coral `#C97B64`:** expressive accent and secondary emphasis, never the only signal for an action.
- **Mist `#D7E7E8` and lavender `#DED8E8`:** supporting washes for quote cards, cover art, and atmosphere.
- **Line `#E5DCCD`:** low-contrast separators that still remain visible against paper.

## Typography

Playfair Display carries bookish headlines and titles. DM Sans handles navigation, metadata, body copy, and forms. Keep body copy around 11–14px in compact social cards, but never shrink essential controls or mobile form text below a comfortable readable size. Use sentence case and plain action verbs.

## Layout

The desktop shell pairs a stable left navigation rail with a flexible feed and contextual right rail. Below tablet width, the right rail moves under the feed; below 640px, the sidebar becomes a fixed bottom navigation. Cards use generous inner spacing and varied, gently irregular corners to evoke paper cutouts without disrupting alignment.

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

### Forms and overlays

Use app-owned dialogs instead of browser prompts. Keep labels visible, retain user input after validation issues, close dialogs with Escape or the close button, and use live-region toast feedback for noncritical status.

### Iconography

Use the same hand-drawn-feeling, Lucide-like SVG stroke family: 18–21px in navigation, 16–18px in compact actions, no mixed emoji glyphs for core navigation. Decorative botanical marks may remain as illustration, never as the only meaning of a control.

### Motion

Use short 160–220ms transitions for hover and dialog appearance. Motion should confirm an action or clarify a surface. Respect `prefers-reduced-motion`.

### Content and data visualization

Keep social copy specific and gentle. Progress bars use sage; percentages must reflect the stored goal. The active React application saves account data through the Express API to SQLite. Save feedback follows server confirmation. The archived prototype retains its localStorage behavior.

## Do's and Don'ts

- **Do:** Let watercolor live in large surfaces and illustrations while keeping text areas calm.
- **Do:** Use consistent SVG icons, clear accessible names, and visible keyboard focus.
- **Don't:** Use decorative glyphs as the sole affordance for primary navigation.
- **Don't:** claim local-only actions are synced with other readers or a backend.

## Archived prototype

The supplied ZIP remains the visual reference. CSS variables and shared styles in styles.css are the runtime token owner. Book details use a native modal dialog with Escape dismissal, focus containment, and focus restoration. Native select controls own reading status and rating input. library.js owns catalog, recommendations, shelf filtering, and reading record updates. Records remain browser-local; reviews are private. Custom shelf names are escaped before HTML rendering. Recommendation v1 derives genre affinity from high ratings and saved books and excludes saved or dismissed titles. Empty shelves offer discovery; exhausted discovery offers dismissal reset.

## Active full-stack implementation

The supplied ZIP remains the visual reference. `styles.css` owns shared runtime tokens and watercolor surfaces; `src/app.css` extends those shared rules for the React application without a second palette. Runtime CSS is canonical (Model B); this document mirrors its accepted values and intent. Native modal dialogs in `src/components.tsx` own focus containment, Escape dismissal, and focus restoration. Native selects own status/rating popup behavior. `src/forms.tsx` owns labeled fields, validation recovery, and pending submission states. `src/App.tsx` owns the desktop/mobile shell and live-region feedback. Book cover fallbacks reuse illustrated typography from the ZIP. Public community actions are visually separated from private reading reviews.

| Intent | Runtime owner | Consumers |
|---|---|---|
| Paper, ink, sage, coral, mist, lavender | `styles.css :root` variables | Shell, cards, forms, actions |
| Editorial / utility typography | `--serif` / `--sans` | Headings / body and controls |
| Watercolor materials | Existing `styles.css` surfaces | Welcome, covers, cards |
| Responsive extensions | `src/app.css` | React shell and forms |
| Scrollbar geometry | `html` in `src/app.css` | Stable page gutter |
