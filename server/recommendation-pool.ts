import { discoverNovels } from "./discovery.ts";
import { recommendations } from "./recommendations.ts";
import type { Store } from "./store.ts";
import { readingGenres } from "../shared/genres.ts";

const novelGenres = [
  "Literary",
  "Fantasy",
  "Mystery",
  "Romance",
  "Science fiction",
  "Classic",
  "Fiction",
] as const;
const allowed = new Set<string>(readingGenres);
const pending = new WeakMap<Store, Map<string, Promise<void>>>();

function rotate<T>(values: readonly T[], index: number): T[] {
  return [
    ...values.slice(index % values.length),
    ...values.slice(0, index % values.length),
  ];
}

/** Select subjects from explicit Orbit choices, saved books and positive feedback. */
export async function recommendationSubjects(
  db: Store,
  userId = "",
  day = Math.floor(Date.now() / 86400000),
) {
  if (!userId)
    return rotate(
      novelGenres.filter((genre) => !["Classic", "Fiction"].includes(genre)),
      day,
    ).slice(0, 2);
  const row = await db.get<{ genres: string; book_ids: string }>(
    "SELECT genres,book_ids FROM reading_preferences WHERE user_id=?",
    userId,
  );
  let chosen: string[] = [];
  let favoriteIds: string[] = [];
  try {
    chosen = row ? JSON.parse(row.genres) : [];
    favoriteIds = row ? JSON.parse(row.book_ids) : [];
  } catch {
    /* Invalid old preferences should not break the feed. */
  }
  const favoriteGenres = favoriteIds.length
    ? await db.all<{ genre: string }>(
        `SELECT DISTINCT genre FROM books WHERE id IN (${favoriteIds.map(() => "?").join(",")})`,
        ...favoriteIds,
      )
    : [];
  const signals = await db.all<{ genre: string; weight: number }>(
    `SELECT genre,SUM(weight) AS weight FROM (
      SELECT b.genre,CASE WHEN r.rating>=4 THEN 3 WHEN r.rating BETWEEN 1 AND 2 THEN -2 ELSE 1 END AS weight
      FROM reading r JOIN books b ON b.id=r.book_id WHERE r.user_id=?
      UNION ALL SELECT b.genre,CASE WHEN t.signal='more' THEN 4 ELSE -3 END
      FROM recommendation_taste_feedback t JOIN books b ON b.id=t.book_id WHERE t.user_id=?
    ) taste GROUP BY genre ORDER BY weight DESC,genre LIMIT 6`,
    userId,
    userId,
  );
  const ranked = [
    ...new Set([
      ...chosen,
      ...favoriteGenres.map((b) => b.genre),
      ...signals.filter((s) => s.weight > 0).map((s) => s.genre),
    ]),
  ].filter(
    (genre) => allowed.has(genre) && novelGenres.some((g) => g === genre),
  );
  // Literary, Classic and Fiction share one Google subject. Fetching all three
  // would spend quota on the same page of results.
  const subject = (genre: string) =>
    ["Literary", "Classic", "Fiction"].includes(genre) ? "Fiction" : genre;
  const picked: string[] = [];
  const seen = new Set<string>();
  for (const genre of ranked) {
    if (picked.length === 2) break;
    if (!seen.has(subject(genre))) {
      picked.push(genre);
      seen.add(subject(genre));
    }
  }
  for (const genre of rotate(novelGenres, day)) {
    if (picked.length === (ranked.length ? 3 : 2)) break;
    if (!seen.has(subject(genre))) {
      picked.push(genre);
      seen.add(subject(genre));
    }
  }
  return picked;
}

/** Google imports are shared across readers, with a persistent daily refresh marker.
 * A failed provider call backs off for 30 minutes while saved books remain available.
 */
export async function refreshRecommendationPool(
  db: Store,
  userId = "",
  language = "en",
) {
  if (!process.env.GOOGLE_BOOKS_API_KEY?.trim()) return;
  const day = Math.floor(Date.now() / 86400000);
  const subjects = await recommendationSubjects(db, userId, day);
  await Promise.all(
    subjects.map(async (genre) => {
      // Walk twelve result pages before cycling; a reader should not see the
      // same first page of each subject on every refresh.
      const offset = (day % 12) * 10;
      const marker = `recommendation-pool-v2:${language}:${genre}:${offset}`;
      const previous = await db.get<{
        items: string;
        fetched_at: number | string;
      }>(
        "SELECT items,fetched_at FROM book_search_cache WHERE query=?",
        marker,
      );
      if (previous) {
        const ttl = previous.items === "ok" ? 22 * 3600000 : 30 * 60000;
        if (Date.now() - Number(previous.fetched_at) < ttl) return;
      }
      let requests = pending.get(db);
      if (!requests) {
        requests = new Map();
        pending.set(db, requests);
      }
      const existing = requests.get(marker);
      if (existing) return existing;
      const request = (async () => {
        let status = "retry";
        try {
          const page = await discoverNovels(db, genre, offset, language);
          if (page.source === "Google Books") status = "ok";
        } catch {
          /* Saved recommendations still work during timeouts or rate limits. */
        }
        await db.run(
          "INSERT INTO book_search_cache VALUES (?,?,?) ON CONFLICT(query) DO UPDATE SET items=excluded.items,fetched_at=excluded.fetched_at",
          marker,
          status,
          Date.now(),
        );
      })().finally(() => requests!.delete(marker));
      requests.set(marker, request);
      return request;
    }),
  );
}

/** Keep API latency bounded while the shared catalogue grows in the background. */
export async function recommendationsWithRefresh(
  db: Store,
  userId = "",
  language = "",
) {
  const preferred = language || "en";
  if (
    !process.env.GOOGLE_BOOKS_API_KEY?.trim() ||
    process.env.NODE_ENV === "test"
  )
    return recommendations(db, userId, preferred).then(async (items) =>
      items.length || preferred === "en"
        ? items
        : recommendations(db, userId, "en"),
    );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      refreshRecommendationPool(db, userId, preferred).catch(() => {
        /* Catalogue maintenance must never take down the recommendations endpoint. */
      }),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 2000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  const items = await recommendations(db, userId, preferred);
  return items.length || preferred === "en"
    ? items
    : recommendations(db, userId, "en");
}
