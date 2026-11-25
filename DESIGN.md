---
version: alpha
name: Shelves
description: "A reading community whose home opens on a three-dimensional shelf of recommended books."
colors:
  canvas: "#111416"
  surface: "#1D2224"
  foreground: "#F6F3ED"
  muted: "#B9C1BF"
  rule: "#343B3C"
  focus: "#F1A786"
  brandAccent: "#F1A077"
typography:
  display:
    fontFamily: "Cabinet Grotesk, Arial, sans-serif"
    fontWeight: 800
  body:
    fontFamily: "Cabinet Grotesk, Arial, sans-serif"
    fontWeight: 400
rounded:
  sm: "0.375rem"
  md: "0.75rem"
spacing:
  page-max: "1380px"
  section-gap: "1.5rem"
  page-gutter: "clamp(18px, 3.4vw, 52px)"
  card-padding: "clamp(20px, 2.4vw, 32px)"
---

# Shelves Design System

## Overview

The books are the most colorful objects on the page. At Home, upright jackets and a visible spine sit on a thin ledge. The selected title appears in oversized, low-contrast type behind them and in full with the author and synopsis below. Cabinet Grotesk and the monochrome surfaces carry this editorial treatment into the working views. The original animated Shelves mark retains its distinct color and lettering.

Shelves serves readers who track their reading, discover books, and share notes. The app uses English, browser-local dates and numbers, and a compact mobile layout. The desktop header keeps the main sections and quick shelves within reach. The mobile bottom bar keeps the primary destinations above the safe area.

## Colors

Dark mode uses charcoal, slightly raised surfaces, neutral rules, and warm foreground text. Light mode uses white, warm-gray surfaces, and dark foreground text. Both use the same interaction and navigation structure. The header theme button works across views and stores the reader’s choice. The shelf’s theme follows it.

Keep accent colors for focus, status and book jackets. Use the ordinary foreground and muted tones for readable text. Decorative titles can be low contrast because the same title is available in the description and controls.

## Typography

Cabinet Grotesk Medium carries interface text and descriptions. Extrabold carries headings and the title behind the shelf. Wrap long titles and author names in the readable layer. The oversized decorative title can extend beyond the visible scene.

## Layout

The shelf occupies the width of the Home stage, with recommendations and actions centered under its description. The rest of the Home feed follows below. On phones the shelf scales with the available width, the synopsis sits in normal flow, and the frame grows to contain it. Search occupies a separate row from the logo and appearance controls. Secondary destinations sit in a compact disclosure below the page heading. Keep a 44px minimum target for the main controls. Use the shared page gutter and card padding for every route; collection pages keep a consistent 24–28px section rhythm. The optional right rail disappears below 1200px so primary content has room to breathe.

## Components

- **Brand** uses the original animated SVG in a burnt-orange palette. The wordmark uses a lighter orange on dark surfaces. Its book-stacking reveal starts on every full page load; in-app navigation keeps the mark settled. Reduced motion displays the final mark immediately.
- **Authentication** uses a two-column layout with a greeting beside the form. On phones the greeting sits above the fields. The name or username updates as the reader types and uses the brand accent.
- **Home recommendations** use the server-ranked snapshot shared with Discover. The first pick previews by default. Hover or focus previews another pick. Click, tap, or keyboard activation opens that book’s detail page. The selected preview stays active as the reader moves to View book. Fewer available recommendations result in fewer visible books.
- **Book details** give the real jacket a large place on a shallow reading stage. Title, author, public rating and the primary library action sit beside it; description and factual edition information occupy a calmer lower split. On phones these become one readable column. Book jackets supply the strongest color rather than a page-wide decorative image.
- **My Shelves** groups saved books on horizontal ledges by reading status. Covers remain the main visual; titles, authors, progress, and illustrated star ratings sit below each jacket. Each row scrolls on narrow screens, and a single book gets a short ledge instead of an empty full-width card. Search, sorting, custom shelves, and status views remain available.
- **Discovery** adds a paged Google Books row to the default Discover view and personal library. It requests at most ten titles per page, excludes already saved books, and caches each page briefly. API failures retain a small collection of existing recommendations and offer retry.
- **Profile and settings** separate the public reading corner from account management. The profile holds identity, shelves, posts, and reviews, with a gear icon opening a dedicated settings route for personal details, images, reading goal, safety, and account controls.
- **Reading circle** shows reader profiles as compact tiles with a banner, avatar, public bio and follow action. Uploaded banners appear when present; otherwise restrained colors from the Shelves palette distinguish cards. On a reader profile, the follow action sits beside follower counts, while mute, block and report live in a small actions menu.
- **Featured animation** uses the supplied GSAP and SplitType script with a separate integration layer for real data, responsiveness, theme and keyboard behavior. The embedded shelf uses the exact page canvas color in both themes. Its original license is under `public/featured-shelf/`.
- **Routes, dialogs, form states and pick ranking** retain the ownership and behavior in UX-CONTRACT.md.

## Runtime mapping

`src/layout-overhaul.css` owns the final semantic palette, page width, gutters, card padding, and shared responsive spacing. It loads after `src/design.css` so its rules resolve earlier page-specific styles consistently. The light theme maps the same tokens on `html[data-theme="light"]`. `src/design.css` maps them to utilities; `src/app.css` and `src/editorial.css` provide the underlying components and editorial details. The isolated shelf uses its supplied CSS and aligns its canvas, theme and typography through `public/featured-shelf/shelves.css`.
