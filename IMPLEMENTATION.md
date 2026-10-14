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
