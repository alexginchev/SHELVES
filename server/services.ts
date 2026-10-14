import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type {
  Book,
  Reading,
  Recommendation,
  Post,
  Comment,
  Stats,
  BookSummary,
  Shelf,
  Reader,
} from "../shared/types.ts";
import { all, one, transaction } from "./db.ts";
import { readingSchema } from "../shared/types.ts";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function bookById(db: DatabaseSync, id: string) {
  const book = one<Book>(db, "SELECT * FROM books WHERE id=?", id);
  if (!book) throw new ApiError(404, "Book not found.");
  return book;
}
export function library(db: DatabaseSync, userId: string): Reading[] {
  const rows = all<Omit<Reading, "book" | "shelfIds">>(
    db,
    "SELECT book_id AS bookId,status,page,rating,review,finished_at AS finishedAt FROM reading WHERE user_id=? ORDER BY updated_at DESC",
    userId,
  );
  return rows.map((row) => ({
    ...row,
    book: bookById(db, row.bookId),
    shelfIds: all<{ id: string }>(
      db,
      "SELECT s.id FROM shelves s JOIN shelf_books sb ON sb.shelf_id=s.id WHERE s.user_id=? AND sb.book_id=?",
      userId,
      row.bookId,
    ).map((s) => s.id),
  }));
}
export function saveReading(
  db: DatabaseSync,
  userId: string,
  bookId: string,
  input: z.infer<typeof readingSchema>,
) {
  const book = bookById(db, bookId);
  if (book.pages && input.page > book.pages)
    throw new ApiError(400, `This book has ${book.pages} pages.`);
  for (const shelf of input.shelfIds)
    if (
      !one(db, "SELECT id FROM shelves WHERE id=? AND user_id=?", shelf, userId)
    )
      throw new ApiError(403, "Choose one of your own shelves.");
  transaction(db, () => {
    const old = one<{ finishedAt: string | null }>(
      db,
      "SELECT finished_at AS finishedAt FROM reading WHERE user_id=? AND book_id=?",
      userId,
      bookId,
    );
    const finished =
      input.status === "Finished"
        ? old?.finishedAt || new Date().toISOString()
        : null;
    db.prepare(
      `INSERT INTO reading (user_id,book_id,status,page,rating,review,finished_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,book_id) DO UPDATE SET status=excluded.status,page=excluded.page,rating=excluded.rating,review=excluded.review,finished_at=excluded.finished_at,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    ).run(
      userId,
      bookId,
      input.status,
      input.status === "Finished" && book.pages ? book.pages : input.page,
      input.rating,
      input.review,
      finished,
    );
    db.prepare(
      "DELETE FROM shelf_books WHERE book_id=? AND shelf_id IN (SELECT id FROM shelves WHERE user_id=?)",
    ).run(bookId, userId);
    const add = db.prepare("INSERT INTO shelf_books VALUES (?,?)");
    [...new Set(input.shelfIds)].forEach((id) => add.run(id, bookId));
  });
}
export function removeReading(
  db: DatabaseSync,
  userId: string,
  bookId: string,
) {
  transaction(db, () => {
    db.prepare(
      "DELETE FROM shelf_books WHERE book_id=? AND shelf_id IN (SELECT id FROM shelves WHERE user_id=?)",
    ).run(bookId, userId);
    db.prepare("DELETE FROM reading WHERE user_id=? AND book_id=?").run(
      userId,
      bookId,
    );
  });
}
export function recommendations(
  db: DatabaseSync,
  userId?: string,
): Recommendation[] {
  const books = all<Book>(db, "SELECT * FROM books LIMIT 500");
  const records = userId ? library(db, userId) : [];
  const hidden = new Set(
    userId
      ? all<{ bookId: string }>(
          db,
          "SELECT book_id AS bookId FROM recommendation_feedback WHERE user_id=?",
          userId,
        ).map((b) => b.bookId)
      : [],
  );
  const genres: Record<string, number> = {};
  const authors: Record<string, number> = {};
  const excluded = new Set(records.map((r) => r.bookId));
  records.forEach((r) => {
    const weight =
      r.rating >= 4
        ? r.rating - 3
        : r.rating && r.rating <= 2
          ? -1
          : r.status === "Want to read"
            ? 1
            : 0;
    genres[r.book.genre] = (genres[r.book.genre] || 0) + weight;
    authors[r.book.author] = (authors[r.book.author] || 0) + weight;
  });
  return books
    .filter((b) => !excluded.has(b.id) && !hidden.has(b.id))
    .map((b) => ({
      ...b,
      score: (genres[b.genre] || 0) + (authors[b.author] || 0),
      reason:
        (authors[b.author] || 0) > 0
          ? `More from ${b.author}`
          : (genres[b.genre] || 0) > 0
            ? `Inspired by your interest in ${b.genre.toLowerCase()}`
            : "A different path to explore",
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 24)
    .map(({ score, ...book }) => book);
}
const externalSearchSchema = z.object({
  docs: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      author_name: z.array(z.string()).optional(),
      cover_i: z.number().int().positive().optional(),
      first_publish_year: z.number().int().optional(),
      subject: z.array(z.string()).optional(),
      number_of_pages_median: z.number().int().positive().optional(),
    }),
  ),
});
// ponytail: bounded local cache only; shared cache if multiple API instances are deployed.
const searchCache = new Map<string, { at: number; books: Book[] }>();
export async function searchBooks(db: DatabaseSync, query: string) {
  const q = query.toLowerCase();
  const cached = searchCache.get(q);
  if (cached && Date.now() - cached.at < 300000) {
    cached.books.forEach((b) => importBook(db, b));
    return { items: cached.books, source: "Open Library", warning: null };
  }
  const escaped = q.replace(/[!%_]/g, "!$&");
  const local = all<Book>(
    db,
    "SELECT * FROM books WHERE lower(title) LIKE ? ESCAPE '!' OR lower(author) LIKE ? ESCAPE '!' LIMIT 20",
    `%${escaped}%`,
    `%${escaped}%`,
  );
  try {
    const url = new URL("https://openlibrary.org/search.json");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "20");
    url.searchParams.set(
      "fields",
      "key,title,author_name,cover_i,first_publish_year,subject,number_of_pages_median",
    );
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Shelves/0.1 (personal reading application)" },
    });
    if (!response.ok) throw new Error("Catalog unavailable");
    const result = externalSearchSchema.parse(await response.json());
    const books: Book[] = result.docs
      .filter((d) => /^\/works\/OL\d+W$/.test(d.key))
      .map((d) => ({
        id: d.key.split("/").pop()!,
        title: d.title.slice(0, 300),
        author:
          d.author_name?.slice(0, 3).join(", ").slice(0, 300) ||
          "Unknown author",
        genre:
          d.subject?.find((s) =>
            [
              "Fantasy",
              "Fiction",
              "Nature",
              "Poetry",
              "Romance",
              "Mystery",
              "History",
            ].includes(s),
          ) || "Fiction",
        pages:
          d.number_of_pages_median && d.number_of_pages_median <= 50000
            ? d.number_of_pages_median
            : null,
        description:
          "Imported from Open Library. Page counts can vary by edition.",
        cover: d.cover_i
          ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`
          : null,
        color: "sage",
        year: d.first_publish_year || null,
      }));
    books.forEach((b) => importBook(db, b));
    if (searchCache.size >= 100)
      searchCache.delete(searchCache.keys().next().value!);
    searchCache.set(q, { at: Date.now(), books });
    return { items: books, source: "Open Library", warning: null };
  } catch {
    if (local.length)
      return {
        items: local,
        source: "Saved catalog",
        warning:
          "Open Library is unavailable. Showing matching books already in Shelves.",
      };
    throw new ApiError(
      503,
      "Book search is temporarily unavailable. Please try again.",
    );
  }
}
function importBook(db: DatabaseSync, b: Book) {
  db.prepare("INSERT OR IGNORE INTO books VALUES (?,?,?,?,?,?,?,?,?)").run(
    b.id,
    b.title,
    b.author,
    b.genre,
    b.pages,
    b.description,
    b.cover,
    b.color,
    b.year,
  );
}
export function feed(
  db: DatabaseSync,
  userId?: string,
  following = false,
  bookId?: string,
  authorId?: string,
): Post[] {
  const conditions: string[] = [],
    values: string[] = [];
  if (following) {
    conditions.push(
      "(p.user_id IN (SELECT followed_id FROM follows WHERE user_id=?) OR p.user_id=?)",
    );
    values.push(userId || "", userId || "");
  }
  if (bookId) {
    conditions.push("p.book_id=? AND p.kind='review'");
    values.push(bookId);
  }
  if (authorId) {
    conditions.push("p.user_id=?");
    values.push(authorId);
  }
  const posts = all<Omit<Post, "comments" | "liked">>(
    db,
    `SELECT p.id,p.body,p.kind,p.created_at AS createdAt,p.edited_at AS editedAt,p.user_id AS userId,u.username,u.display_name AS displayName,p.book_id AS bookId,b.title AS bookTitle,p.rating,p.contains_spoilers AS containsSpoilers,(SELECT count(*) FROM post_likes l WHERE l.post_id=p.id) AS likes FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN books b ON b.id=p.book_id ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY p.created_at DESC,p.rowid DESC LIMIT 50`,
    ...values,
  );
  return posts.map((p) => ({
    ...p,
    containsSpoilers: !!p.containsSpoilers,
    liked: !!one(
      db,
      "SELECT user_id FROM post_likes WHERE post_id=? AND user_id=?",
      p.id,
      userId || "",
    ),
    comments: all<Comment>(
      db,
      "SELECT c.id,c.body,u.display_name AS displayName,c.created_at AS createdAt FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=? ORDER BY c.created_at LIMIT 100",
      p.id,
    ),
  }));
}
export function bookSummary(db: DatabaseSync, bookId: string): BookSummary {
  return one<BookSummary>(
    db,
    "SELECT avg(nullif(rating,0)) AS averageRating,count(*) AS reviewCount FROM posts WHERE book_id=? AND kind='review'",
    bookId,
  )!;
}
export function publicReviews(
  db: DatabaseSync,
  bookId: string,
  userId?: string,
) {
  bookById(db, bookId);
  return {
    items: feed(db, userId, false, bookId),
    mine: userId ? feed(db, userId, false, bookId, userId)[0] || null : null,
  };
}
export function savePublicReview(
  db: DatabaseSync,
  userId: string,
  bookId: string,
  input: { body: string; rating: number; containsSpoilers: boolean },
) {
  bookById(db, bookId);
  const existing = one<{ id: string }>(
    db,
    "SELECT id FROM posts WHERE user_id=? AND book_id=? AND kind='review'",
    userId,
    bookId,
  );
  if (existing) {
    db.prepare(
      "UPDATE posts SET body=?,rating=?,contains_spoilers=?,edited_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND user_id=?",
    ).run(
      input.body,
      input.rating,
      Number(input.containsSpoilers),
      existing.id,
      userId,
    );
    return existing.id;
  }
  const newId = randomUUID();
  db.prepare(
    "INSERT INTO posts (id,user_id,book_id,body,kind,rating,contains_spoilers) VALUES (?,?,?,?,'review',?,?)",
  ).run(
    newId,
    userId,
    bookId,
    input.body,
    input.rating,
    Number(input.containsSpoilers),
  );
  return newId;
}
export function stats(db: DatabaseSync, userId: string): Stats {
  const rows = library(db, userId),
    year = new Date().getUTCFullYear();
  return {
    finished: rows.filter(
      (r) => r.status === "Finished" && r.finishedAt?.startsWith(String(year)),
    ).length,
    reading: rows.filter((r) => r.status === "Currently reading").length,
    pages: rows.reduce((sum, r) => sum + r.page, 0),
    goal: one<{ goal: number }>(
      db,
      "SELECT goal FROM users WHERE id=?",
      userId,
    )!.goal,
    following: one<{ n: number }>(
      db,
      "SELECT count(*) AS n FROM follows WHERE user_id=?",
      userId,
    )!.n,
    followers: one<{ n: number }>(
      db,
      "SELECT count(*) AS n FROM follows WHERE followed_id=?",
      userId,
    )!.n,
  };
}
export function makePost(
  db: DatabaseSync,
  userId: string,
  body: string,
  kind: string,
  bookId: string | null,
) {
  if (bookId) bookById(db, bookId);
  const id = randomUUID();
  db.prepare(
    "INSERT INTO posts (id,user_id,body,kind,book_id) VALUES (?,?,?,?,?)",
  ).run(id, userId, body, kind, bookId);
  return id;
}

export function userShelves(db: DatabaseSync, userId: string) {
  return all<Shelf>(
    db,
    "SELECT s.id,s.name,count(sb.book_id) AS count FROM shelves s LEFT JOIN shelf_books sb ON sb.shelf_id=s.id WHERE s.user_id=? GROUP BY s.id ORDER BY s.rowid",
    userId,
  );
}
export function readerSuggestions(db: DatabaseSync, userId = "") {
  return all<Reader>(
    db,
    "SELECT u.id,u.username,u.display_name AS displayName,u.bio,EXISTS(SELECT 1 FROM follows f WHERE f.user_id=? AND f.followed_id=u.id) AS following FROM users u WHERE u.id!=? ORDER BY u.created_at DESC LIMIT 30",
    userId,
    userId,
  ).map((r) => ({ ...r, following: !!r.following }));
}
