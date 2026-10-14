# SHELVES — Master Project Plan

> **Project type:** Social book discovery, tracking, reviewing, and community platform  
> **Core inspiration:** Goodreads-style book platform with a significantly more modern UI, stronger social features, better discovery, richer profiles, and cleaner UX  
> **Recommended stack:** React + TypeScript + Vite, Node.js + Express, Supabase PostgreSQL/Auth/Storage/Realtime, Google Books/Open Library APIs

---

# 1. Project Vision

**SHELVES** is a modern social reading platform where users can discover books, track reading progress, organize personal shelves, rate and review books, follow readers and authors, build a public reading identity, receive recommendations, join discussions, and explore reading trends.

The project should feel like a modern social media product built around books rather than a simple book database.

The goal is to combine:

- Goodreads-style reading tracking
- Letterboxd-style social identity and review culture
- Spotify-style discovery and personalization
- Pinterest-like visual browsing
- Modern community/profile UX
- Strong admin and moderation tools
- Clean, premium, responsive design

The app should work well as both:

1. A personal reading tracker
2. A social network for readers
3. A book discovery engine
4. A community platform
5. A portfolio-quality full-stack application

---

# 2. High-Level Architecture

```text
React + TypeScript + Vite
        |
        | HTTPS / REST
        v
Node.js + Express API
        |
        +----------------------+
        |                      |
        v                      v
Supabase                 External Book APIs
PostgreSQL               Google Books
Auth                     Open Library
Storage
Realtime
```

## 2.1 Frontend

Use:

- React
- TypeScript
- Vite
- React Router
- TanStack Query
- Zod
- React Hook Form
- Supabase client
- Optional state manager: Zustand
- Optional animation: Framer Motion
- Optional UI utilities: Radix UI / shadcn-style primitives

Frontend responsibilities:

- Rendering
- Client-side routing
- Forms
- Search UI
- Book browsing
- Profile pages
- Shelves
- Reviews
- Feed
- Notifications UI
- Responsive layouts
- Optimistic updates
- Caching API responses
- Local UX state

## 2.2 Backend

Use:

- Node.js
- Express
- TypeScript
- Supabase server client
- Zod
- JWT verification using Supabase Auth
- Optional Redis later for caching

Backend responsibilities:

- Business logic
- Authorization
- Validation
- Book import logic
- Recommendation logic
- Feed generation
- Moderation logic
- Admin functionality
- Analytics aggregation
- Notification creation
- Sensitive operations
- External API calls
- Rate limiting

## 2.3 Supabase

Use Supabase for:

- PostgreSQL database
- Authentication
- Storage
- Realtime
- Row Level Security
- Optional Edge Functions later
- Optional cron jobs later

---

# 3. Roles

## 3.1 Guest

Can:

- View home page
- Search books
- View book pages
- View public profiles
- View public reviews
- View public shelves
- Browse trending books
- Browse authors
- Register/login

Cannot:

- Rate
- Review
- Follow
- Create shelves
- Like reviews
- Comment
- Save books
- Send reports

## 3.2 User

Can use all normal platform features.

## 3.3 Moderator

Can:

- Review reports
- Hide reviews/comments
- Warn users
- Temporarily suspend accounts
- Manage flagged content
- View moderation history

## 3.4 Admin

Can:

- Access admin dashboard
- Manage users
- Manage books
- Manage authors
- Merge duplicates
- Edit book metadata
- Manage featured content
- Manage reports
- View analytics
- Configure platform settings
- Ban users
- Assign roles
- Manage genres/tags
- Trigger book imports
- View audit logs

---

# 4. Core User Experience

A user should be able to:

1. Create an account
2. Set username/avatar/bio
3. Search for a book
4. Open the book page
5. Add it to:
   - Want to Read
   - Reading
   - Read
   - Custom shelf
6. Rate it
7. Write a review
8. Track reading progress
9. Follow other readers
10. See their activity
11. Discover recommendations
12. Build a public reading profile
13. Browse statistics
14. Receive notifications
15. Participate socially

---

# 5. Authentication

## 5.1 Registration

Fields:

- Email
- Password
- Confirm password
- Username
- Display name
- Terms agreement

Optional later:

- Date of birth
- Country
- Preferred language

## 5.2 Login

Support:

- Email + password
- Remember session
- Forgot password
- Password reset

Future:

- Google login
- Apple login
- Discord login

## 5.3 Username Rules

- Unique
- 3–30 characters
- Lowercase normalized slug
- Letters, numbers, underscores
- Reserved names blocked

Examples:

```text
admin
support
shelves
api
moderator
help
```

## 5.4 Sessions

Supabase handles tokens.

Backend should validate the Supabase access token for protected API routes.

---

# 6. Onboarding

After registration, show onboarding.

## Step 1 — Profile

- Upload avatar
- Display name
- Bio
- Favorite genres

## Step 2 — Reading Interests

Pick genres:

- Fantasy
- Romance
- Mystery
- Thriller
- Horror
- Literary Fiction
- Science Fiction
- Historical Fiction
- Queer Fiction
- Manga
- Young Adult
- Classics
- Nonfiction
- Biography
- Philosophy
- Poetry

## Step 3 — Favorite Books

Search and select 3–10 books.

## Step 4 — Follow Readers

Recommend active users based on taste.

## Step 5 — Recommendations

Generate initial discovery feed.

---

# 7. Navigation

Desktop layout:

```text
SHELVES logo

Home
Explore
Books
Community
My Library

Search bar

Notifications
Messages
Profile avatar
```

Mobile layout:

Bottom navigation:

- Home
- Explore
- Search
- Library
- Profile

Notification access through top header.

---

# 8. Home Feed

The home feed should be personalized.

Content types:

- User rated a book
- User reviewed a book
- User started reading
- User finished reading
- User added book to shelf
- User created a list
- User followed someone
- User liked a review
- Trending discussions
- Recommended books
- Popular reviews

Example:

```text
Alex finished reading

THE PICTURE OF DORIAN GRAY
★★★★★

"Absolutely loved the atmosphere..."

12 likes • 4 comments
```

## Feed Filters

- For You
- Following
- Reviews
- Reading Activity

## Feed Ranking

Potential scoring inputs:

- Recency
- Relationship strength
- Shared genres
- Shared books
- Interaction history
- Popularity

---

# 9. Book Search

Global search should search:

- Books
- Authors
- Users
- Lists
- ISBN

## Filters

- Genre
- Author
- Publication year
- Rating
- Language
- Format
- Page count
- Popularity

## Sort

- Relevance
- Most popular
- Highest rated
- Newest
- Most reviewed

---

# 10. External Book Data

Recommended sources:

## Primary

Google Books API

Useful for:

