import type { Express } from "express";
import type { Store } from "./store.ts";
import type { Book } from "../shared/types.ts";
import { z } from "zod";
import { bookById } from "./services.ts";
import { bookMetadata } from "./google-books.ts";
import { languageExpression, languageSchema } from "./book-language.ts";
export function editionRoutes(app: Express, db: Store) {
  app.get("/api/books/:id/editions", async (req, res) => {
    const id = z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,80}$/)
      .parse(req.params.id);
    const filter = z
      .object({
        language: languageSchema,
        page: z.coerce.number().int().min(1).max(100000).default(1),
      })
      .parse(req.query);
    const book = await bookById(db, id),
      metadata = await bookMetadata(db, id);
    const author = metadata?.authors[0] || book.author;
    // Exact title and credited author are deliberately conservative: never infer a translation or merge records.
    const knownAuthor =
      !!author.trim() && author.trim().toLowerCase() !== "unknown author";
    const matching = knownAuthor
      ? `lower(trim(title))=lower(trim(?)) AND (lower(trim(author))=lower(trim(?)) OR EXISTS (SELECT 1 FROM book_authors ba WHERE ba.book_id=books.id AND lower(trim(ba.name))=lower(trim(?))))`
      : "id=?";
    const where = `WHERE ${matching} ${filter.language ? "AND " + languageExpression(db) + "=?" : ""}`;
    const args = [
      ...(knownAuthor ? [book.title, book.author, author] : [book.id]),
      ...(filter.language ? [filter.language] : []),
    ];
    const total = Number(
      (await db.get<{ n: number }>(
        `SELECT count(*) AS n FROM books ${where}`,
        ...args,
      ))!.n,
    );
    const pages = Math.max(1, Math.ceil(total / 12)),
      page = Math.min(filter.page, pages);
    const books = await db.all<Book>(
      `SELECT * FROM books ${where} ORDER BY CASE WHEN year IS NULL THEN 1 ELSE 0 END,year DESC,id LIMIT 12 OFFSET ?`,
      ...args,
      (page - 1) * 12,
    );
    res.json({
      items: await Promise.all(
        books.map(async (book) => ({
          book,
          metadata: await bookMetadata(db, book.id),
        })),
      ),
      total,
      page,
      pages,
    });
  });
}
