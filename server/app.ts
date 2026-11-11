import { editionRoutes } from "./editions.ts";
import { languageExpression, languageSchema } from "./book-language.ts";
import { safetyRoutes, assertInteraction } from "./social-safety.ts";
import { profileMediaRoutes } from "./profile-media.ts";
import { progressRoutes } from "./reading-progress.ts";
import {
  searchGoogleBooks,
  getBookByISBN,
  bookMetadata,
  refreshGoogleBook,
} from "./google-books.ts";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import rateLimit from "express-rate-limit";
import { bookReviewPage } from "./book-reviews.ts";
import { randomUUID } from "node:crypto";
import { listRoutes } from "./lists.ts";
import { postCommentRoutes } from "./post-comments.ts";
import { accountRoutes } from "./account.ts";
import { readerDirectoryRoutes } from "./reader-directory.ts";
import type { Store } from "./store.ts";
import { z } from "zod";
import {
  registerSchema,
  loginSchema,
  readingSchema,
  shelfSchema,
  postSchema,
  commentSchema,
  profileSchema,
  publicReviewSchema,
  type User,
} from "../shared/types.ts";
import { all, one } from "./db.ts";
import {
  currentUser,
  createSession,
  endSession,
  hashPassword,
  verifyPassword,
  userColumns,
} from "./auth.ts";
import {
  ApiError,
  bookById,
  library,
  saveReading,
  removeReading,
  recommendations,
  searchBooks,
  feed,
  stats,
  makePost,
  bookSummary,
  publicReviews,
  savePublicReview,
  userShelves,
  readerSuggestions,
  readerProfile,
  notifications,
  notifyReader,
  unreadNotifications,
} from "./services.ts";
function user(res: Response): User {
  const value = res.locals.user as User | undefined;
  if (!value)
    throw new ApiError(401, "Sign in to keep your reading life in sync.");
  return value;
}
const idSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/);
const id = (req: Request, key = "id") => idSchema.parse(req.params[key]);
function decodeActivityCursor(
  value?: string,
): { at: string; id: string } | undefined {
  if (!value) return undefined;
  try {
    return z
      .object({ at: z.string().min(1).max(40), id: z.string().min(1).max(80) })
      .parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    throw new ApiError(400, "Invalid activity cursor. Refresh the activity.");
  }
}
export function createApp(db: Store) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 180,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Too many requests. Please wait a minute." },
    }),
  );
  app.use("/api", (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.origin;
      const expected =
        process.env.PUBLIC_ORIGIN || `${req.protocol}://${req.get("host")}`;
      if (
        req.get("x-shelves-request") !== "1" ||
        req.headers["sec-fetch-site"] === "cross-site" ||
        (origin && origin !== expected)
      )
        return res
          .status(403)
          .json({ error: "This request did not come from Shelves." });
    }
    next();
  });
  app.use(express.json({ limit: "32kb" }));
  app.use("/api", async (req, res, next) => {
    res.locals.user = await currentUser(db, req);
    next();
  });
  safetyRoutes(app, db);
  profileMediaRoutes(app, db);
  progressRoutes(app, db);
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", database: db.kind, version: "0.2.0" }),
  );
  app.get("/api/auth/me", (_req, res) =>
    res.json({ user: res.locals.user || null }),
  );
  app.get("/api/snapshot", async (_req, res) => {
    const me = res.locals.user as User | undefined;
    const [
      books,
      recs,
      posts,
      readers,
      records,
      shelves,
      readingStats,
      unreadCount,
      preferences,
    ] = await Promise.all([
      all(db, "SELECT * FROM books ORDER BY id LIMIT 100"),
      recommendations(db, me?.id),
      feed(db, me?.id),
      readerSuggestions(db, me?.id),
      me ? library(db, me.id) : [],
      me ? userShelves(db, me.id) : [],
      me ? stats(db, me.id) : null,
      me ? unreadNotifications(db, me.id) : 0,
      me
        ? db.get(
            "SELECT user_id FROM reading_preferences WHERE user_id=?",
            me.id,
          )
        : undefined,
    ]);
    res.json({
      user: me || null,
      books,
      recommendations: recs,
      posts,
      readers,
      library: records,
      shelves,
      stats: readingStats,
      unreadNotifications: unreadCount,
      preferencesCompleted: !!preferences,
    });
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many sign-in attempts. Please try again later." },
  });
  app.post("/api/auth/register", authLimiter, async (req, res) => {
    const data = registerSchema.parse(req.body);
    const passwordHash = await hashPassword(data.password);
    if (
      await one(
        db,
        "SELECT id FROM users WHERE email=? OR username=?",
        data.email,
        data.username,
      )
    )
      throw new ApiError(409, "That email or username is already registered.");
    const newId = randomUUID();
    await db.run(
      "INSERT INTO users (id,email,username,display_name,password_hash) VALUES (?,?,?,?,?)",
      newId,
      data.email,
      data.username,
      data.displayName,
      passwordHash,
    );
    await createSession(db, res, newId);
    res.status(201).json({
      user: await one<User>(
        db,
        `SELECT ${userColumns} FROM users WHERE id=?`,
        newId,
      ),
    });
  });
  const dummyPassword = hashPassword(randomUUID());
  app.post("/api/auth/login", authLimiter, async (req, res) => {
    const data = loginSchema.parse(req.body);
    const row = await one<{
      id: string;
      passwordHash: string;
    }>(
      db,
      'SELECT id,password_hash AS "passwordHash" FROM users WHERE email=?',
      data.email,
    );
    const valid = await verifyPassword(
      data.password,
      row?.passwordHash || (await dummyPassword),
    );
    if (!row || !valid)
      throw new ApiError(401, "Email or password is incorrect.");
    await db.transaction(async (tx) => {
      const current = await tx.get<{ password_hash: string }>(
        `SELECT password_hash FROM users WHERE id=?${tx.kind === "postgres" ? " FOR UPDATE" : ""}`,
        row.id,
      );
      if (!current || current.password_hash !== row.passwordHash)
        throw new ApiError(401, "Email or password is incorrect.");
      await createSession(tx, res, row.id);
    });
    res.json({
      user: await one<User>(
        db,
        `SELECT ${userColumns} FROM users WHERE id=?`,
        row.id,
      ),
    });
  });
  app.post("/api/auth/logout", async (req, res) => {
    await endSession(db, req, res);
    res.status(204).end();
  });
  app.patch("/api/me", async (req, res) => {
    const me = user(res),
      data = profileSchema.parse(req.body);
    await db.run(
      "UPDATE users SET display_name=?,bio=?,goal=? WHERE id=?",
      data.displayName,
      data.bio,
      data.goal,
      me.id,
    );
    res.json({
      user: await one<User>(
        db,
        `SELECT ${userColumns} FROM users WHERE id=?`,
        me.id,
      ),
    });
  });
  app.get("/api/books", async (_req, res) =>
    res.json({
      items: await all(db, "SELECT * FROM books ORDER BY id LIMIT 100"),
    }),
  );
  app.get("/api/books/search", async (req, res) => {
    const q = z.string().trim().min(2).max(120).parse(req.query.q);
    const startIndex = z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .default(0)
      .parse(req.query.startIndex);
    res.json(
      await searchGoogleBooks(db, q, languageSchema.parse(req.query.language), {
        startIndex,
      }),
    );
  });
  app.get("/api/books/isbn/:isbn", async (req, res) => {
    const book = await getBookByISBN(db, String(req.params.isbn));
    if (!book) throw new ApiError(404, "No book found for this ISBN.");
    res.json({ book });
  });
  app.get("/api/books/catalog", async (req, res) => {
    const filter = z
      .object({
        q: z.string().trim().max(120).default(""),
        genre: z.string().trim().max(80).default(""),
        language: languageSchema,
        author: z.string().trim().max(300).default(""),
        from: z.coerce.number().int().min(0).max(3000).optional(),
        to: z.coerce.number().int().min(0).max(3000).optional(),
        sort: z.enum(["title", "newest", "oldest"]).default("title"),
        page: z.coerce.number().int().min(1).max(100000).default(1),
      })
      .parse(req.query);
    if (
      filter.from !== undefined &&
      filter.to !== undefined &&
      filter.from > filter.to
    )
      throw new ApiError(400, "Start year must not be after end year.");
    const conditions: string[] = [],
      values: (string | number)[] = [];
    if (filter.q) {
      conditions.push(
        "(lower(title) LIKE ? ESCAPE '!' OR lower(author) LIKE ? ESCAPE '!')",
      );
      const q = `%${filter.q.toLowerCase().replace(/[!%_]/g, "!$&")}%`;
      values.push(q, q);
    }
    if (filter.author) {
      conditions.push(
        "(author=? OR EXISTS (SELECT 1 FROM book_authors ba WHERE ba.book_id=books.id AND ba.name=?))",
      );
      values.push(filter.author, filter.author);
    }
    if (filter.language) {
      conditions.push(languageExpression(db) + "=?");
      values.push(filter.language);
    }
    if (filter.genre) {
      conditions.push("genre=?");
      values.push(filter.genre);
    }
    if (filter.from !== undefined) {
      conditions.push("year>=?");
      values.push(filter.from);
    }
    if (filter.to !== undefined) {
      conditions.push("year<=?");
      values.push(filter.to);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const order =
      filter.sort === "title"
        ? "lower(title),id"
        : `CASE WHEN year IS NULL THEN 1 ELSE 0 END,year ${filter.sort === "newest" ? "DESC" : "ASC"},lower(title),id`;
    const [count, requestedItems, genres] = await Promise.all([
      db.get<{ n: number }>(
        `SELECT count(*) AS n FROM books${where}`,
        ...values,
      ),
      db.all(
        `SELECT * FROM books${where} ORDER BY ${order} LIMIT 12 OFFSET ?`,
        ...values,
        (filter.page - 1) * 12,
      ),
      db.all<{ genre: string }>(
        "SELECT DISTINCT genre FROM books ORDER BY genre",
      ),
    ]);
    const total = count!.n,
      pages = Math.max(1, Math.ceil(total / 12)),
      page = Math.min(filter.page, pages);
    const items =
      page === filter.page
        ? requestedItems
        : await db.all(
            `SELECT * FROM books${where} ORDER BY ${order} LIMIT 12 OFFSET ?`,
            ...values,
            (page - 1) * 12,
          );
    res.json({ items, total, page, pages, genres: genres.map((g) => g.genre) });
  });
  editionRoutes(app, db);
  app.get("/api/books/:id", async (req, res) => {
    const cached = z.enum(["1"]).optional().parse(req.query.cached);
    if (!cached) await refreshGoogleBook(db, id(req));
    const [book, summary, metadata] = await Promise.all([
      bookById(db, id(req)),
      bookSummary(db, id(req)),
      bookMetadata(db, id(req)),
    ]);
    res.json({
      book,
      summary,
      metadata,
    });
  });
  app.get("/api/books/:id/reviews", async (req, res) =>
    res.json(
      await bookReviewPage(
        db,
        id(req),
        (res.locals.user as User | undefined)?.id,
        req.query,
      ),
    ),
  );
  app.put("/api/books/:id/review", async (req, res) => {
    const me = user(res);
    const reviewId = await savePublicReview(
      db,
      me.id,
      id(req),
      publicReviewSchema.parse(req.body),
    );
    res.json({ id: reviewId });
  });
  app.get("/api/library", async (_req, res) =>
    res.json({ items: await library(db, user(res).id) }),
  );
  app.put("/api/library/:id", async (req, res) => {
    const me = user(res);
    await saveReading(db, me.id, id(req), readingSchema.parse(req.body));
    res.json({ items: await library(db, me.id) });
  });
  app.delete("/api/library/:id", async (req, res) => {
    await removeReading(db, user(res).id, id(req));
    res.status(204).end();
  });
  app.get("/api/shelves", async (_req, res) =>
    res.json({ items: await userShelves(db, user(res).id) }),
  );
  app.post("/api/shelves", async (req, res) => {
    const me = user(res),
      data = shelfSchema.parse(req.body);
    if (
      await one(
        db,
        "SELECT id FROM shelves WHERE user_id=? AND lower(name)=lower(?)",
        me.id,
        data.name,
      )
    )
      throw new ApiError(409, "You already have a shelf with that name.");
    const shelfId = randomUUID();
    await db.run(
      "INSERT INTO shelves VALUES (?,?,?)",
      shelfId,
      me.id,
      data.name,
    );
    res.status(201).json({ shelf: { id: shelfId, name: data.name, count: 0 } });
  });
  app.patch("/api/shelves/:id", async (req, res) => {
    const me = user(res),
      shelfId = id(req),
      data = shelfSchema.parse(req.body);
    if (
      !(await one(
        db,
        "SELECT id FROM shelves WHERE id=? AND user_id=?",
        shelfId,
        me.id,
      ))
    )
      throw new ApiError(404, "Shelf not found.");
    if (
      await one(
        db,
        "SELECT id FROM shelves WHERE user_id=? AND lower(name)=lower(?) AND id!=?",
        me.id,
        data.name,
        shelfId,
      )
    )
      throw new ApiError(409, "You already have a shelf with that name.");
    await db.run(
      "UPDATE shelves SET name=? WHERE id=? AND user_id=?",
      data.name,
      shelfId,
      me.id,
    );
    res.json({ items: await userShelves(db, me.id) });
  });
  app.delete("/api/shelves/:id", async (req, res) => {
    const result = await db.run(
      "DELETE FROM shelves WHERE id=? AND user_id=?",
      id(req),
      user(res).id,
    );
    if (!result.changes) throw new ApiError(404, "Shelf not found.");
    res.status(204).end();
  });
  app.get("/api/recommendations", async (_req, res) =>
    res.json({
      items: await recommendations(
        db,
        (res.locals.user as User | undefined)?.id,
      ),
      algorithmVersion: "quality-relevance-v2",
    }),
  );
  app.put("/api/recommendations/:id/dismiss", async (req, res) => {
    const me = user(res);
    await bookById(db, id(req));
    await db.run(
      "INSERT INTO recommendation_feedback VALUES (?,?) ON CONFLICT DO NOTHING",
      me.id,
      id(req),
    );
    res.status(204).end();
  });
  app.get("/api/stats", async (_req, res) =>
    res.json(await stats(db, user(res).id)),
  );
  app.get("/api/feed", async (req, res) => {
    const query = z
      .object({
        filter: z.enum(["all", "following", "reviews"]).default("all"),
        following: z.enum(["true", "false"]).optional(),
        author: z.string().min(1).max(80).optional(),
        before: z.string().max(500).optional(),
      })
      .parse(req.query);
    const before = decodeActivityCursor(query.before);
    const items = await feed(
      db,
      res.locals.user?.id,
      query.filter === "following" || query.following === "true",
      undefined,
      query.author,
      undefined,
      { before, reviews: query.filter === "reviews", limit: 21 },
    );
    const more = items.length > 20;
    const page = items.slice(0, 20),
      last = page.at(-1);
    res.json({
      items: page,
      nextCursor:
        more && last
          ? Buffer.from(
              JSON.stringify({ at: last.createdAt, id: last.id }),
            ).toString("base64url")
          : null,
    });
  });
  for (const method of ["patch", "delete"] as const)
    app[method]("/api/comments/:id", async (req, res) => {
      const me = user(res),
        commentId = id(req);
      const draft =
        method === "patch"
          ? z
              .object({
                body: commentSchema.shape.body,
                originalBody: z.string().max(500),
              })
              .parse(req.body)
          : null;
      await db.transaction(async (tx) => {
        const comment = await tx.get<{
          user_id: string;
          owner: string;
          body: string;
        }>(
          "SELECT c.user_id,p.user_id AS owner,c.body FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.id=?",
          commentId,
        );
        if (!comment || comment.user_id !== me.id)
          throw new ApiError(404, "Comment not found.");
        if (draft) {
          await assertInteraction(tx, me.id, comment.owner);
          const result = await tx.run(
            "UPDATE comments SET body=? WHERE id=? AND user_id=? AND body=?",
            draft.body,
            commentId,
            me.id,
            draft.originalBody,
          );
          if (!result.changes)
            throw new ApiError(
              409,
              "This comment changed elsewhere. Refresh before editing.",
            );
        } else
          await tx.run(
            "DELETE FROM comments WHERE id=? AND user_id=?",
            commentId,
            me.id,
          );
      });
      res.status(204).end();
    });
  app.post("/api/posts", async (req, res) => {
    const me = user(res),
      data = postSchema.parse(req.body);
    if (data.kind === "review")
      throw new ApiError(
        400,
        "Publish a rated book review from its book page.",
      );
    res.status(201).json({
      id: await makePost(db, me.id, data.body, data.kind, data.bookId),
    });
  });
  app.delete("/api/posts/:id", async (req, res) => {
    const me = user(res);
    const result = await db.run(
      "DELETE FROM posts WHERE id=? AND user_id=?",
      id(req),
      me.id,
    );
    if (!result.changes) throw new ApiError(404, "Post not found.");
    res.status(204).end();
  });
  app.get("/api/posts/:id", async (req, res) => {
    const posts = await feed(
      db,
      (res.locals.user as User | undefined)?.id,
      false,
      undefined,
      undefined,
      id(req),
    );
    if (!posts[0]) throw new ApiError(404, "This post is no longer available.");
    res.json({ post: posts[0] });
  });
  app.put("/api/posts/:id/like", async (req, res) => {
    const me = user(res);
    await db.transaction(async (tx) => {
      const post = await one<{ user_id: string }>(
        tx,
        "SELECT user_id FROM posts WHERE id=?",
        id(req),
      );
      if (!post) throw new ApiError(404, "Post not found.");
      await assertInteraction(tx, me.id, post.user_id);
      const result = await tx.run(
        "INSERT INTO post_likes VALUES (?,?) ON CONFLICT DO NOTHING",
        me.id,
        id(req),
      );
      if (result.changes)
        await notifyReader(tx, post.user_id, me.id, "like", id(req), id(req));
    });
    res.status(204).end();
  });
  app.delete("/api/posts/:id/like", async (req, res) => {
    const me = user(res),
      postId = id(req);
    await db.transaction(async (tx) => {
      await tx.run(
        "DELETE FROM post_likes WHERE user_id=? AND post_id=?",
        me.id,
        postId,
      );
      await tx.run(
        "DELETE FROM notifications WHERE event_key=?",
        `like:${me.id}:${postId}`,
      );
    });
    res.status(204).end();
  });
  app.post("/api/posts/:id/comments", async (req, res) => {
    const me = user(res),
      data = commentSchema.parse(req.body);
    await db.transaction(async (tx) => {
      const post = await one<{ user_id: string }>(
        tx,
        "SELECT user_id FROM posts WHERE id=?",
        id(req),
      );
      if (!post) throw new ApiError(404, "Post not found.");
      await assertInteraction(tx, me.id, post.user_id);
      const commentId = randomUUID();
      await tx.run(
        "INSERT INTO comments (id,user_id,post_id,body) VALUES (?,?,?,?)",
        commentId,
        me.id,
        id(req),
        data.body,
      );
      await notifyReader(
        tx,
        post.user_id,
        me.id,
        "comment",
        commentId,
        id(req),
        commentId,
      );
    });
    res.status(201).json({ ok: true });
  });
  app.get("/api/readers", async (_req, res) =>
    res.json({
      items: await readerSuggestions(
        db,
        (res.locals.user as User | undefined)?.id,
      ),
    }),
  );
  readerDirectoryRoutes(app, db);
  app.get("/api/readers/:id", async (req, res) =>
    res.json(
      await readerProfile(
        db,
        id(req),
        (res.locals.user as User | undefined)?.id,
      ),
    ),
  );
  app.put("/api/readers/:id/follow", async (req, res) => {
    const me = user(res),
      target = id(req);
    if (target === me.id)
      throw new ApiError(400, "You cannot follow yourself.");
    if (!(await one(db, "SELECT id FROM users WHERE id=?", target)))
      throw new ApiError(404, "Reader not found.");
    await db.transaction(async (tx) => {
      await assertInteraction(tx, me.id, target);
      const result = await tx.run(
        "INSERT INTO follows VALUES (?,?) ON CONFLICT DO NOTHING",
        me.id,
        target,
      );
      if (result.changes)
        await notifyReader(tx, target, me.id, "follow", target);
    });
    res.status(204).end();
  });
  app.delete("/api/readers/:id/follow", async (req, res) => {
    const me = user(res),
      target = id(req);
    await db.transaction(async (tx) => {
      await tx.run(
        "DELETE FROM follows WHERE user_id=? AND followed_id=?",
        me.id,
        target,
      );
      await tx.run(
        "DELETE FROM notifications WHERE event_key=?",
        `follow:${me.id}:${target}`,
      );
    });
    res.status(204).end();
  });
  app.get("/api/notifications", async (req, res) => {
    const me = user(res);
    const query = z
      .object({
        filter: z.enum(["all", "unread"]).default("all"),
        before: z.string().max(500).optional(),
      })
      .parse(req.query);
    res.json(
      await notifications(
        db,
        me.id,
        query.filter === "unread",
        decodeActivityCursor(query.before),
      ),
    );
  });
  app.get("/api/notifications/unread", async (_req, res) =>
    res.json({ unread: await unreadNotifications(db, user(res).id) }),
  );
  app.patch("/api/notifications/:id/read", async (req, res) => {
    const result = await db.run(
      "UPDATE notifications SET read_at=coalesce(read_at,CURRENT_TIMESTAMP) WHERE id=? AND recipient_id=?",
      id(req),
      user(res).id,
    );
    if (!result.changes) throw new ApiError(404, "Notification not found.");
    res.status(204).end();
  });
  app.post("/api/notifications/read-all", async (_req, res) => {
    await db.run(
      "UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE recipient_id=? AND read_at IS NULL",
      user(res).id,
    );
    res.status(204).end();
  });
  listRoutes(app, db);
  postCommentRoutes(app, db);
  accountRoutes(app, db);
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof z.ZodError)
        return res.status(400).json({
          error: error.issues[0]?.message || "Check the values you entered.",
        });
      if (error instanceof ApiError)
        return res.status(error.status).json({ error: error.message });
      if (error instanceof SyntaxError)
        return res.status(400).json({ error: "Invalid JSON request." });
      if (
        typeof error === "object" &&
        error &&
        "status" in error &&
        error.status === 413
      )
        return res.status(413).json({ error: "Request is too large." });
      if (
        typeof error === "object" &&
        error &&
        "code" in error &&
        (error.code === "23505" ||
          ("errcode" in error && error.errcode === 2067))
      )
        return res.status(409).json({
          error: "That email, username, or shelf name is already in use.",
        });
      console.error("API request failed", {
        code:
          typeof error === "object" && error && "code" in error
            ? error.code
            : "unknown",
      });
      res
        .status(500)
        .json({ error: "Something went wrong. Please try again." });
    },
  );
  return app;
}
