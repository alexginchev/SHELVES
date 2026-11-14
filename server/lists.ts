import { hiddenReaders } from "./social-safety.ts";
import { listCommentRoutes } from "./list-comments.ts";
import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Store } from "./store.ts";
import {
  listSchema,
  type Book,
  type BookList,
  type User,
} from "../shared/types.ts";
import { ApiError } from "./services.ts";

export function listRoutes(app: Express, db: Store) {
  listCommentRoutes(app, db);
  const columns =
    'l.id,l.user_id AS "userId",u.display_name AS "displayName",l.title,l.description,l.visibility';
  async function details(store: Store, rows: Omit<BookList, "books">[]) {
    if (!rows.length) return [];
    const books = await store.all<Book & { listId: string }>(
      `SELECT b.*,lb.list_id AS "listId" FROM list_books lb JOIN books b ON b.id=lb.book_id WHERE lb.list_id IN (${rows.map(() => "?").join(",")}) ORDER BY lb.position`,
      ...rows.map((r) => r.id),
    );
    return rows.map((r) => ({
      ...r,
      books: books
        .filter((b) => b.listId === r.id)
        .map(({ listId: _, ...b }) => b),
    }));
  }
  app.get("/api/lists", async (req, res) => {
    const query = z
      .object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        scope: z.enum(["all", "mine"]).default("all"),
      })
      .parse(req.query);
    if (query.scope === "mine" && !res.locals.user)
      throw new ApiError(401, "Sign in to see your lists.");
    const hidden = await hiddenReaders(db, res.locals.user?.id);
    const where = `${query.scope === "mine" ? "l.user_id=?" : "(l.visibility='public' OR l.user_id=?)"} ${hidden.length ? `AND l.user_id NOT IN (${hidden.map(() => "?").join(",")})` : ""}`;
    const values = [res.locals.user?.id || "", ...hidden];
    const total = Number(
      (await db.get<{ n: number }>(
        `SELECT count(*) AS n FROM lists l WHERE ${where}`,
        ...values,
      ))!.n,
    );
    const pages = Math.max(1, Math.ceil(total / 20)),
      page = Math.min(query.page, pages);
    const rows = await db.all<Omit<BookList, "books">>(
      `SELECT ${columns} FROM lists l JOIN users u ON u.id=l.user_id WHERE ${where} ORDER BY l.updated_at DESC,l.id DESC LIMIT 20 OFFSET ?`,
      ...values,
      (page - 1) * 20,
    );
    res.json({ items: await details(db, rows), total, page, pages });
  });
  app.post("/api/lists/:id/books", async (req, res) => {
    const owner = res.locals.user as User | undefined;
    if (!owner) throw new ApiError(401, "Sign in to manage your lists.");
    const { bookId } = z
      .object({ bookId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/) })
      .parse(req.body);
    const listId = String(req.params.id);
    await db.transaction(async (tx) => {
      const list = await tx.get(
        `SELECT id FROM lists WHERE id=? AND user_id=?${tx.kind === "postgres" ? " FOR UPDATE" : ""}`,
        listId,
        owner.id,
      );
      if (!list) throw new ApiError(404, "List not found.");
      if (!(await tx.get("SELECT id FROM books WHERE id=?", bookId)))
        throw new ApiError(404, "Book not found.");
      if (
        await tx.get(
          "SELECT book_id FROM list_books WHERE list_id=? AND book_id=?",
          listId,
          bookId,
        )
      )
        return;
      const count = Number(
        (await tx.get<{ n: number }>(
          "SELECT count(*) AS n FROM list_books WHERE list_id=?",
          listId,
        ))!.n,
      );
      if (count >= 50)
        throw new ApiError(
          400,
          "This list has 50 books. Remove a book before adding another.",
        );
      await tx.run(
        "INSERT INTO list_books(list_id,book_id,position) VALUES(?,?,?)",
        listId,
        bookId,
        count,
      );
      await tx.run(
        "UPDATE lists SET updated_at=CURRENT_TIMESTAMP WHERE id=?",
        listId,
      );
    });
    res.json({ id: listId });
  });
  app.get("/api/lists/:id", async (req, res) => {
    const rows = await db.transaction(async (tx) => {
      const rows = await tx.all<Omit<BookList, "books">>(
        `SELECT ${columns} FROM lists l JOIN users u ON u.id=l.user_id WHERE l.id=? AND (l.visibility='public' OR l.user_id=?)`,
        String(req.params.id),
        res.locals.user?.id || "",
      );
      return details(tx, rows);
    });
    if (
      !rows[0] ||
      (await hiddenReaders(db, res.locals.user?.id, false)).includes(
        rows[0].userId,
      )
    )
      throw new ApiError(404, "List not found or private.");
    res.json(rows[0]);
  });
  for (const method of ["post", "put"] as const)
    app[method](
      method === "post" ? "/api/lists" : "/api/lists/:id",
      async (req, res) => {
        const owner = res.locals.user as User | undefined;
        if (!owner) throw new ApiError(401, "Sign in to create a list.");
        const draft = listSchema.parse(req.body),
          listId =
            method === "post"
              ? randomUUID()
              : String((req.params as { id: string }).id);
        await db.transaction(async (tx) => {
          if (method === "put") {
            const result = await tx.run(
              "UPDATE lists SET title=?,description=?,visibility=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?",
              draft.title,
              draft.description,
              draft.visibility,
              listId,
              owner.id,
            );
            if (!result.changes) throw new ApiError(404, "List not found.");
          } else
            await tx.run(
              "INSERT INTO lists (id,user_id,title,description,visibility) VALUES (?,?,?,?,?)",
              listId,
              owner.id,
              draft.title,
              draft.description,
              draft.visibility,
            );
          if (draft.bookIds.length) {
            const found = await tx.all(
              `SELECT id FROM books WHERE id IN (${draft.bookIds.map(() => "?").join(",")})`,
              ...draft.bookIds,
            );
            if (found.length !== draft.bookIds.length)
              throw new ApiError(
                400,
                "One of these books is unavailable. Remove it and try again.",
              );
          }
          await tx.run("DELETE FROM list_books WHERE list_id=?", listId);
          for (const [position, bookId] of draft.bookIds.entries())
            await tx.run(
              "INSERT INTO list_books (list_id,book_id,position) VALUES (?,?,?)",
              listId,
              bookId,
              position,
            );
        });
        res.status(method === "post" ? 201 : 200).json({ id: listId });
      },
    );
  app.delete("/api/lists/:id", async (req, res) => {
    if (!res.locals.user)
      throw new ApiError(401, "Sign in to manage your lists.");
    const result = await db.run(
      "DELETE FROM lists WHERE id=? AND user_id=?",
      String(req.params.id),
      res.locals.user.id,
    );
    if (!result.changes) throw new ApiError(404, "List not found.");
    res.status(204).end();
  });
}