- Title
- ISBN
- Description
- Authors
- Cover
- Publisher
- Page count
- Categories
- Publication date

## Secondary

Open Library

Useful for:

- Covers
- Alternate editions
- Author data
- Work IDs
- ISBN metadata

## Data Strategy

Do not pre-populate millions of books.

Instead:

```text
Search request
   ↓
Search local Supabase DB
   ↓
If insufficient:
Search external APIs
   ↓
Return combined results
   ↓
User interacts with book
   ↓
Import book into local DB
```

Books become persistent when users:

- Rate them
- Review them
- Add them to shelf
- Add them to list
- Start reading

---

# 11. Book Page

Book route:

```text
/book/:slug
```

Example:

```text
/book/the-picture-of-dorian-gray
```

## Hero Section

Display:

- Cover
- Title
- Subtitle
- Author
- Average rating
- Rating count
- Review count
- Publication date
- Page count
- Genres

Primary actions:

- Want to Read
- Reading
- Read
- Rate
- Review
- Add to Shelf
- Add to List

## Reading Status Button

Dropdown:

```text
Want to Read
Currently Reading
Read
Did Not Finish
Paused
Remove from Library
```

## Rating

5-star system.

Allow half stars optionally.

Recommended first version:

- 1
- 2
- 3
- 4
- 5

## Book Information

- Description
- Genres
- ISBN-10
- ISBN-13
- Publisher
- Language
- Format
- Pages
- Release date
- Original publication date

## Community Rating Distribution

Example:

```text
5 ★  █████████████  52%
4 ★  ████████       31%
3 ★  ████           12%
2 ★  █               4%
1 ★                  1%
```

## Friends Activity

Show:

- Friends who read it
- Their ratings
- Their reviews
- Currently reading

## Reviews

Tabs:

- Popular
- Recent
- Friends
- Positive
- Critical

## Similar Books

Recommendations based on:

- Genres
- Readers
- Ratings
- Authors
- Tags

---

# 12. Editions

Support multiple editions later.

Example:

```text
Book Work
 ├ Hardcover 1998
 ├ Paperback 2003
 ├ Kindle
 ├ Bulgarian edition
 └ Audiobook
```

Database:

```text
works
editions
```

Initially the app can use one `books` table, then migrate to works/editions if needed.

---

# 13. Authors

Author page:

```text
/author/:slug
```

Sections:

- Avatar/photo
- Name
- Bio
- Birth date
- Death date
- Nationality
- Website
- External links
- Books
- Series
- Average rating
- Popular works
- Reader reviews

Users can:

- Follow author
- View all books
- Sort books
- View related authors

---

# 14. Ratings

Database:

```text
ratings

id
user_id
book_id
rating
created_at
updated_at
```

Rules:

- One rating per user/book
- Rating editable
- Rating removable
- Book aggregate recalculated safely

Aggregate fields:

```text
average_rating
rating_count
```

---

# 15. Reviews

Users can write reviews.

Fields:

```text
id
user_id
book_id
title
content
rating
contains_spoilers
created_at
updated_at
```

Features:

- Markdown-lite formatting
- Spoiler warning
- Likes
- Comments
- Edit
- Delete
- Report
- Share
- Pin on profile

## Review Sorting

- Most liked
- Newest
- Highest rating
- Lowest rating
- Friends

## Spoilers

If flagged:

```text
This review contains spoilers.

[Reveal Review]
```

---

# 16. Review Comments

Nested comments limited to one reply level initially.

Features:

- Post comment
- Reply
- Edit
- Delete
- Like
- Report

Avoid infinitely nested Reddit-style trees in V1.

---

# 17. Likes

Users can like:

- Reviews
- Comments
- Lists
- Activity posts

Use separate relational tables.

---

# 18. Reading Status

Built-in statuses:

```text
want_to_read
reading
read
paused
dnf
```

Table:

```text
user_books

id
user_id
book_id
status
started_at
finished_at
progress_pages
progress_percent
created_at
updated_at
```

---

# 19. Reading Progress

Users currently reading a book can update progress.

Options:

- Page number
- Percentage

Example:

```text
Page 180 of 420
43%
```

Create feed event:

```text
Alex is 43% through The Secret History.
```

Optional user note:

```text
Things are getting extremely suspicious...
```

---

# 20. Shelves

Default shelves:

- Want to Read
- Reading
- Read

Custom examples:

- Favorites
- Gothic
- Queer Reads
- Sad Books
- 2026 Reads
- School Reading

## Shelf Settings

- Name
- Description
- Visibility
- Cover image
- Sort order

Visibility:

- Public
- Followers only
- Private

---

# 21. Lists

Lists differ from shelves.

Shelf:

Personal organization.

List:

Curated shareable collection.

Examples:

- Books That Destroyed Me Emotionally
- Best Gothic Novels
- Books to Read in Autumn

Features:

- Title
- Description
- Cover
- Ranked/unranked
- Public/private
- Likes
- Comments
- Share link

---

# 22. User Profiles

Route:

```text
/@username
```

Header:

- Avatar
- Banner
- Display name
- Username
- Bio
- Location optional
- Website
- Follow button
- Followers
- Following

Profile sections:

```text
Overview
Books
Reviews
Shelves
Lists
Activity
Stats
```

## Overview

Show:

- Currently reading
- Recent reviews
- Favorite books
- Recent activity
- Favorite genres
- Reading goal

---

# 23. Favorite Books

Allow users to pin:

- Top 4
or
- Top 6

Visually prominent.

Inspired by Letterboxd favorites.

---

# 24. Reading Goals

Example:

```text
2026 Reading Challenge

37 / 50 books
██████████████░░░░
74%
```

Users choose annual goal.

Track automatically when a book is marked read.

---

# 25. Reading Statistics

User stats page.

Charts:

- Books read per month
- Pages read per month
- Ratings distribution
- Favorite genres
- Most-read authors
- Average book length
- Average rating
- Formats
- Languages
- Reading streak

Examples:

```text
Books read: 52
Pages read: 18,430
Average rating: 4.1
Top genre: Fantasy
```

---

# 26. Social Graph

Follow model rather than mandatory friendships.

Table:

```text
follows

follower_id
following_id
created_at
```

Features:

- Follow
- Unfollow
- Follower list
- Following list
- Suggested users

Optional private accounts later.

---

# 27. User Discovery

Recommend readers based on:

- Shared books
- Similar ratings
- Genres
- Follow graph
- Activity

Example:

```text
87% reading taste match
```

---

# 28. Recommendations

Recommendation categories:

## Because You Liked

```text
Because you loved The Picture of Dorian Gray
```

## Readers Like You

Collaborative filtering.

## Genre Recommendations

```text
Dark Academia
Queer Fantasy
Gothic
```

