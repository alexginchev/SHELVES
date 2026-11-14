import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Store } from "./store.ts";
import { ApiError } from "./services.ts";
import { isAdmin } from "./admin.ts";

export async function hiddenReaders(
  db: Store,
  viewer = "",
  mutes = true,
): Promise<string[]> {
  const suspended = await db.all<{ id: string }>(
    "SELECT user_id AS id FROM account_suspensions",
  );
  if (!viewer) return suspended.map((r) => r.id);
  const rows = await db.all<{ id: string }>(
    "SELECT target_id AS id FROM reader_controls WHERE user_id=? AND (kind='block' OR kind=?) UNION SELECT user_id AS id FROM reader_controls WHERE target_id=? AND kind='block'",
    viewer,
    mutes ? "mute" : "block",
    viewer,
  );
  return [...new Set([...rows, ...suspended].map((r) => r.id))];
}
export async function lockReaders(db: Store, a: string, b: string) {
  if (db.kind === "postgres" && a && b)
    await db.all(
      "SELECT id FROM users WHERE id IN (?,?) ORDER BY id FOR UPDATE",
      a,
      b,
    );
}
export async function assertInteraction(
  db: Store,
  viewer: string,
  target: string,
) {
  await lockReaders(db, viewer, target);
  if ((await hiddenReaders(db, viewer, false)).includes(target))
    throw new ApiError(
      403,
      "This interaction is unavailable because of a reader block.",
    );
}
export function safetyRoutes(app: Express, db: Store) {
  const signedIn = (res: { locals: Record<string, any> }) => {
    if (!res.locals.user)
      throw new ApiError(401, "Sign in to manage your reading circle.");
    return res.locals.user.id as string;
  };
  app.get("/api/me/reader-controls", async (_req, res) => {
    const me = signedIn(res);
    res.json({
      items: await db.all(
        'SELECT c.target_id AS id,c.kind,u.username,u.display_name AS "displayName" FROM reader_controls c JOIN users u ON u.id=c.target_id WHERE c.user_id=? ORDER BY lower(u.display_name)',
        me,
      ),
    });
  });
  for (const method of ["put", "delete"] as const)
    app[method]("/api/readers/:id/controls/:kind", async (req, res) => {
      const me = signedIn(res),
        target = String(req.params.id),
        kind = z.enum(["block", "mute"]).parse(req.params.kind);
      if (me === target) throw new ApiError(400, "Choose another reader.");
      if (!(await db.get("SELECT id FROM users WHERE id=?", target)))
        throw new ApiError(404, "Reader not found.");
      await db.transaction(async (tx) => {
        await lockReaders(tx, me, target);
        if (method === "delete")
          await tx.run(
            "DELETE FROM reader_controls WHERE user_id=? AND target_id=? AND kind=?",
            me,
            target,
            kind,
          );
        else {
          await tx.run(
            "INSERT INTO reader_controls VALUES (?,?,?) ON CONFLICT DO NOTHING",
            me,
            target,
            kind,
          );
          if (kind === "block") {
            await tx.run(
              "DELETE FROM follows WHERE (user_id=? AND followed_id=?) OR (user_id=? AND followed_id=?)",
              me,
              target,
              target,
              me,
            );
            await tx.run(
              "DELETE FROM notifications WHERE (recipient_id=? AND actor_id=?) OR (recipient_id=? AND actor_id=?)",
              me,
              target,
              target,
              me,
            );
          }
        }
      });
      res.status(204).end();
    });
  app.post("/api/reports", async (req, res) => {
    const me = signedIn(res),
      draft = z
        .object({
          kind: z.enum(["post", "comment", "reader", "list_comment"]),
          targetId: z.string().min(1).max(80),
          reason: z.enum([
            "Spam",
            "Harassment",
            "Hate or threats",
            "Inappropriate content",
            "Other",
          ]),
          details: z.string().trim().max(1000).default(""),
        })
        .parse(req.body);
    const table = {
      post: "posts",
      comment: "comments",
      reader: "users",
      list_comment: "list_comments",
    }[draft.kind];
    const target = await db.get<{ owner: string }>(
      `SELECT ${draft.kind === "reader" ? "id" : "user_id"} AS owner FROM ${table} WHERE id=?`,
      draft.targetId,
    );
    if (!target)
      throw new ApiError(404, "This content is no longer available.");
    if (draft.kind === "list_comment") {
      const list = await db.get<{ visibility: string; user_id: string }>(
        "SELECT l.visibility,l.user_id FROM lists l JOIN list_comments c ON c.list_id=l.id WHERE c.id=?",
        draft.targetId,
      );
      if (!list || (list.visibility !== "public" && list.user_id !== me))
        throw new ApiError(404, "This content is no longer available.");
      await assertInteraction(db, me, list.user_id);
    }
    if (target.owner === me)
      throw new ApiError(400, "You cannot report your own content.");
    await db.run(
      "INSERT INTO reports (id,reporter_id,target_kind,target_id,reason,details,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(reporter_id,target_kind,target_id) DO NOTHING",
      randomUUID(),
      me,
      draft.kind,
      draft.targetId,
      draft.reason,
      draft.details,
      new Date().toISOString(),
    );
    res.status(201).json({ ok: true });
  });
  function admin(res: { locals: Record<string, any> }) {
    const me = signedIn(res);
    if (!isAdmin(me)) throw new ApiError(403, "Administrator access required.");
    return me;
  }
  app.get("/api/admin/accounts", async (req, res) => {
    admin(res);
    const q = z.string().trim().max(80).default("").parse(req.query.q);
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .default(1)
      .parse(req.query.page);
    const pattern = "%" + q.toLowerCase().replace(/[!%_]/g, "!$&") + "%";
    const total = (await db.get<{ n: number }>(
      "SELECT count(*) AS n FROM users WHERE lower(username) LIKE ? ESCAPE '!'",
      pattern,
    ))!.n;
    const pages = Math.max(1, Math.ceil(total / 20)),
      current = Math.min(page, pages);
    const rows = await db.all<{
      id: string;
      username: string;
      displayName: string;
      reason: string | null;
      createdAt: string | null;
    }>(
      `SELECT u.id,u.username,u.display_name AS "displayName",s.reason,s.created_at AS "createdAt" FROM users u LEFT JOIN account_suspensions s ON s.user_id=u.id WHERE lower(u.username) LIKE ? ESCAPE '!' ORDER BY CASE WHEN s.user_id IS NULL THEN 1 ELSE 0 END,u.username LIMIT 20 OFFSET ?`,
      pattern,
      (current - 1) * 20,
    );
    res.json({
      items: rows.map((r) => ({ ...r, protected: isAdmin(r.id) })),
      total,
      pages,
      page: current,
    });
  });
  app.get("/api/admin/accounts/:id/history", async (req, res) => {
    admin(res);
    res.json({
      items: await db.all(
        'SELECT action,reason,actor_name AS "actorName",created_at AS "createdAt" FROM moderation_actions WHERE target_id=? ORDER BY created_at DESC,id DESC LIMIT 100',
        String(req.params.id),
      ),
    });
  });
  app.post("/api/admin/accounts/:id/status", async (req, res) => {
    const actor = admin(res),
      target = String(req.params.id);
    const draft = z
      .object({
        action: z.enum(["suspend", "restore"]),
        reason: z
          .string()
          .trim()
          .min(10, "Give a reason of at least 10 characters.")
          .max(1000),
      })
      .parse(req.body);
    if (actor === target || isAdmin(target))
      throw new ApiError(
        403,
        "Administrator accounts cannot be suspended here.",
      );
    await db.transaction(async (tx) => {
      await lockReaders(tx, actor, target);
      const row = await tx.get<{ username: string }>(
        "SELECT username FROM users WHERE id=?",
        target,
      );
      if (!row) throw new ApiError(404, "Reader not found.");
      const suspended = await tx.get(
        "SELECT user_id FROM account_suspensions WHERE user_id=?",
        target,
      );
      if ((draft.action === "suspend") === !!suspended)
        throw new ApiError(
          409,
          "The account status has already changed. Refresh and try again.",
        );
      const now = new Date().toISOString();
      if (draft.action === "suspend") {
        await tx.run(
          "INSERT INTO account_suspensions VALUES (?,?,?,?)",
          target,
          draft.reason,
          now,
          actor,
        );
        await tx.run("DELETE FROM sessions WHERE user_id=?", target);
      } else
        await tx.run("DELETE FROM account_suspensions WHERE user_id=?", target);
      const actorRow = await tx.get<{ username: string }>(
        "SELECT username FROM users WHERE id=?",
        actor,
      );
      await tx.run(
        "INSERT INTO moderation_actions VALUES (?,?,?,?,?,?,?,?)",
        randomUUID(),
        target,
        actor,
        row.username,
        actorRow!.username,
        draft.action,
        draft.reason,
        now,
      );
    });
    res.status(204).end();
  });
  app.get("/api/admin/reports", async (req, res) => {
    admin(res);
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .default(1)
      .parse(req.query.page);
    const status = z
      .enum(["open", "dismissed", "removed"])
      .default("open")
      .parse(req.query.status);
    const total = (await db.get<{ n: number }>(
      "SELECT count(*) AS n FROM reports WHERE status=?",
      status,
    ))!.n;
    const pages = Math.max(1, Math.ceil(total / 20)),
      current = Math.min(page, pages);
    const items = await db.all(
      `SELECT r.id,r.target_kind AS kind,r.target_id AS "targetId",r.reason,r.details,r.status,r.created_at AS "createdAt",
   u.username AS reporter,coalesce(p.body,c.body,lc.body,t.bio,'Content no longer available') AS content
   FROM reports r JOIN users u ON u.id=r.reporter_id
   LEFT JOIN posts p ON r.target_kind='post' AND p.id=r.target_id
   LEFT JOIN comments c ON r.target_kind='comment' AND c.id=r.target_id
   LEFT JOIN list_comments lc ON r.target_kind='list_comment' AND lc.id=r.target_id
   LEFT JOIN users t ON r.target_kind='reader' AND t.id=r.target_id
   WHERE r.status=? ORDER BY r.created_at,r.id LIMIT 20 OFFSET ?`,
      status,
      (current - 1) * 20,
    );
    res.json({ items, total, pages, page: current });
  });
  app.post("/api/admin/reports/:id/resolve", async (req, res) => {
    const me = admin(res),
      action = z.enum(["dismiss", "remove"]).parse(req.body.action);
    await db.transaction(async (tx) => {
      const report = await tx.get<{
        target_kind: string;
        target_id: string;
        status: string;
      }>(
        `SELECT target_kind,target_id,status FROM reports WHERE id=?${tx.kind === "postgres" ? " FOR UPDATE" : ""}`,
        String(req.params.id),
      );
      if (!report) throw new ApiError(404, "Report not found.");
      if (report.status !== "open")
        throw new ApiError(409, "This report has already been reviewed.");
      if (action === "remove") {
        if (report.target_kind === "reader")
          throw new ApiError(
            400,
            "Account removal is not available in this queue.",
          );
        const table =
          report.target_kind === "post"
            ? "posts"
            : report.target_kind === "list_comment"
              ? "list_comments"
              : "comments";
        await tx.run(`DELETE FROM ${table} WHERE id=?`, report.target_id);
      }
      await tx.run(
        "UPDATE reports SET status=?,resolved_at=?,resolved_by=? WHERE id=?",
        action === "remove" ? "removed" : "dismissed",
        new Date().toISOString(),
        me,
        String(req.params.id),
      );
    });
    res.status(204).end();
  });
}
