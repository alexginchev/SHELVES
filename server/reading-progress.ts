import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Store } from "./store.ts";
import { ApiError } from "./services.ts";

export function progressRoutes(app: Express, db: Store) {
  app.post("/api/library/:id/progress", async (req, res) => {
    if (!res.locals.user)
      throw new ApiError(401, "Sign in to update your progress.");
    const draft = z
      .object({
        page: z.number().int().min(0).max(50000),
        share: z.boolean().default(false),
        note: z.string().trim().max(600).default(""),
      })
      .parse(req.body);
    await db.transaction(async (tx) => {
      const book = await tx.get<{ title: string; pages: number | null }>(
        "SELECT b.title,b.pages FROM books b JOIN reading r ON r.book_id=b.id WHERE b.id=? AND r.user_id=? AND r.status='Currently reading'",
        String(req.params.id),
        res.locals.user.id,
      );
      if (!book)
        throw new ApiError(
          404,
          "This book is not on your currently reading shelf.",
        );
      if (book.pages && draft.page > book.pages)
        throw new ApiError(400, `This edition has ${book.pages} pages.`);
      const updated = await tx.run(
        "UPDATE reading SET page=?,updated_at=CURRENT_TIMESTAMP WHERE book_id=? AND user_id=? AND status='Currently reading'",
        draft.page,
        String(req.params.id),
        res.locals.user.id,
      );
      if (!updated.changes)
        throw new ApiError(
          409,
          "Your reading status changed. Refresh and try again.",
        );
      if (draft.share)
        await tx.run(
          "INSERT INTO posts (id,user_id,body,kind,book_id) VALUES (?,?,?,'progress',?)",
          randomUUID(),
          res.locals.user.id,
          `I'm on page ${draft.page}${book.pages ? ` of ${book.pages}` : ""} of ${book.title}.${draft.note ? `\n\n${draft.note}` : ""}`,
          String(req.params.id),
        );
    });
    res.status(204).end();
  });
}