## Friends Are Reading

Social discovery.

## Trending

Platform-wide activity.

## Hidden Gems

High-rated books with fewer ratings.

---

# 29. Recommendation V1

Do not start with machine learning.

Use weighted rules.

Example score:

```text
+5 shared genre
+10 similar author
+8 users with similar ratings liked book
+4 friend read book
+3 trending
-10 user already read
```

Later replace with more advanced algorithms.

---

# 30. Explore Page

Sections:

- Trending this week
- Popular reviews
- New releases
- Friends are reading
- Recommended for you
- Hidden gems
- Popular lists
- Genre spotlight
- Most anticipated

Use horizontal carousels and editorial layouts.

---

# 31. Genres

Genre pages:

```text
/genre/fantasy
```

Display:

- Hero section
- Description
- Trending books
- Highest rated
- New releases
- Popular lists
- Popular reviewers

---

# 32. Tags

Community tags enable more specific categorization.

Examples:

```text
dark-academia
found-family
enemies-to-lovers
slow-burn
gothic
melancholic
queer
cozy
```

Books may have both official genres and community tags.

---

# 33. Activity System

Store activity events.

Types:

```text
BOOK_RATED
BOOK_REVIEWED
BOOK_STARTED
BOOK_FINISHED
BOOK_ADDED_TO_SHELF
PROGRESS_UPDATED
USER_FOLLOWED
LIST_CREATED
LIST_LIKED
```

Table:

```text
activities
```

Fields:

```text
id
user_id
type
entity_type
entity_id
metadata_json
created_at
```

---

# 34. Notifications

Types:

- New follower
- Review like
- Review comment
- Comment reply
- List like
- Mention
- Followed user publishes review
- Reading goal completed

Notification menu should include:

- Unread badge
- Mark read
- Mark all read
- Delete optional

Supabase Realtime can push new notifications.

---

# 35. Messaging — Future

Optional later feature.

Direct messages between users.

Do not make this MVP.

Features later:

- Conversations
- Message requests
- Blocking
- Read receipts
- Image attachments

---

# 36. Search UX

Top search should support keyboard interaction.

When typing:

```text
dor...
```

Dropdown:

```text
BOOKS
The Picture of Dorian Gray

AUTHORS
Oscar Wilde

USERS
@dorianfan
```

Use debouncing:

```text
250–400ms
```

---

# 37. Global Command Search — Future

Desktop shortcut:

```text
Ctrl + K
```

Search:

- Books
- Users
- Authors
- Navigation
- Shelves

---

# 38. Design Direction

SHELVES should feel:

- Editorial
- Literary
- Modern
- Warm
- Premium
- Calm
- Social
- Atmospheric

Avoid:

- Generic dashboard look
- Excessive rounded cards everywhere
- Overuse of gradients
- Extremely corporate SaaS design
- Goodreads-like beige table layouts

---

# 39. Visual Identity

Recommended brand mood:

```text
Modern bookstore
+
editorial magazine
+
social discovery app
```

Possible palette direction:

### Light

```text
Background       #F7F5F0
Surface          #FFFFFF
Primary text     #1C1B1A
Secondary text   #6D6964
Border           #E7E1D9
Accent           #496B54
Accent hover     #3F5D49
```

### Dark

```text
Background       #111210
Surface          #191A17
Raised surface   #20221E
Primary text     #F2F0E9
Secondary text   #A7A59F
Border           #30322D
Accent           #8CAB8E
```

The exact colors can evolve.

---

# 40. Typography

Recommended combination:

Headings:

- Fraunces
- Cormorant
- Playfair Display
- Libre Baskerville

UI/body:

- Inter
- Manrope
- Geist
- Source Sans

Recommended:

```text
Headings: Fraunces
UI:       Inter
```

This creates a literary personality without making the UI difficult to read.

---

# 41. Layout System

Desktop max width:

```text
1280–1440px
```

Content widths:

```text
Standard content: 1200px
Reading/review text: 700–760px
```

Spacing system:

```text
4
8
12
16
24
32
48
64
96
```

---

# 42. Card Design

Book cards should not be giant containers.

Favor:

```text
Cover
Title
Author
Rating
```

Allow artwork/covers to dominate.

Hover:

- Slight lift
- Shadow
- Quick actions
- Rating indicator

Animations should be subtle.

---

# 43. Book Cover Ratios

Use consistent ratio:

```text
2:3
```

Use object-fit cover.

Fallback cover should show:

- SHELVES logo
- Book title
- Author

---

# 44. Home Design

Suggested desktop:

```text
-------------------------------------------------
Header
-------------------------------------------------

Welcome back, Alex

Continue Reading
[ Large active book card ]

Your Feed                 Trending Books
[ activity ]              [ cover ]
[ activity ]              [ cover ]
[ activity ]              [ cover ]

Recommended For You
[ cover ][ cover ][ cover ][ cover ][ cover ]

Popular Reviews

Reading Goal
```

---

# 45. Book Page Layout

Desktop:

```text
-------------------------------------------------
cover | book details
cover | rating/actions
cover | metadata
-------------------------------------------------

About

Friends Activity

Ratings Distribution

Reviews

Similar Books
```

Keep primary book actions sticky on large screens if useful.

---

# 46. Profile Design

Profile header can use:

- Banner
- Circular avatar
- Name
- Username
- Bio
- Social counts

Below:

```text
Currently Reading

Favorite Books

Recent Reviews

Reading Stats
```

Make profiles feel personal.

---

# 47. Mobile Design

Mobile is a first-class experience.

Requirements:

- Bottom navigation
- Touch targets >= 44px
- Horizontal book carousels
- Collapsed metadata
- Bottom-sheet actions
- Sticky reading controls where appropriate
- Avoid desktop-only hover interaction

---

# 48. Responsive Breakpoints

Example:

```text
mobile       < 640
tablet       640–1024
desktop      > 1024
wide         > 1440
```

---

# 49. Accessibility

Target WCAG AA.

Requirements:

- Keyboard navigation
- Visible focus states
- Semantic HTML
- ARIA labels where necessary
- Correct heading hierarchy
- Sufficient contrast
- Alt text
- Reduced motion support
- Screen reader labels
- Form error descriptions

---

# 50. Database Schema

Core tables:

```text
profiles
books
authors
book_authors
genres
book_genres
ratings
reviews
review_likes
review_comments
comment_likes
user_books
shelves
shelf_books
lists
list_books
list_likes
follows
activities
notifications
reading_goals
reports
blocks
admin_audit_logs
```

---

# 51. Profiles Table

```sql
profiles

id uuid primary key references auth.users
username text unique not null
display_name text
bio text
avatar_url text
banner_url text
website text
location text
role text default 'user'
created_at timestamptz
updated_at timestamptz
```

