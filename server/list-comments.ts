import { hiddenReaders, assertInteraction } from "./social-safety.ts";
import type { Express } from "express";
import { z } from "zod";
import type { Store } from "./store.ts";
import { ApiError } from "./services.ts";
import type { ListComment } from "../shared/list-comments.ts";

export function listCommentRoutes(app: Express, db: Store) {
  async function visibleList(tx: Store, listId: string, viewer: string) {
    const list = await tx.get<{ user_id: string; visibility: string }>(
      `SELECT user_id,visibility FROM lists WHERE id=?${tx.kind === "postgres" ? " FOR UPDATE" : ""}`,
      listId,
    );
    if (!list || (list.visibility !== "public" && list.user_id !== viewer))
      throw new ApiError(404, "List not found or private.");
    await assertInteraction(tx, viewer, list.user_id);
    return list;
  }
  app.get("/api/lists/:id/comments", async (req, res) => {
    const requested = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .default(1)
      .parse(req.query.page);
    const result = await db.transaction(async (tx) => {
      await visibleList(tx, String(req.params.id), res.locals.user?.id || "");
      const hidden = await hiddenReaders(tx, res.locals.user?.id);
      const exclusion = hidden.length
        ? ` AND user_id NOT IN (${hidden.map(() => "?").join(",")})`
        : "";
      const total = (await tx.get<{ n: number }>(
        `SELECT count(*) AS n FROM list_comments WHERE list_id=?${exclusion}`,
        String(req.params.id),
        ...hidden,
      ))!.n;
      const pages = Math.max(1, Math.ceil(total / 20)),
        page = Math.min(requested, pages);
      const items = await tx.all<ListComment>(
        `SELECT c.id,c.user_id AS "userId",u.display_name AS "displayName",c.body,c.created_at AS "createdAt" FROM list_comments c JOIN users u ON u.id=c.user_id WHERE c.list_id=?${hidden.length ? ` AND c.user_id NOT IN (${hidden.map(() => "?").join(",")})` : ""} ORDER BY c.created_at DESC,c.id DESC LIMIT 20 OFFSET ?`,
        String(req.params.id),
        ...hidden,
        (page - 1) * 20,
      );
      return { items, total, page, pages };
    });
    res.json(result);
  });
  app.post("/api/lists/:id/comments", async (req, res) => {
    const viewer = res.locals.user?.id;
    if (!viewer) throw new ApiError(401, "Sign in to join the conversation.");
    const draft = z
      .object({ id: z.uuid(), body: z.string().trim().min(1).max(1000) })
      .parse(req.body);
    await db.transaction(async (tx) => {
      const list = await visibleList(tx, String(req.params.id), viewer);
      if (list.visibility !== "public")
        throw new ApiError(
          403,
          "Publish the list before starting a conversation.",
        );
      const existing = await tx.get<{
        user_id: string;
        list_id: string;
        body: string;
      }>("SELECT user_id,list_id,body FROM list_comments WHERE id=?", draft.id);
      if (existing) {
        if (
          existing.user_id !== viewer ||
          existing.list_id !== String(req.params.id) ||
          existing.body !== draft.body
        )
          throw new ApiError(
            409,
            "This comment request has already been used. Refresh and try again.",
          );
        return;
      }
      await tx.run(
        "INSERT INTO list_comments VALUES (?,?,?,?,?)",
        draft.id,
        String(req.params.id),
        viewer,
        draft.body,
        new Date().toISOString(),
      );
    });
    res.status(201).json({ id: draft.id });
  });
  app.delete("/api/lists/:id/comments/:commentId", async (req, res) => {
    const viewer = res.locals.user?.id;
    if (!viewer) throw new ApiError(401, "Sign in to manage comments.");
    await db.transaction(async (tx) => {
      const list = await visibleList(tx, String(req.params.id), viewer);
      const result = await tx.run(
        "DELETE FROM list_comments WHERE id=? AND list_id=? AND (user_id=? OR ?=?)",
        String(req.params.commentId),
        String(req.params.id),
        viewer,
        list.user_id,
        viewer,
      );
      if (!result.changes)
        throw new ApiError(404, "Comment not found or unavailable.");
    });
    res.status(204).end();
  });
}
