import { z } from "zod";
import type { Store } from "./store.ts";
import { ApiError, bookById, feed } from "./services.ts";

const querySchema = z.object({
  sort: z.enum(["recent", "appreciated"]).default("recent"),
  filter: z.enum(["all", "following"]).default("all"),
  before: z.string().min(1).max(1000).optional(),
});
const cursorSchema = z.object({
  book: z.string(),
  sort: z.enum(["recent", "appreciated"]),
  filter: z.enum(["all", "following"]),
  at: z.string().min(1).max(40),
  id: z.string().min(1).max(80),
  likes: z.number().int().nonnegative(),
});
export async function bookReviewPage(
  db: Store,
  bookId: string,
  viewer: string | undefined,
  input: unknown,
) {
  const query = querySchema.parse(input);
  if (query.filter === "following" && !viewer)
    throw new ApiError(401, "Sign in to see reviews from readers you follow.");
  let before: z.infer<typeof cursorSchema> | undefined;
  if (query.before) {
    try {
      before = cursorSchema.parse(
        JSON.parse(Buffer.from(query.before, "base64url").toString("utf8")),
      );
      if (
        before.book !== bookId ||
        before.sort !== query.sort ||
        before.filter !== query.filter
      )
        throw new Error();
    } catch {
      throw new ApiError(400, "Invalid review cursor. Refresh the reviews.");
    }
  }
  await bookById(db, bookId);
  const rows = await feed(db, viewer, false, bookId, undefined, undefined, {
    before,
    sort: query.sort,
    followedOnly: query.filter === "following",
    limit: 21,
  });
  const items = rows.slice(0, 20),
    last = items.at(-1);
  return {
    items,
    mine: viewer
      ? (await feed(db, viewer, false, bookId, viewer))[0] || null
      : null,
    nextCursor:
      rows.length > 20 && last
        ? Buffer.from(
            JSON.stringify({
              book: bookId,
              sort: query.sort,
              filter: query.filter,
              at: last.createdAt,
              id: last.id,
              likes: last.likes,
            }),
          ).toString("base64url")
        : null,
  };
}