---

# 52. Books Table

```sql
books

id uuid primary key
external_google_id text
open_library_id text
isbn10 text
isbn13 text
slug text unique
title text not null
subtitle text
description text
cover_url text
publisher text
published_date date
original_publication_date date
page_count integer
language text
average_rating numeric
rating_count integer
review_count integer
created_at timestamptz
updated_at timestamptz
```

---

# 53. Authors Table

```sql
authors

id uuid primary key
name text not null
slug text unique
bio text
photo_url text
birth_date date
death_date date
website text
created_at timestamptz
```

---

# 54. Ratings Table

```sql
ratings

id uuid primary key
user_id uuid
book_id uuid
rating smallint
created_at timestamptz
updated_at timestamptz

unique(user_id, book_id)
```

---

# 55. Reviews Table

```sql
reviews

id uuid primary key
user_id uuid
book_id uuid
title text
content text
rating smallint
contains_spoilers boolean
is_hidden boolean default false
created_at timestamptz
updated_at timestamptz
```

---

# 56. Shelves

```sql
shelves

id uuid
user_id uuid
name text
slug text
description text
visibility text
is_system boolean
created_at timestamptz
```

```sql
shelf_books

shelf_id uuid
book_id uuid
added_at timestamptz
```

---

# 57. Lists

```sql
lists

id uuid
user_id uuid
title text
slug text
description text
visibility text
is_ranked boolean
cover_url text
created_at timestamptz
```

```sql
list_books

list_id uuid
book_id uuid
position integer
note text
```

---

# 58. User Books

```sql
user_books

id uuid
user_id uuid
book_id uuid
status text
started_at date
finished_at date
progress_pages integer
progress_percent numeric
created_at timestamptz
updated_at timestamptz

unique(user_id, book_id)
```

---

# 59. Follows

```sql
follows

follower_id uuid
following_id uuid
created_at timestamptz

primary key(follower_id, following_id)
```

Prevent self-following.

---

# 60. Notifications

```sql
notifications

id uuid
user_id uuid
actor_id uuid
type text
entity_type text
entity_id uuid
read_at timestamptz
created_at timestamptz
```

---

# 61. Reports

```sql
reports

id uuid
reporter_id uuid
target_type text
target_id uuid
reason text
details text
status text
moderator_id uuid
created_at timestamptz
resolved_at timestamptz
```

---

# 62. Blocking

```sql
blocks

blocker_id uuid
blocked_id uuid
created_at timestamptz
```

Blocking should prevent:

- Following
- Seeing activity
- Messaging later
- Direct interaction

---

# 63. Backend API

Suggested prefix:

```text
/api/v1
```

---

# 64. Auth Routes

Most Supabase auth occurs client-side, but backend may expose helpers.

```text
GET /api/v1/me
PATCH /api/v1/me
```

---

# 65. Book Routes

```text
GET    /api/v1/books/search
GET    /api/v1/books/:id
POST   /api/v1/books/import
GET    /api/v1/books/:id/reviews
GET    /api/v1/books/:id/similar
GET    /api/v1/books/:id/friends
```

---

# 66. Rating Routes

```text
PUT    /api/v1/books/:id/rating
DELETE /api/v1/books/:id/rating
```

---

# 67. Review Routes

```text
POST   /api/v1/books/:id/reviews
GET    /api/v1/reviews/:id
PATCH  /api/v1/reviews/:id
DELETE /api/v1/reviews/:id

POST   /api/v1/reviews/:id/like
DELETE /api/v1/reviews/:id/like

POST   /api/v1/reviews/:id/comments
```

---

# 68. Library Routes

```text
PUT    /api/v1/books/:id/status
DELETE /api/v1/books/:id/status

PATCH  /api/v1/books/:id/progress

GET    /api/v1/users/:username/library
```

---

# 69. Shelf Routes

```text
GET    /api/v1/users/:username/shelves
POST   /api/v1/shelves
PATCH  /api/v1/shelves/:id
DELETE /api/v1/shelves/:id

POST   /api/v1/shelves/:id/books
DELETE /api/v1/shelves/:id/books/:bookId
```

---

# 70. Follow Routes

```text
POST   /api/v1/users/:id/follow
DELETE /api/v1/users/:id/follow

GET    /api/v1/users/:id/followers
GET    /api/v1/users/:id/following
```

---

# 71. Feed Routes

```text
GET /api/v1/feed
GET /api/v1/feed/following
```

Use cursor pagination.

Avoid offset pagination for endless feeds.

---

# 72. Explore Routes

```text
GET /api/v1/explore/trending
GET /api/v1/explore/recommended
GET /api/v1/explore/reviews
GET /api/v1/explore/lists
```

---

# 73. Notification Routes

```text
GET   /api/v1/notifications
PATCH /api/v1/notifications/:id/read
POST  /api/v1/notifications/read-all
```

---

# 74. Admin Routes

```text
GET    /api/v1/admin/users
GET    /api/v1/admin/reports
PATCH  /api/v1/admin/reports/:id

GET    /api/v1/admin/books
PATCH  /api/v1/admin/books/:id
DELETE /api/v1/admin/books/:id

POST   /api/v1/admin/books/merge

GET    /api/v1/admin/analytics
```

All admin routes require server-side role checking.

---

# 75. Validation

Use Zod.

Validate:

- API body
- URL params
- Query params
- Environment variables

Never trust frontend validation alone.

---

# 76. Security

## Required

- JWT validation
- Role authorization
- Rate limiting
- Input validation
- Output sanitization
- SQL injection safety
- XSS protection
- CORS configuration
- Secure headers
- Server-side ownership checks
- RLS

Never put Supabase service-role key in frontend.

---

# 77. Supabase RLS

Enable RLS on user-owned tables.

Examples:

Users may edit only:

```text
their profile
their shelves
their reviews
their reading progress
their lists
```

Public users may read only public resources.

Admin privileges should use backend/server credentials.

---

# 78. Rate Limiting

Limit actions such as:

- Login attempts
- Search
- Review creation
- Comments
- Likes
- Follows
- Reports

Example:

```text
Search:
60 requests/minute

Write actions:
30 requests/minute
```

Tune later.

---

# 79. Moderation

User actions:

- Report review
- Report comment
- Report user
- Block user

Report reasons:

- Spam
- Harassment
- Hate
- Spoilers
- Explicit content
- Impersonation
- Other

---

# 80. Admin Dashboard

Main dashboard cards:

```text
Total users
Daily active users
Books in DB
Reviews
Ratings
Reports awaiting review
```

Charts:

- Signups per day
- Reviews per day
- Active users
- Most active genres
- Most reviewed books

