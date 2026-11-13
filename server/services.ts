import { commentPage } from "./post-comments.ts";
import { hiddenReaders } from "./social-safety.ts";
import { isAdmin } from "./admin.ts";
import { randomUUID } from "node:crypto";
import type { Store } from "./store.ts";
import { z } from "zod";
import type {
  Book,
  Reading,
  Post,
  Comment,
  Stats,
  BookSummary,
  Shelf,
  Reader,
  ReaderProfile,
  Notification,
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
export async function bookById(db: Store, id: string) {
  const book = await one<Book>(db, "SELECT * FROM books WHERE id=?", id);
  if (!book) throw new ApiError(404, "Book not found.");
  return book;
}
export async function library(db: Store, userId: string): Promise<Reading[]> {
  const [rows, assignments] = await Promise.all([
    all<Book & Omit<Reading, "book" | "shelfIds">>(
      db,
      'SELECT b.*,r.book_id AS "bookId",r.status,r.page,r.rating,r.review,r.finished_at AS "finishedAt" FROM reading r JOIN books b ON b.id=r.book_id WHERE r.user_id=? ORDER BY r.updated_at DESC',
      userId,
    ),
    all<{ bookId: string; shelfId: string }>(
      db,
      'SELECT sb.book_id AS "bookId",s.id AS "shelfId" FROM shelves s JOIN shelf_books sb ON sb.shelf_id=s.id WHERE s.user_id=?',
      userId,
    ),
  ]);
  const shelves = new Map<string, string[]>();
  for (const a of assignments)
    shelves.set(a.bookId, [...(shelves.get(a.bookId) || []), a.shelfId]);
  return rows.map(
    ({ bookId, status, page, rating, review, finishedAt, ...book }) => ({
      bookId,
      status,
      page,
      rating,
      review,
      finishedAt,
      book,
      shelfIds: shelves.get(bookId) || [],
    }),
  );
}
export async function saveReading(
  db: Store,
  userId: string,
  bookId: string,
  input: z.infer<typeof readingSchema>,
) {
  const book = await bookById(db, bookId);
  if (book.pages && input.page > book.pages)
    throw new ApiError(400, `This book has ${book.pages} pages.`);
  for (const shelf of input.shelfIds)
    if (
      !(await one(
        db,
        "SELECT id FROM shelves WHERE id=? AND user_id=?",
        shelf,
        userId,
      ))
    )
      throw new ApiError(403, "Choose one of your own shelves.");
  await transaction(db, async (tx) => {
    const old = await one<{
      finishedAt: string | null;
    }>(
      tx,
      'SELECT finished_at AS "finishedAt" FROM reading WHERE user_id=? AND book_id=?',
      userId,
      bookId,
    );
    const finished =
      input.status === "Finished"
        ? old?.finishedAt || new Date().toISOString()
        : null;
    await tx.run(
      `INSERT INTO reading (user_id,book_id,status,page,rating,review,finished_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,book_id) DO UPDATE SET status=excluded.status,page=excluded.page,rating=excluded.rating,review=excluded.review,finished_at=excluded.finished_at,updated_at=CURRENT_TIMESTAMP`,
      userId,
      bookId,
      input.status,
      input.status === "Finished" && book.pages ? book.pages : input.page,
      input.rating,
      input.review,
      finished,
    );
    await tx.run(
      "DELETE FROM shelf_books WHERE book_id=? AND shelf_id IN (SELECT id FROM shelves WHERE user_id=?)",
      bookId,
      userId,
    );
    for (const id of new Set(input.shelfIds))
      await tx.run("INSERT INTO shelf_books VALUES (?,?)", id, bookId);
  });
}
export async function removeReading(db: Store, userId: string, bookId: string) {
  await transaction(db, async (tx) => {
    await tx.run(
      "DELETE FROM shelf_books WHERE book_id=? AND shelf_id IN (SELECT id FROM shelves WHERE user_id=?)",
      bookId,
      userId,
    );
    await tx.run(
      "DELETE FROM reading WHERE user_id=? AND book_id=?",
      userId,
      bookId,
    );
  });
}
export { recommendations } from "./recommendations.ts";
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
const searchCache = new Map<
  string,
  {
    at: number;
    books: Book[];
  }
>();
export async function searchBooks(db: Store, query: string) {
  const q = query.toLowerCase();
  const cached = searchCache.get(q);
  if (cached && Date.now() - cached.at < 300000) {
    for (const b of cached.books) await importBook(db, b);
    return { items: cached.books, source: "Open Library", warning: null };
  }
  const escaped = q.replace(/[!%_]/g, "!$&");
  const local = await all<Book>(
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
    for (const b of books) await importBook(db, b);
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
async function importBook(db: Store, b: Book) {
  await db.run(
    "INSERT INTO books VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING",
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
export async function feed(
  db: Store,
  userId?: string,
  following = false,
  bookId?: string,
  authorId?: string,
  postId?: string,
  paging?: {
    before?: { at: string; id: string; likes?: number };
    sort?: "recent" | "appreciated";
    followedOnly?: boolean;
    reviews?: boolean;
    ids?: string[];
    limit: number;
  },
): Promise<Post[]> {
  const conditions: string[] = [],
    values: (string | number)[] = [];
  const likeCount = "(SELECT count(*) FROM post_likes l WHERE l.post_id=p.id)";
  if (paging?.ids) {
    if (!paging.ids.length) return [];
    conditions.push(`p.id IN (${paging.ids.map(() => "?").join(",")})`);
    values.push(...paging.ids);
  }
  const hidden = await hiddenReaders(db, userId);
  if (hidden.length) {
    conditions.push(`p.user_id NOT IN (${hidden.map(() => "?").join(",")})`);
    values.push(...hidden);
  }
  if (paging?.before) {
    conditions.push(
      paging.sort === "appreciated"
        ? `(${likeCount}<? OR (${likeCount}=? AND (p.created_at<? OR (p.created_at=? AND p.id<?))))`
        : "(p.created_at<? OR (p.created_at=? AND p.id<?))",
    );
    if (paging.sort === "appreciated")
      values.push(paging.before.likes!, paging.before.likes!);
    values.push(paging.before.at, paging.before.at, paging.before.id);
  }
  if (paging?.reviews) conditions.push("p.kind='review'");
  if (paging?.followedOnly) {
    conditions.push(
      "p.user_id IN (SELECT followed_id FROM follows WHERE user_id=?)",
    );
    values.push(userId || "");
  }
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
  if (postId) {
    conditions.push("p.id=?");
    values.push(postId);
  }
  const posts = await all<Omit<Post, "comments" | "liked">>(
    db,
    `SELECT p.id,p.body,p.kind,(SELECT version FROM profile_images WHERE user_id=u.id AND kind='avatar') AS "avatarVersion",p.created_at AS "createdAt",p.edited_at AS "editedAt",p.user_id AS "userId",u.username,u.display_name AS "displayName",p.book_id AS "bookId",b.title AS "bookTitle",p.rating,p.contains_spoilers AS "containsSpoilers",${likeCount} AS likes FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN books b ON b.id=p.book_id ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY ${paging?.sort === "appreciated" ? likeCount + " DESC," : ""}p.created_at DESC,p.id DESC LIMIT ${paging?.limit || 50}`,
    ...values,
  );
  return Promise.all(
    posts.map(async (p) => ({
      ...p,
      isAdmin: isAdmin(p.userId),
      containsSpoilers: !!p.containsSpoilers,
      liked: !!(await one(
        db,
        "SELECT user_id FROM post_likes WHERE post_id=? AND user_id=?",
        p.id,
        userId || "",
      )),
      ...(await (async () => {
        const page = await commentPage(db, p.id, hidden);
        return {
          comments: page.items,
          commentCount: page.total,
          commentsCursor: page.nextCursor,
        };
      })()),
    })),
  );
}
export async function bookSummary(
  db: Store,
  bookId: string,
): Promise<BookSummary> {
  return (await one<BookSummary>(
    db,
    'SELECT avg(nullif(rating,0)) AS "averageRating",count(*) AS "reviewCount" FROM posts WHERE book_id=? AND kind=\'review\'',
    bookId,
  ))!;
}
export async function publicReviews(
  db: Store,
  bookId: string,
  userId?: string,
) {
  await bookById(db, bookId);
  return {
    items: await feed(db, userId, false, bookId),
    mine: userId
      ? (await feed(db, userId, false, bookId, userId))[0] || null
      : null,
  };
}
export async function savePublicReview(
  db: Store,
  userId: string,
  bookId: string,
  input: {
    body: string;
    rating: number;
    containsSpoilers: boolean;
  },
) {
  await bookById(db, bookId);
  const saved = await db.get<{ id: string }>(
    `INSERT INTO posts (id,user_id,book_id,body,kind,rating,contains_spoilers) VALUES (?,?,?,?,'review',?,?) ON CONFLICT(user_id,book_id) WHERE kind='review' AND book_id IS NOT NULL DO UPDATE SET body=excluded.body,rating=excluded.rating,contains_spoilers=excluded.contains_spoilers,edited_at=CURRENT_TIMESTAMP RETURNING id`,
    randomUUID(),
    userId,
    bookId,
    input.body,
    input.rating,
    Number(input.containsSpoilers),
  );
  return saved!.id;
}

export async function stats(db: Store, userId: string): Promise<Stats> {
  return (await one<Stats>(
    db,
    `SELECT u.goal,
 (SELECT count(*) FROM reading r WHERE r.user_id=u.id AND r.status='Finished' AND substr(CAST(r.finished_at AS TEXT),1,4)=?) AS finished,
 (SELECT count(*) FROM reading r WHERE r.user_id=u.id AND r.status='Currently reading') AS reading,
 (SELECT coalesce(sum(r.page),0) FROM reading r WHERE r.user_id=u.id) AS pages,
 (SELECT count(*) FROM follows f WHERE f.user_id=u.id) AS following,
 (SELECT count(*) FROM follows f WHERE f.followed_id=u.id) AS followers FROM users u WHERE u.id=?`,
    String(new Date().getUTCFullYear()),
    userId,
  ))!;
}
export async function makePost(
  db: Store,
  userId: string,
  body: string,
  kind: string,
  bookId: string | null,
) {
  if (bookId) await bookById(db, bookId);
  const id = randomUUID();
  await db.run(
    "INSERT INTO posts (id,user_id,body,kind,book_id) VALUES (?,?,?,?,?)",
    id,
    userId,
    body,
    kind,
    bookId,
  );
  return id;
}
export async function userShelves(db: Store, userId: string) {
  return await all<Shelf>(
    db,
    "SELECT s.id,s.name,count(sb.book_id) AS count FROM shelves s LEFT JOIN shelf_books sb ON sb.shelf_id=s.id WHERE s.user_id=? GROUP BY s.id ORDER BY s.name",
    userId,
  );
}
export async function readerSuggestions(db: Store, userId = "") {
  const hidden = await hiddenReaders(db, userId);
  // Only public reviews are evidence of shared taste. Private reading records and
  // onboarding preferences must never contribute to reader-to-reader explanations.
  const rows = await all<
    Reader & { shared: number | string; genres: number | string }
  >(
    db,
    `
    WITH favorites AS (
      SELECT DISTINCT p.user_id, lower(trim(b.title)) AS title,
        lower(trim(b.author)) AS author, b.genre
      FROM posts p JOIN books b ON b.id=p.book_id
      WHERE p.kind='review' AND p.rating>=4
    ), mine AS (SELECT * FROM favorites WHERE user_id=?),
    shared_books AS (
      SELECT f.user_id,count(*) AS n FROM
        (SELECT DISTINCT f.user_id,f.title,f.author FROM favorites f
         WHERE f.author!='unknown author' AND f.author!='' AND EXISTS
           (SELECT 1 FROM mine m WHERE m.title=f.title AND m.author=f.author)) f
      GROUP BY f.user_id
    ), shared_genres AS (
      SELECT f.user_id,count(DISTINCT f.genre) AS n FROM favorites f
      WHERE f.genre!='Uncategorized' AND EXISTS (SELECT 1 FROM mine m WHERE m.genre=f.genre)
      GROUP BY f.user_id
    )
    SELECT u.id,u.username,u.display_name AS "displayName",u.bio,
      (SELECT version FROM profile_images WHERE user_id=u.id AND kind='avatar') AS "avatarVersion",
      (SELECT version FROM profile_images WHERE user_id=u.id AND kind='banner') AS "bannerVersion",
      EXISTS(SELECT 1 FROM follows f WHERE f.user_id=? AND f.followed_id=u.id) AS following,
      COALESCE(sb.n,0) AS shared,COALESCE(sg.n,0) AS genres
    FROM users u LEFT JOIN shared_books sb ON sb.user_id=u.id LEFT JOIN shared_genres sg ON sg.user_id=u.id
    WHERE u.id!=? ${hidden.length ? `AND u.id NOT IN (${hidden.map(() => "?").join(",")})` : ""}
    ORDER BY shared DESC,genres DESC,following ASC,u.created_at DESC,u.id LIMIT 30`,
    userId,
    userId,
    userId,
    ...hidden,
  );
  return rows.map(({ shared, genres, ...reader }) => ({
    ...reader,
    isAdmin: isAdmin(reader.id),
    following: !!reader.following,
    reason:
      Number(shared) > 0
        ? `You both rated ${shared} ${Number(shared) === 1 ? "book" : "books"} highly in public reviews`
        : Number(genres) > 0
          ? `Your public reviews share ${genres} ${Number(genres) === 1 ? "genre" : "genres"}`
          : "Explore their reading corner",
  }));
}
export async function unreadNotifications(db: Store, userId: string) {
  const hidden = await hiddenReaders(db, userId);
  return (await one<{ count: number }>(
    db,
    `SELECT count(*) AS count FROM notifications WHERE recipient_id=? AND read_at IS NULL ${hidden.length ? `AND actor_id NOT IN (${hidden.map(() => "?").join(",")})` : ""}`,
    userId,
    ...hidden,
  ))!.count;
}
export async function notifications(
  db: Store,
  userId: string,
  unreadOnly = false,
  before?: { at: string; id: string },
) {
  const hidden = await hiddenReaders(db, userId);
  const [items, unread] = await Promise.all([
    all<Notification>(
      db,
      `SELECT n.id,n.actor_id AS "actorId",u.display_name AS "displayName",n.kind,n.post_id AS "postId",n.created_at AS "createdAt",n.read_at AS "readAt" FROM notifications n JOIN users u ON u.id=n.actor_id WHERE n.recipient_id=? ${hidden.length ? `AND n.actor_id NOT IN (${hidden.map(() => "?").join(",")})` : ""} ${unreadOnly ? "AND n.read_at IS NULL" : ""} ${before ? "AND (n.created_at<? OR (n.created_at=? AND n.id<?))" : ""} ORDER BY n.created_at DESC,n.id DESC LIMIT 21`,
      userId,
      ...hidden,
      ...(before ? [before.at, before.at, before.id] : []),
    ),
    unreadNotifications(db, userId),
  ]);
  const page = items.slice(0, 20),
    last = page.at(-1);
  return {
    items: page,
    unread,
    nextCursor:
      items.length > 20 && last
        ? Buffer.from(
            JSON.stringify({ at: last.createdAt, id: last.id }),
          ).toString("base64url")
        : null,
  };
}
export async function notifyReader(
  db: Store,
  recipient: string,
  actor: string,
  kind: Notification["kind"],
  target: string,
  postId: string | null = null,
  commentId: string | null = null,
) {
  if (
    recipient === actor ||
    (await hiddenReaders(db, recipient)).includes(actor)
  )
    return;
  await db.run(
    "INSERT INTO notifications (id,recipient_id,actor_id,kind,event_key,post_id,comment_id) VALUES (?,?,?,?,?,?,?) ON CONFLICT(event_key) DO NOTHING",
    randomUUID(),
    recipient,
    actor,
    kind,
    `${kind}:${actor}:${target}`,
    postId,
    commentId,
  );
}
export async function readerProfile(
  db: Store,
  targetId: string,
  viewerId = "",
): Promise<ReaderProfile> {
  const reader = await one<Reader>(
    db,
    `SELECT u.id,u.username,u.display_name AS "displayName",u.bio,(SELECT version FROM profile_images WHERE user_id=u.id AND kind='avatar') AS "avatarVersion",(SELECT version FROM profile_images WHERE user_id=u.id AND kind='banner') AS "bannerVersion",EXISTS(SELECT 1 FROM follows f WHERE f.user_id=? AND f.followed_id=u.id) AS following FROM users u WHERE u.id=?`,
    viewerId,
    targetId,
  );
  if (!reader) throw new ApiError(404, "Reader not found.");
  const counts = await one<{ followers: number; followingCount: number }>(
    db,
    'SELECT (SELECT count(*) FROM follows WHERE followed_id=?) AS followers,(SELECT count(*) FROM follows WHERE user_id=?) AS "followingCount"',
    targetId,
    targetId,
  );
  // Public profiles intentionally expose only public social content.
  return {
    reader: {
      ...reader,
      activityHidden: (await hiddenReaders(db, viewerId)).includes(targetId),
      interactionBlocked: (await hiddenReaders(db, viewerId, false)).includes(
        targetId,
      ),
      isAdmin: isAdmin(reader.id),
      following: !!reader.following,
    },
    ...counts!,
    posts: await feed(db, viewerId, false, undefined, targetId),
  };
}
