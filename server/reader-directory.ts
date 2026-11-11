import { hiddenReaders } from "./social-safety.ts";
import type { Express } from "express";
import { z } from "zod";
import type { Store, Value } from "./store.ts";
import type { Reader } from "../shared/types.ts";
import { ApiError } from "./services.ts";
export function readerDirectoryRoutes(app: Express, db: Store) {
  app.get("/api/readers/directory", async (req, res) => {
    const query = z
      .object({
        q: z.string().trim().max(80).default(""),
        scope: z.enum(["all", "followers", "following"]).default("all"),
        reader: z
          .string()
          .regex(/^[a-zA-Z0-9_-]{1,80}$/)
          .optional(),
        page: z.coerce.number().int().min(1).max(100000).default(1),
      })
      .parse(req.query);
    let heading = "Find your reading people";
    const conditions: string[] = [],
      values: Value[] = [];
    const hidden = await hiddenReaders(db, res.locals.user?.id);
    if (hidden.length) {
      conditions.push(`u.id NOT IN (${hidden.map(() => "?").join(",")})`);
      values.push(...hidden);
    }
    if (query.scope !== "all") {
      if (!query.reader)
        throw new ApiError(400, "Choose a reader to see their connections.");
      const target = await db.get<{ name: string }>(
        "SELECT display_name AS name FROM users WHERE id=?",
        query.reader,
      );
      if (!target) throw new ApiError(404, "Reader not found.");
      heading = `${target.name} · ${query.scope}`;
      conditions.push(
        query.scope === "followers"
          ? "EXISTS(SELECT 1 FROM follows f WHERE f.followed_id=? AND f.user_id=u.id)"
          : "EXISTS(SELECT 1 FROM follows f WHERE f.user_id=? AND f.followed_id=u.id)",
      );
      values.push(query.reader);
    }
    if (query.q) {
      conditions.push(
        "(lower(u.username) LIKE ? ESCAPE '!' OR lower(u.display_name) LIKE ? ESCAPE '!')",
      );
      const q = `%${query.q.toLowerCase().replace(/[!%_]/g, "!$&")}%`;
      values.push(q, q);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const total = (await db.get<{ n: number }>(
      `SELECT count(*) AS n FROM users u${where}`,
      ...values,
    ))!.n;
    const pages = Math.max(1, Math.ceil(total / 12)),
      page = Math.min(query.page, pages);
    const items = await db.all<Reader>(
      `SELECT u.id,u.username,u.display_name AS "displayName",u.bio,EXISTS(SELECT 1 FROM follows f WHERE f.user_id=? AND f.followed_id=u.id) AS following FROM users u${where} ORDER BY lower(u.display_name),u.id LIMIT 12 OFFSET ?`,
      res.locals.user?.id || "",
      ...values,
      (page - 1) * 12,
    );
    res.json({
      items: items.map((r) => ({ ...r, following: !!r.following })),
      total,
      page,
      pages,
      heading,
    });
  });
}