---

# 81. User Management

Admin can:

- Search user
- View profile
- View moderation history
- Warn
- Suspend
- Ban
- Unban
- Change role

Require confirmation for destructive actions.

---

# 82. Book Management

Admin can:

- Search books
- Edit metadata
- Change cover
- Fix genres
- Merge duplicates
- Delete invalid entries
- Refresh external metadata

---

# 83. Duplicate Detection

Possible matching:

- ISBN
- Google Books ID
- Open Library ID
- Normalized title + author

Do not rely only on title.

---

# 84. Caching

TanStack Query handles client cache.

Backend caching targets:

- Popular books
- Trending
- External API searches
- Author data
- Recommendations

Initial implementation can use in-memory caching.

Later:

- Redis

---

# 85. Performance

Requirements:

- Lazy-load routes
- Lazy-load images
- Responsive image sizes
- Debounced search
- Paginated reviews
- Cursor-based feed
- DB indexes
- Avoid N+1 queries

Important DB indexes:

```text
reviews(book_id)
reviews(user_id)
ratings(book_id)
ratings(user_id)
user_books(user_id)
user_books(book_id)
follows(follower_id)
follows(following_id)
activities(user_id, created_at)
notifications(user_id, created_at)
```

---

# 86. Image Optimization

Book covers:

- Serve external cover when reliable
- Cache/localize later if needed

User images:

- Supabase Storage
- Compress before upload
- Restrict file size
- Restrict MIME type

Avatar example:

```text
max 5 MB
jpg/png/webp
```

---

# 87. Error Handling

API error format:

```json
{
  "error": {
    "code": "REVIEW_ALREADY_EXISTS",
    "message": "You already reviewed this book."
  }
}
```

Frontend should display human-readable errors.

---

# 88. Empty States

Every empty page should still feel intentional.

Example:

```text
You haven't reviewed anything yet.

Your future hot takes are waiting.

[Find a book]
```

---

# 89. Loading States

Use:

- Skeletons
- Progressive loading
- Cover placeholders

Avoid full-page spinners when possible.

---

# 90. Toast Notifications

Use for:

- Book added
- Review saved
- Followed
- Shelf created
- Error

Do not use toast for every tiny action.

---

# 91. Theme System

Support:

- Light
- Dark
- System

Store preference locally and optionally in profile.

Future fun themes:

- Forest
- Midnight
- Paper
- Burgundy

---

# 92. Localization — Future

Architecture should not prevent translation.

Possible first languages:

- English
- Bulgarian

Use translation keys instead of hardcoded UI text if localization becomes a requirement.

---

# 93. SEO

Public pages should be crawlable eventually.

Important pages:

- Book pages
- Author pages
- Public profiles
- Public lists

Because Vite SPA has limited SEO, potential future migration:

```text
React + Vite → Next.js
```

Not required for initial school project.

---

# 94. Folder Structure — Frontend

```text
client/
│
├── src/
│   ├── api/
│   │   ├── books.ts
│   │   ├── reviews.ts
│   │   ├── users.ts
│   │   └── feed.ts
│   │
│   ├── assets/
│   │
│   ├── components/
│   │   ├── books/
│   │   ├── reviews/
│   │   ├── profile/
│   │   ├── navigation/
│   │   ├── feed/
│   │   ├── forms/
│   │   └── ui/
│   │
│   ├── features/
│   │   ├── auth/
│   │   ├── library/
│   │   ├── shelves/
│   │   ├── reviews/
│   │   ├── social/
│   │   └── notifications/
│   │
│   ├── hooks/
│   │
│   ├── layouts/
│   │
│   ├── pages/
│   │   ├── Home/
│   │   ├── Explore/
│   │   ├── Book/
│   │   ├── Author/
│   │   ├── Profile/
│   │   ├── Library/
│   │   ├── Shelf/
│   │   ├── List/
│   │   ├── Notifications/
│   │   ├── Settings/
│   │   └── Admin/
│   │
│   ├── stores/
│   │
│   ├── styles/
│   │
│   ├── types/
│   │
│   ├── utils/
│   │
│   ├── App.tsx
│   └── main.tsx
│
└── package.json
```

---

# 95. Folder Structure — Backend

```text
server/
│
├── src/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   │   ├── auth.ts
│   │   ├── admin.ts
│   │   ├── rateLimit.ts
│   │   └── errorHandler.ts
│   │
│   ├── routes/
│   │   ├── books.routes.ts
│   │   ├── reviews.routes.ts
│   │   ├── users.routes.ts
│   │   ├── shelves.routes.ts
│   │   ├── feed.routes.ts
│   │   └── admin.routes.ts
│   │
│   ├── services/
│   │   ├── supabase.service.ts
│   │   ├── bookImport.service.ts
│   │   ├── recommendation.service.ts
│   │   ├── feed.service.ts
│   │   └── notification.service.ts
│   │
│   ├── schemas/
│   ├── types/
│   ├── utils/
│   ├── app.ts
│   └── server.ts
│
└── package.json
```

---

# 96. Shared Package — Optional

Monorepo:

```text
shelves/
│
├── client/
├── server/
├── shared/
└── package.json
```

`shared/` can contain:

- Zod schemas
- Shared types
- Constants

---

# 97. Environment Variables

Frontend:

```env
VITE_API_URL=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Backend:

```env
PORT=
CLIENT_URL=

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

