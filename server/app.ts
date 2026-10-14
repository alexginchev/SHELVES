import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
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
  type Reader,
  type Shelf,
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
export function createApp(db: DatabaseSync) {
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
  app.use("/api", (req, res, next) => {
    res.locals.user = currentUser(db, req);
    next();
  });
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", database: "sqlite", version: "0.1.0" }),
  );
  app.get("/api/auth/me", (_req, res) =>
    res.json({ user: res.locals.user || null }),
  );
  app.get("/api/snapshot", (_req, res) => {
    const me = res.locals.user as User | undefined;
    res.json({
      user: me || null,
      books: all(db, "SELECT * FROM books ORDER BY rowid LIMIT 100"),
      recommendations: recommendations(db, me?.id),
      posts: feed(db, me?.id),
      readers: readerSuggestions(db, me?.id),
      library: me ? library(db, me.id) : [],
      shelves: me ? userShelves(db, me.id) : [],
      stats: me ? stats(db, me.id) : null,
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
      one(
        db,
        "SELECT id FROM users WHERE email=? OR username=?",
        data.email,
        data.username,
      )
    )
      throw new ApiError(409, "That email or username is already registered.");
    const newId = randomUUID();
    db.prepare(
      "INSERT INTO users (id,email,username,display_name,password_hash) VALUES (?,?,?,?,?)",
    ).run(newId, data.email, data.username, data.displayName, passwordHash);
    createSession(db, res, newId);
    res.status(201).json({
      user: one<User>(db, `SELECT ${userColumns} FROM users WHERE id=?`, newId),
    });
  });
  const dummyPassword = hashPassword(randomUUID());
  app.post("/api/auth/login", authLimiter, async (req, res) => {
    const data = loginSchema.parse(req.body);
    const row = one<{ id: string; passwordHash: string }>(
      db,
      "SELECT id,password_hash AS passwordHash FROM users WHERE email=?",
      data.email,
    );
    const valid = await verifyPassword(
      data.password,
      row?.passwordHash || (await dummyPassword),
    );
    if (!row || !valid)
      throw new ApiError(401, "Email or password is incorrect.");
    createSession(db, res, row.id);
    res.json({
      user: one<User>(
        db,
        `SELECT ${userColumns} FROM users WHERE id=?`,
        row.id,
      ),
    });
  });
  app.post("/api/auth/logout", (req, res) => {
    endSession(db, req, res);
    res.status(204).end();
  });
  app.patch("/api/me", (req, res) => {
    const me = user(res),
      data = profileSchema.parse(req.body);
    db.prepare("UPDATE users SET display_name=?,bio=?,goal=? WHERE id=?").run(
      data.displayName,
      data.bio,
      data.goal,
      me.id,
    );
    res.json({
      user: one<User>(db, `SELECT ${userColumns} FROM users WHERE id=?`, me.id),
    });
  });
  app.get("/api/books", (_req, res) =>
    res.json({
      items: all(db, "SELECT * FROM books ORDER BY rowid LIMIT 100"),
    }),
  );
  app.get("/api/books/search", async (req, res) => {
    const q = z.string().trim().min(2).max(120).parse(req.query.q);
    res.json(await searchBooks(db, q));
  });
  app.get("/api/books/:id", (req, res) =>
    res.json({
      book: bookById(db, id(req)),
      summary: bookSummary(db, id(req)),
    }),
  );
  app.get("/api/books/:id/reviews", (req, res) =>
    res.json(
      publicReviews(db, id(req), (res.locals.user as User | undefined)?.id),
    ),
  );
  app.put("/api/books/:id/review", (req, res) => {
    const me = user(res);
    const reviewId = savePublicReview(
      db,
      me.id,
      id(req),
      publicReviewSchema.parse(req.body),
    );
    res.json({ id: reviewId });
  });
  app.get("/api/library", (_req, res) =>
    res.json({ items: library(db, user(res).id) }),
  );
  app.put("/api/library/:id", (req, res) => {
    const me = user(res);
    saveReading(db, me.id, id(req), readingSchema.parse(req.body));
    res.json({ items: library(db, me.id) });
  });
  app.delete("/api/library/:id", (req, res) => {
    removeReading(db, user(res).id, id(req));
    res.status(204).end();
  });
  app.get("/api/shelves", (_req, res) =>
    res.json({ items: userShelves(db, user(res).id) }),
  );
  app.post("/api/shelves", (req, res) => {
    const me = user(res),
      data = shelfSchema.parse(req.body);
    if (
      one(
        db,
        "SELECT id FROM shelves WHERE user_id=? AND name=?",
        me.id,
        data.name,
      )
    )
      throw new ApiError(409, "You already have a shelf with that name.");
    const shelfId = randomUUID();
    db.prepare("INSERT INTO shelves VALUES (?,?,?)").run(
      shelfId,
      me.id,
      data.name,
    );
    res.status(201).json({ shelf: { id: shelfId, name: data.name, count: 0 } });
  });
  app.get("/api/recommendations", (_req, res) =>
    res.json({
      items: recommendations(db, (res.locals.user as User | undefined)?.id),
      algorithmVersion: "genre-affinity-v1",
    }),
  );
  app.put("/api/recommendations/:id/dismiss", (req, res) => {
    const me = user(res);
    bookById(db, id(req));
    db.prepare(
      "INSERT OR IGNORE INTO recommendation_feedback VALUES (?,?)",
    ).run(me.id, id(req));
    res.status(204).end();
  });
  app.get("/api/stats", (_req, res) => res.json(stats(db, user(res).id)));
  app.get("/api/feed", (req, res) =>
    res.json({
      items: feed(
        db,
        (res.locals.user as User | undefined)?.id,
        req.query.following === "true",
      ),
    }),
  );
  app.post("/api/posts", (req, res) => {
    const me = user(res),
      data = postSchema.parse(req.body);
    if (data.kind === "review")
      throw new ApiError(
        400,
        "Publish a rated book review from its book page.",
      );
    res
      .status(201)
      .json({ id: makePost(db, me.id, data.body, data.kind, data.bookId) });
  });
  app.delete("/api/posts/:id", (req, res) => {
    const me = user(res);
    const result = db
      .prepare("DELETE FROM posts WHERE id=? AND user_id=?")
      .run(id(req), me.id);
    if (!result.changes) throw new ApiError(404, "Post not found.");
    res.status(204).end();
  });
  app.put("/api/posts/:id/like", (req, res) => {
    const me = user(res);
    if (!one(db, "SELECT id FROM posts WHERE id=?", id(req)))
      throw new ApiError(404, "Post not found.");
    db.prepare("INSERT OR IGNORE INTO post_likes VALUES (?,?)").run(
      me.id,
      id(req),
    );
    res.status(204).end();
  });
  app.delete("/api/posts/:id/like", (req, res) => {
    db.prepare("DELETE FROM post_likes WHERE user_id=? AND post_id=?").run(
      user(res).id,
      id(req),
    );
    res.status(204).end();
  });
  app.post("/api/posts/:id/comments", (req, res) => {
    const me = user(res),
      data = commentSchema.parse(req.body);
    if (!one(db, "SELECT id FROM posts WHERE id=?", id(req)))
      throw new ApiError(404, "Post not found.");
    db.prepare(
      "INSERT INTO comments (id,user_id,post_id,body) VALUES (?,?,?,?)",
    ).run(randomUUID(), me.id, id(req), data.body);
    res.status(201).json({ ok: true });
  });
  app.get("/api/readers", (_req, res) =>
    res.json({
      items: readerSuggestions(db, (res.locals.user as User | undefined)?.id),
    }),
  );
  app.put("/api/readers/:id/follow", (req, res) => {
    const me = user(res),
      target = id(req);
    if (target === me.id)
      throw new ApiError(400, "You cannot follow yourself.");
    if (!one(db, "SELECT id FROM users WHERE id=?", target))
      throw new ApiError(404, "Reader not found.");
    db.prepare("INSERT OR IGNORE INTO follows VALUES (?,?)").run(me.id, target);
    res.status(204).end();
  });
  app.delete("/api/readers/:id/follow", (req, res) => {
    db.prepare("DELETE FROM follows WHERE user_id=? AND followed_id=?").run(
      user(res).id,
      id(req),
    );
    res.status(204).end();
  });
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
      console.error(error);
      res
        .status(500)
        .json({ error: "Something went wrong. Please try again." });
    },
  );
  return app;
}
