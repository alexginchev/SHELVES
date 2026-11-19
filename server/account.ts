import type { Express, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { Store } from "./store.ts";
import { ApiError } from "./services.ts";
import { endSession, hashPassword, verifyPassword } from "./auth.ts";
import {
  registerSchema,
  preferencesSchema,
  type Book,
} from "../shared/types.ts";

const password = z.string().min(1).max(128);
const newPassword = registerSchema.shape.password;
const owner = (res: Response): string => {
  if (!res.locals.user)
    throw new ApiError(401, "Sign in to manage your account.");
  return res.locals.user.id;
};
async function lockUser(db: Store, id: string) {
  const row = await db.get<{ id: string; password_hash: string }>(
    `SELECT id,password_hash FROM users WHERE id=?${db.kind === "postgres" ? " FOR UPDATE" : ""}`,
    id,
  );
  if (!row) throw new ApiError(401, "Please sign in again.");
  return row;
}

export function accountRoutes(app: Express, db: Store) {
  app.get("/api/preferences", async (_req, res) => {
    const row = await db.get<{ genres: string; book_ids: string }>(
      "SELECT genres,book_ids FROM reading_preferences WHERE user_id=?",
      owner(res),
    );
    const bookIds: string[] = row ? JSON.parse(row.book_ids) : [];
    const books = bookIds.length
      ? await db.all<Book>(
          `SELECT * FROM books WHERE id IN (${bookIds.map(() => "?").join(",")})`,
          ...bookIds,
        )
      : [];
    const byId = new Map(books.map((book) => [book.id, book]));
    res.json({
      genres: row ? JSON.parse(row.genres) : [],
      bookIds,
      books: bookIds.map((id) => byId.get(id)).filter(Boolean),
      completed: !!row,
    });
  });
  app.put("/api/preferences", async (req, res) => {
    const id = owner(res),
      data = preferencesSchema.parse(req.body);
    await db.transaction(async (tx) => {
      if (data.bookIds.length) {
        const count = await tx.get<{ n: number }>(
          `SELECT count(*) AS n FROM books WHERE id IN (${data.bookIds.map(() => "?").join(",")})`,
          ...data.bookIds,
        );
        if (Number(count?.n) !== data.bookIds.length)
          throw new ApiError(
            400,
            "One of these books is no longer available. Search again and choose another.",
          );
      }
      await tx.run(
        "INSERT INTO reading_preferences (user_id,genres,book_ids) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET genres=excluded.genres,book_ids=excluded.book_ids",
        id,
        JSON.stringify(data.genres),
        JSON.stringify(data.bookIds),
      );
    });
    res.json({ ...data, completed: true });
  });
  const sensitive = rateLimit({
    windowMs: 15 * 60000,
    limit: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many account attempts. Please try again later." },
  });
  app.get("/api/account", async (_req, res) => {
    const id = owner(res);
    res.json(
      await db.get(
        'SELECT email,(SELECT count(*) FROM sessions WHERE user_id=? AND expires_at>?) AS "activeSessions" FROM users WHERE id=?',
        id,
        Date.now(),
        id,
      ),
    );
  });
  app.post("/api/account/password", sensitive, async (req, res) => {
    const id = owner(res),
      data = z
        .object({ currentPassword: password, newPassword })
        .parse(req.body);
    if (data.currentPassword === data.newPassword)
      throw new ApiError(400, "Choose a different password.");
    const nextHash = await hashPassword(data.newPassword);
    await db.transaction(async (tx) => {
      const row = await lockUser(tx, id);
      if (!(await verifyPassword(data.currentPassword, row.password_hash)))
        throw new ApiError(400, "Current password is incorrect.");
      await tx.run("UPDATE users SET password_hash=? WHERE id=?", nextHash, id);
      await tx.run("DELETE FROM sessions WHERE user_id=?", id);
    });
    await endSession(db, req, res);
    res.status(204).end();
  });
  app.post("/api/account/sign-out-all", sensitive, async (req, res) => {
    const id = owner(res),
      data = z.object({ password }).parse(req.body);
    await db.transaction(async (tx) => {
      const row = await lockUser(tx, id);
      if (!(await verifyPassword(data.password, row.password_hash)))
        throw new ApiError(400, "Current password is incorrect.");
      await tx.run("DELETE FROM sessions WHERE user_id=?", id);
    });
    await endSession(db, req, res);
    res.status(204).end();
  });
  app.delete("/api/account", sensitive, async (req, res) => {
    const id = owner(res),
      data = z
        .object({ password, confirmation: z.literal("DELETE") })
        .parse(req.body);
    await db.transaction(async (tx) => {
      const row = await lockUser(tx, id);
      if (!(await verifyPassword(data.password, row.password_hash)))
        throw new ApiError(400, "Current password is incorrect.");
      await tx.run("DELETE FROM users WHERE id=?", id);
    });
    await endSession(db, req, res);
    res.status(204).end();
  });
}