GOOGLE_BOOKS_API_KEY=
```

Never commit `.env`.

---

# 98. Testing

## Frontend

Use:

- Vitest
- React Testing Library

Test:

- Forms
- Components
- Rating behavior
- Shelf interactions

## Backend

Use:

- Vitest/Jest
- Supertest

Test:

- Auth
- Authorization
- Reviews
- Ratings
- Follow logic
- Admin routes

---

# 99. E2E Testing

Later:

- Playwright

Critical flows:

```text
Register
Login
Search book
Add to shelf
Rate
Review
Follow user
Edit profile
```

---

# 100. Deployment

Recommended:

Frontend:

```text
Vercel
```

Backend:

```text
Render
Railway
Fly.io
```

Database/auth/storage:

```text
Supabase
```

---

# 101. Logging

Backend logging:

- Request errors
- External API failures
- Import failures
- Admin actions

Use:

- Pino
or
- Winston

Avoid logging sensitive tokens.

---

# 102. Analytics

Internal analytics can include:

- DAU
- MAU
- Reviews/day
- Ratings/day
- Search queries
- Conversion from search → shelf
- Popular genres
- Trending books

Privacy-friendly analytics preferred.

---

# 103. MVP — Phase 1

Build only the essential skeleton.

### Authentication

- Register
- Login
- Logout
- Profile

### Books

- Search
- Book page
- External API import

### Library

- Want to Read
- Reading
- Read

### Ratings

- Add/edit/remove

### Reviews

- Create
- Edit
- Delete

### Profile

- Avatar
- Bio
- Library
- Reviews

This phase already produces a functional product.

---

# 104. Phase 2 — Social

Add:

- Follows
- Following feed
- Review likes
- Review comments
- Notifications
- User discovery
- Public shelves

---

# 105. Phase 3 — Discovery & Personalized Recommendations

Add:

- Explore page
- Personalized hybrid recommendation algorithm
- Recommendations
- Trending
- Similar books
- Genre pages
- Popular lists

---

# 106. Phase 4 — Reading Experience

Add:

- Progress tracking
- Reading goals
- Statistics
- Favorite books
- Custom shelves
- Lists

---

# 107. Phase 5 — Administration

Add:

- Admin dashboard
- User moderation
- Reports
- Book editing
- Duplicate merging
- Analytics

---

# 108. Phase 6 — Advanced Features

Potential:

- Private profiles
- Direct messages
- Book clubs
- Reading groups
- Discussion threads
- Quotes
- Notes
- Book annotations
- Audiobook tracking
- E-reader integrations
- Import Goodreads library
- Export data
- Mobile app

---

# 109. Book Clubs — Future

Users could create clubs.

Features:

- Club profile
- Members
- Current book
- Reading schedule
- Polls
- Discussion
- Club shelf

---

# 110. Quotes — Future

Users save favorite quotes.

Fields:

```text
quote
book
page
edition
private/public
```

Important: copyrighted quote length policies should be considered for public display.

---

# 111. Goodreads Import — Future

Allow user to upload Goodreads CSV export.

Import:

- Read books
- Ratings
- Reading dates
- Shelves

Useful for onboarding existing readers.

---

# 112. Data Export

Users should eventually be able to export their own data.

Formats:

- JSON
- CSV

---

# 113. Account Settings

Sections:

```text
Profile
Account
Appearance
Privacy
Notifications
Blocked Users
Data
Security
```

---

# 114. Privacy Settings

Possible options:

```text
Profile visibility
Shelf visibility default
Reading activity visibility
Allow followers
Show online status
```

---

# 115. Notification Settings

Allow toggles:

- New followers
- Likes
- Comments
- Mentions
- Follow activity
- Product announcements

---

# 116. Content Moderation Rules

Prevent:

- Spam
- Harassment
- Automated abuse
- Review manipulation
- Rating botting

Potential controls:

- Account-age thresholds
- Rate limits
- Duplicate text detection
- Report thresholds

---

# 117. Rating Integrity

Avoid artificially changing ratings.

Aggregate should count one rating per user.

Potential later protections:

- Exclude banned users
- Detect suspicious mass-rating behavior
- Minimum account age for weighted averages

---

# 118. Recommendation Privacy

Recommendations should use platform behavior without exposing private shelves or private actions to other users.

---

# 119. UI Component Library

Core reusable components:

```text
Avatar
Badge
Button
Card
Dialog
Dropdown
Input
Textarea
Tabs
Tooltip
Popover
BottomSheet
Skeleton
Toast
Pagination
InfiniteScroll
BookCover
BookCard
BookRow
RatingStars
ReviewCard
ProfileCard
UserChip
ShelfCard
ListCard
EmptyState
ErrorState
```

---

# 120. BookCard Variants

Create variants rather than one giant component.

```text
compact
standard
horizontal
ranked
carousel
search-result
```

---

# 121. Motion

Use subtle motion.

Examples:

- Cover hover
- Like animation
- Dropdown fade
- Modal scale
- Page transition
- Shelf add confirmation

Honor:

```css
prefers-reduced-motion
```

---

# 122. Design Personality

The app should feel like a place readers want to stay.

Use:

- Large book artwork
- Editorial headings
- Lots of whitespace
- Texture very sparingly
- Warm surfaces
- Elegant typography
- Small delightful interactions

Avoid turning every section into a separate floating rounded card.

---

# 123. Recommended Landing Page

Logged-out landing page:

```text
Hero:
Your books. Your shelves. Your people.

Track what you read, discover what comes next,
and share the books that stay with you.

[Create account] [Explore books]

Trending books

Popular reviews

Discover by genre

Community lists

Footer
```

---

# 124. Brand Copy Direction

Tone:

- Smart
- Warm
- Slightly playful
- Reader-focused

Examples:

```text
Your future five-star read is probably hiding here.

Nothing on this shelf yet.

A dangerously good reading streak.

You and this book clearly have history.
```

---

# 125. Recommended First Database Migration Order

1. profiles
2. books
3. authors
4. book_authors
5. genres
6. book_genres
7. user_books
8. ratings
9. reviews
10. shelves
11. shelf_books
12. follows
13. activities
14. notifications
15. review_likes
16. review_comments
17. lists
18. list_books
19. reports

---

# 126. Recommended Build Order

Do not build page-by-page randomly.

Build vertically.

Example:

### Book Search Feature

Build:

```text
DB
→ backend service
→ API route
→ frontend query hook
→ search UI
→ book page integration
```

Then move to the next feature.

This keeps features functional at every stage.

---

# 127. Codex Development Rules

When using Codex for implementation:

1. Do not rewrite unrelated code.
2. Preserve existing visual identity unless a design task explicitly changes it.
3. Use TypeScript strict mode.
4. Avoid `any`.
5. Validate all backend inputs with Zod.
6. Centralize API calls.
7. Avoid business logic inside React components.
8. Keep components reasonably small.
9. Reuse primitives.
10. Keep database operations inside services/repositories.
11. Add proper loading/error/empty states.
12. Preserve responsive behavior.
13. Do not expose secrets.
14. Add migration files instead of manually changing production DB.
15. Test destructive operations.
16. Prefer accessible native behavior.
17. Avoid unnecessary dependencies.
18. Document non-obvious architecture decisions.

---

# 128. Suggested Route Map

```text
/
 /login
 /register
 /forgot-password

 /home
 /explore
 /search

 /book/:slug
 /author/:slug
 /genre/:slug

 /@username
 /@username/reviews
 /@username/books
 /@username/shelves
 /@username/lists
 /@username/stats

 /shelf/:id
 /list/:id

 /library
 /notifications
 /settings

 /admin
 /admin/users
 /admin/books
 /admin/reports
 /admin/analytics
