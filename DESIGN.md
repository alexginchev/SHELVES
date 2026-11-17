---
version: alpha
name: Shelves
description: "A reading community whose home opens on a three-dimensional shelf of recommended books."
colors:
  canvas: "#121212"
  surface: "#1B1B1B"
  foreground: "#F4F2EF"
  muted: "#B7B5B2"
  rule: "#363535"
  focus: "#ECA384"
  brandAccent: "#F29A68"
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
  page-max: "1384px"
  section-gap: "1.5rem"
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

The shelf occupies the width of the Home stage, with recommendations and actions centered under its description. The rest of the Home feed follows below. On phones the shelf scales with the available width, the synopsis sits in normal flow, and the frame grows to contain it. Search occupies a separate row from the logo and appearance controls. Keep a 44px minimum target for the main controls.

## Components

- **Brand** uses the original animated SVG in a burnt-orange palette. The wordmark uses a lighter orange on dark surfaces. Reduced motion displays the final mark immediately.
- **Authentication** uses a two-column layout with a greeting beside the form. On phones the greeting sits above the fields. The name or username updates as the reader types and uses the brand accent.
- **Home recommendations** use the server-ranked snapshot shared with Discover. The first pick opens by default. Hover, focus, or tap selects another pick. The selected book stays active as the reader moves to View book. The link opens the normal Shelves book page. Fewer available recommendations result in fewer visible books.
- **Featured animation** uses the supplied GSAP and SplitType script with a separate integration layer for real data, responsiveness, theme and keyboard behavior. Its original license is under `public/featured-shelf/`.
- **Routes, dialogs, form states and pick ranking** retain the ownership and behavior in UX-CONTRACT.md.

## Runtime mapping

`src/editorial.css` owns the current palette and typography. In order, the default colors above map to `--paper`, `--white`, `--ink`, `--ink-soft`, `--line` and `--coral`. The light theme maps those semantic tokens on `html[data-theme="light"]`. `src/design.css` maps them to utilities, while `src/app.css` provides the underlying component layout. The isolated shelf uses its supplied CSS and aligns its canvas, theme and typography through `public/featured-shelf/shelves.css`.
