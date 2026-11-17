import { z } from "zod";
import type { Express } from "express";
import type { Store } from "./store.ts";
import type { Comment } from "../shared/types.ts";
import { hiddenReaders } from "./social-safety.ts";
import { ApiError } from "./services.ts";

const cursorSchema = z.object({
  post: z.string(),
  at: z
    .string()
    .min(1)
    .max(40)
    .refine((s) => Number.isFinite(Date.parse(s))),
  id: z.string().min(1).max(80),
});
export async function commentPage(
  db: Store,
  postId: string,
  hidden: string[],
  input?: unknown,
) {
  const token = z.string().min(1).max(1000).optional().parse(input);
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (token)
    try {
      cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(token, "base64url").toString("utf8")),
      );
      if (cursor.post !== postId) throw new Error();
    } catch {
      throw new ApiError(
        400,
        "Invalid comment cursor. Refresh this conversation.",
      );
    }
  const where = `c.post_id=? ${hidden.length ? `AND c.user_id NOT IN (${hidden.map(() => "?").join(",")})` : ""}`;
  const total = Number(
    (await db.get<{ n: number }>(
      `SELECT count(*) AS n FROM comments c WHERE ${where}`,
      postId,
      ...hidden,
    ))!.n,
  );
  const rows = await db.all<Comment & { cursorAt: string }>(
    `SELECT c.id,c.body,c.user_id AS "userId",u.display_name AS "displayName",c.created_at AS "createdAt",${db.kind === "postgres" ? "c.created_at::text" : "c.created_at"} AS "cursorAt" FROM comments c JOIN users u ON u.id=c.user_id WHERE ${where} ${cursor ? "AND (c.created_at<? OR (c.created_at=? AND c.id<?))" : ""} ORDER BY c.created_at DESC,c.id DESC LIMIT 21`,
    postId,
    ...hidden,
    ...(cursor ? [cursor.at, cursor.at, cursor.id] : []),
  );
  const items = rows.slice(0, 20),
    last = items.at(-1);
  return {
    items: items.map(({ cursorAt: _, ...item }) => item),
    total,
    nextCursor:
      rows.length > 20 && last
        ? Buffer.from(
            JSON.stringify({ post: postId, at: last.cursorAt, id: last.id }),
          ).toString("base64url")
        : null,
  };
}
export function postCommentRoutes(app: Express, db: Store) {
  app.get("/api/posts/:id/comments", async (req, res) => {
    const hidden = await hiddenReaders(db, res.locals.user?.id);
    const post = await db.get<{ user_id: string }>(
      "SELECT user_id FROM posts WHERE id=?",
      String(req.params.id),
    );
    if (!post || hidden.includes(post.user_id))
      throw new ApiError(404, "Post not found.");
    res.json(
      await commentPage(db, String(req.params.id), hidden, req.query.before),
    );
  });
}