```

---

# 129. Success Criteria

A successful first production-quality version should allow a user to:

- Register
- Build a profile
- Search real books
- Open detailed book pages
- Track reading status
- Rate books
- Write reviews
- Create shelves
- Follow readers
- See social activity
- Receive notifications
- Discover recommendations
- Track yearly reading goals
- View statistics

The UI should feel cohesive on desktop and mobile.

---


# 131. Personalized Recommendation Algorithm — Core Requirement

Personalized book recommendations are a **core product feature**, not an optional future enhancement.

SHELVES should build a user taste profile and continuously improve recommendations based on explicit and implicit behavior.

The recommendation system should eventually use a **hybrid model** that combines:

- Content-based filtering
- Collaborative filtering
- Social graph signals
- Popularity/trending signals
- User behavior signals
- Diversity and novelty controls
- Negative feedback
- Contextual signals

The system should be designed so the first version works without machine learning, while the architecture can later evolve toward embeddings, vector similarity, or trained ranking models.

## 131.1 Recommendation Inputs

The system may use:

### Explicit Signals

- Star ratings
- Favorite books
- Favorite genres
- Favorite authors
- User-selected onboarding interests
- Books marked `Read`
- Books marked `Want to Read`
- Books marked `DNF`
- Books removed from recommendations
- "Not interested" feedback

### Implicit Signals

- Book page visits
- Search queries
- Reviews opened
- Books added to shelves
- Reading progress
- Books completed
- Lists opened or liked
- Authors followed
- Time spent interacting with a book page
- Repeated genre browsing

Avoid over-weighting accidental clicks.

## 131.2 User Taste Profile

Each user should have a dynamic taste profile containing weighted preferences such as:

```text
Genres:
Gothic              0.92
Fantasy             0.84
Literary Fiction    0.81
Dark Academia       0.78
Romance             0.31

Authors:
Oscar Wilde         0.95
Donna Tartt         0.82

Tags:
melancholic         0.91
queer               0.87
atmospheric         0.84
slow-burn           0.55
```

Weights should change as users interact with the platform.

## 131.3 Cold Start

New users initially have little behavioral data.

Use onboarding information to bootstrap recommendations:

- Favorite genres
- 3–10 favorite books
- Authors they like
- Books already read
- Optional disliked genres
- Optional "not interested" categories

For users who skip onboarding:

- Trending books
- Genre diversity
- Popular books
- Editorial/community picks

As enough behavior is collected, gradually reduce generic recommendations.

## 131.4 Candidate Generation

Do not score the entire database for every request.

Generate candidate books from multiple sources:

```text
Content similarity candidates
Collaborative candidates
Followed users' books
Trending candidates
Genre candidates
Author candidates
Hidden-gem candidates
```

Then merge, deduplicate, filter, and rank them.

## 131.5 Content-Based Filtering

Compare books using:

- Genres
- Tags
- Authors
- Series
- Description keywords
- Publication period
- Language
- User-created tags

Initial similarity can be rule-based.

Later use embeddings for:

- Book description similarity
- Semantic tag similarity
- Mood/theme similarity

## 131.6 Collaborative Filtering

Collaborative filtering answers:

> Readers with taste similar to yours liked these books.

Possible V1 strategy:

1. Find users who rated some of the same books
2. Compare rating similarity
3. Weight similar users
4. Find books those users rated highly
5. Remove books the current user has already read
6. Rank remaining books

Later approaches:

- User-user collaborative filtering
- Item-item collaborative filtering
- Matrix factorization
- Implicit feedback models
- Learned embeddings

## 131.7 Social Signals

Recommendations should also consider people the user follows.

Examples:

```text
3 people you follow loved this.
Popular with readers you follow.
Your friends are reading this now.
```

Social signals should influence rankings but should not dominate taste similarity.

## 131.8 Trending Signals

A trending score may use:

- New ratings
- New reviews
- Shelf additions
- Reading starts
- Reading completions
- Search interest

Use time decay so old popularity does not remain permanently dominant.

Example conceptual formula:

```text
trend_score =
new_reads * weight
+ new_reviews * weight
+ new_ratings * weight
+ shelf_additions * weight
```

Then apply time decay.

## 131.9 Recommendation V1 Scoring

Initial implementation can use a weighted score.

Example:

```text
recommendation_score =

genre_similarity        * 0.22
+ tag_similarity        * 0.14
+ author_affinity       * 0.12
+ collaborative_score   * 0.24
+ social_score          * 0.10
+ trending_score        * 0.07
+ community_rating      * 0.05
+ novelty_score         * 0.06
```

These weights are starting points, not permanent constants.

They should be configurable and tuned using real behavior.

## 131.10 Strong Positive Signals

Examples:

```text
User rates book 5★          +high
Adds to favorites           +very high
Finishes book               +medium
Writes positive review      +high
Adds to want-to-read        +medium
Likes a list containing it  +low/medium
```

## 131.11 Negative Signals

Examples:

```text
Rates book 1★               -high
Marks DNF                    -medium/high
Clicks "Not interested"     -very high
Removes from suggestions     -very high
Repeatedly ignores genre    -small
```

Negative signals should be used carefully.

One disliked book should not permanently suppress an entire genre.

## 131.12 Filtering Before Ranking

Never recommend:

- Books already marked read
- Books explicitly hidden
- Books blocked by user preferences
- Invalid/deleted books
- Duplicate editions of the same work when unnecessary

Optionally reduce:

- Books currently reading
- Already want-to-read books in discovery sections

Those may instead appear under a "From Your Library" section.

## 131.13 Diversity

Without diversity controls, recommendation systems can become repetitive.

The final list should intentionally mix:

- Different authors
- Different subgenres
- Popular and lesser-known books
- Familiar themes and exploratory picks

Example:

Instead of recommending ten Oscar Wilde books because the user liked one, limit author repetition.

## 131.14 Novelty and Exploration

Reserve part of the recommendation feed for exploration.

Example:

```text
80% high-confidence recommendations
20% exploratory recommendations
```

Exploration helps discover new user interests.

## 131.15 Recommendation Explanations

Every recommendation should optionally expose a human-readable reason.

Examples:

```text
Because you loved The Picture of Dorian Gray

Because you read a lot of Gothic fiction

Readers with similar taste loved this

Popular among people you follow

Because you follow Oscar Wilde

A hidden gem in Dark Academia
```

Do not expose internal numeric scores.

## 131.16 Recommendation Sections

Recommended home/explore sections:

```text
Made for You
Because You Loved...
Readers Like You Also Loved
Popular With People You Follow
More From Authors You Love
Your Favorite Genres
Hidden Gems
Try Something Different
Trending For You
```

Each section can use slightly different ranking logic.

## 131.17 Recommendation Feedback

Book recommendation cards should optionally allow:

```text
Not interested
I've already read this
Show me fewer books like this
Show me more books like this
```

Feedback must update future results.

## 131.18 Recommendation Events Table

Track recommendation interactions.

Suggested table:

```sql
recommendation_events

