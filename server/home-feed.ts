import { randomUUID } from "node:crypto";
import type { Store } from "./store.ts";
import { hiddenReaders } from "./social-safety.ts";
import { ApiError, feed } from "./services.ts";

type Candidate = {
  id: string;
  userId: string;
  createdAt: string;
  bookId: string | null;
  genre: string | null;
  likes: number;
  comments: number;
};
type Snapshot = {
  viewer: string;
  expires: number;
  ids: string[];
  reasons: Record<string, string>;
};

// A bounded, short-lived order keeps engagement changes from duplicating or
// skipping posts during pagination. Content and safety are rechecked per page.
export function createHomeFeed(db: Store) {
  const snapshots = new Map<string, Snapshot>();
  return async (viewer?: string, cursor?: string) => {
    const now = Date.now();
    for (const [key, value] of snapshots)
      if (value.expires <= now) snapshots.delete(key);
    let key: string,
      offset = 0,
      snapshot: Snapshot;
    if (cursor) {
      const match = /^([a-f0-9-]{36}):(\d{1,3})$/.exec(cursor);
      const found = match && snapshots.get(match[1]);
      if (!match || !found || found.viewer !== (viewer || ""))
        throw new ApiError(
          409,
          "This feed has expired. Refresh the feed to continue.",
        );
      key = match[1];
      offset = Number(match[2]);
      snapshot = found;
      if (offset > snapshot.ids.length)
        throw new ApiError(400, "Invalid feed position.");
    } else {
      const hidden = await hiddenReaders(db, viewer);
      const candidates = await db.all<Candidate>(
        `SELECT p.id,p.user_id AS "userId",p.created_at AS "createdAt",p.book_id AS "bookId",b.genre,
        (SELECT count(*) FROM post_likes l WHERE l.post_id=p.id) AS likes,
        (SELECT count(*) FROM comments c WHERE c.post_id=p.id) AS comments
        FROM posts p LEFT JOIN books b ON b.id=p.book_id
        ${hidden.length ? `WHERE p.user_id NOT IN (${hidden.map(() => "?").join(",")})` : ""}
        ORDER BY p.created_at DESC,p.id DESC LIMIT 200`,
        ...hidden,
      );
      const follows = new Set(
        viewer
          ? (
              await db.all<{ id: string }>(
                "SELECT followed_id AS id FROM follows WHERE user_id=?",
                viewer,
              )
            ).map((x) => x.id)
          : [],
      );
      // Only the viewer's public positive reviews supply book/genre affinity.
      const reviews = viewer
        ? await db.all<{ id: string; genre: string }>(
            "SELECT p.book_id AS id,b.genre FROM posts p JOIN books b ON b.id=p.book_id WHERE p.user_id=? AND p.kind='review' AND p.rating>=4",
            viewer,
          )
        : [];
      const books = new Set(reviews.map((x) => x.id)),
        genres = new Set(reviews.map((x) => x.genre));
      const pool = candidates.map((p) => {
        const age = Math.max(
          0,
          (now -
            Date.parse(
              p.createdAt.replace(" ", "T") +
                (/Z$|[+-]\d\d:\d\d$/.test(p.createdAt) ? "" : "Z"),
            )) /
            86400000,
        );
        const followed = follows.has(p.userId),
          affinity =
            p.bookId && books.has(p.bookId)
              ? 5
              : p.genre && genres.has(p.genre)
                ? 2.5
                : 0;
        const engagement = Math.log1p(
          Math.min(20, Number(p.likes)) +
            Math.min(12, Number(p.comments)) * 1.5,
        );
        return {
          ...p,
          score:
            (6 + (followed ? 4 : 0) + affinity + engagement) /
            Math.pow(1 + (Number.isFinite(age) ? age : 30) / 3, 0.8),
          reason: followed
            ? "From your circle"
            : affinity
              ? "Based on your public reviews"
              : engagement > 1
                ? "Readers are talking"
                : "New in the community",
        };
      });
      const ids: string[] = [],
        reasons: Record<string, string> = {},
        authors = new Map<string, number>();
      while (pool.length) {
        // Diminishing author weight makes room for other voices in the batch.
        pool.sort(
          (a, b) =>
            b.score / (1 + (authors.get(b.userId) || 0) * 0.65) -
              a.score / (1 + (authors.get(a.userId) || 0) * 0.65) ||
            b.createdAt.localeCompare(a.createdAt) ||
            b.id.localeCompare(a.id),
        );
        const p = pool.shift()!;
        ids.push(p.id);
        reasons[p.id] = p.reason;
        authors.set(p.userId, (authors.get(p.userId) || 0) + 1);
      }
      snapshot = {
        viewer: viewer || "",
        expires: now + 15 * 60_000,
        ids,
        reasons,
      };
      key = randomUUID();
      if (snapshots.size >= 128)
        snapshots.delete(snapshots.keys().next().value!);
      snapshots.set(key, snapshot);
    }
    const items = [];
    while (items.length < 20 && offset < snapshot.ids.length) {
      const ids = snapshot.ids.slice(offset, offset + 20 - items.length);
      offset += ids.length;
      const visible = await feed(
        db,
        viewer,
        false,
        undefined,
        undefined,
        undefined,
        { ids, limit: 20 },
      );
      const byId = new Map(visible.map((p) => [p.id, p]));
      for (const id of ids) {
        const p = byId.get(id);
        if (p) items.push({ ...p, feedReason: snapshot.reasons[id] });
      }
    }
    return {
      items,
      nextCursor: offset < snapshot.ids.length ? `${key}:${offset}` : null,
    };
  };
}