id uuid primary key
user_id uuid not null
book_id uuid not null
event_type text not null
source text
recommendation_id uuid
created_at timestamptz
```

Possible events:

```text
IMPRESSION
OPENED
SAVED
RATED
STARTED
FINISHED
DISMISSED
NOT_INTERESTED
MORE_LIKE_THIS
LESS_LIKE_THIS
```

## 131.19 Recommendation Snapshots

Optional table:

```sql
recommendation_batches

id uuid primary key
user_id uuid
algorithm_version text
generated_at timestamptz
metadata jsonb
```

This helps evaluate which algorithm version generated a recommendation.

## 131.20 Preference Table

Optional derived profile:

```sql
user_taste_profiles

user_id uuid primary key
genre_weights jsonb
author_weights jsonb
tag_weights jsonb
updated_at timestamptz
```

For a more normalized approach, separate tables can be used later.

## 131.21 Recommendation API

Suggested endpoints:

```text
GET  /api/v1/recommendations
GET  /api/v1/recommendations/because-you-liked/:bookId
GET  /api/v1/recommendations/hidden-gems
GET  /api/v1/recommendations/social

POST /api/v1/recommendations/:bookId/feedback
```

Example query:

```text
GET /api/v1/recommendations?limit=30
```

## 131.22 Recommendation Response

Example:

```json
{
  "items": [
    {
      "book": {},
      "reason": "Because you loved The Picture of Dorian Gray",
      "source": "content_similarity"
    }
  ],
  "algorithmVersion": "hybrid-v1"
}
```

## 131.23 Recommendation Service

Backend structure:

```text
recommendation.service.ts

├── getUserTasteProfile()
├── generateContentCandidates()
├── generateCollaborativeCandidates()
├── generateSocialCandidates()
├── generateTrendingCandidates()
├── applyExclusions()
├── scoreCandidates()
├── diversifyResults()
├── generateReasons()
└── recordImpressions()
```

Keep ranking logic out of controllers.

## 131.24 Caching

Personalized recommendations may be cached briefly.

Possible strategy:

```text
Cache recommendation batch:
15–60 minutes
```

Invalidate or refresh after strong signals such as:

- New 5-star rating
- DNF
- Favorite added
- Large onboarding preference change
- "Not interested" feedback

Do not regenerate a huge recommendation set on every page render.

## 131.25 Background Recalculation

As the application grows, taste profiles and recommendation batches can be recalculated asynchronously.

Possible future jobs:

```text
update user taste profile
calculate item similarities
refresh trending scores
generate recommendation candidates
```

Supabase scheduled jobs or a dedicated worker can eventually handle this.

For the school/MVP implementation, synchronous or periodically cached computation is acceptable.

## 131.26 Evaluation Metrics

Measure whether recommendations actually work.

Important metrics:

```text
Recommendation click-through rate
Save-to-shelf rate
Reading-start rate
Completion rate
Rating after recommendation
Dismissal rate
Not-interested rate
Recommendation diversity
Recommendation coverage
```

A recommendation is much more valuable if a user saves or reads it than if they merely click it.

## 131.27 Offline Evaluation

Later, historical data can be split:

```text
Known user interactions
        ↓
Hide some positive interactions
        ↓
Generate recommendations
        ↓
Check whether hidden books are recovered
```

Possible metrics:

- Precision@K
- Recall@K
- NDCG@K
- Hit Rate

## 131.28 Privacy

Recommendation logic must never expose private user behavior.

Private shelves can influence that user's own recommendations but should not be shown as social evidence to others.

Bad:

```text
Recommended because Alex secretly added this to a private shelf.
```

Good:

```text
Recommended based on your reading taste.
```

## 131.29 Popularity Bias

Do not let bestsellers consume every recommendation section.

Use:

- Popularity normalization
- Hidden-gem sections
- Diversity reranking
- Exploration slots

This gives smaller books a chance to surface.

## 131.30 Rating Bias

Different users use star ratings differently.

For example:

```text
User A average rating: 4.6
User B average rating: 3.1
```

Future collaborative filtering should normalize individual rating tendencies rather than assuming a 4★ means exactly the same thing for everyone.

## 131.31 Algorithm Versioning

Always version recommendation logic.

Examples:

```text
hybrid-v1
hybrid-v2
collaborative-v1
embedding-v1
```

Store the version with recommendation impressions so changes can be evaluated.

## 131.32 Future Embedding-Based Recommendations

A later advanced version may generate vector embeddings for:

- Book descriptions
- Genres
- Tags
- Reviews
- User taste profiles

Then use vector similarity.

Potential architecture:

```text
Book metadata
    ↓
Embedding model
    ↓
Vector representation
    ↓
pgvector / vector search
    ↓
Similar books
```

Supabase PostgreSQL can support `pgvector`, making this a natural future expansion.

## 131.33 Future Learned Ranking

After sufficient interaction data exists, candidate ranking can move from manually chosen weights to a learned model.

Potential features:

```text
genre similarity
tag similarity
author preference
friend interactions
rating similarity
book popularity
recency
user activity
novelty
```

The model would rank candidates rather than generate books from nothing.

## 131.34 Recommendation Development Phases

### Recommendation Phase A — MVP

Use:

- Favorite genres
- Favorite books
- Author similarity
- Book genres
- Ratings
- Trending

Rule-based weighted scoring.

### Recommendation Phase B — Personalized Hybrid

Add:

- User-user similarity
- Item-item similarity
- Social graph
- Negative feedback
- Diversity reranking
- Taste profile updates

### Recommendation Phase C — Advanced

Add:

- Embeddings
- pgvector
- Better collaborative filtering
- Behavior-based ranking
- Algorithm experiments

### Recommendation Phase D — Intelligent Ranking

Potential:

- Learned ranking
- Context-aware recommendations
- Session personalization
- Advanced exploration/exploitation

## 131.35 Product Requirement

The finished SHELVES product should never rely only on:

```text
"Popular Books"
```

for discovery.

A central differentiator of the app must be:

> **SHELVES learns what each reader actually likes and produces increasingly personalized book recommendations as they use the platform.**

This requirement should influence the database schema, activity tracking, onboarding flow, backend architecture, analytics, and Explore/Home design from the beginning.

---

# 130. Final Product Direction

SHELVES should not try to clone Goodreads pixel-for-pixel.

The strongest version is:

> **A modern social reading platform that keeps Goodreads' useful book database and tracking concepts, but rebuilds the experience around visual discovery, stronger social identity, cleaner interaction design, and personalized recommendations.**

The core value proposition:

```text
Track what you read.
Remember what you loved.
Discover what comes next.
Find people who read like you.
```

If executed well, SHELVES can function as a serious full-stack portfolio project rather than simply a school CRUD assignment.
