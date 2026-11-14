import { recommendationQuality } from "./book-quality.ts";
import type { BookMetadata } from "../shared/book-metadata.ts";
import { hiddenReaders } from "./social-safety.ts";
import type { Store } from "./store.ts";
import type { Book, Recommendation } from "../shared/types.ts";

type Candidate = Book & {
  score: number;
  genreAffinity: number;
  authorAffinity: number;
  circle: number;
  community: number;
};
const identity = (text: string) =>
  text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const workKey = (book: Book) =>
  `${identity(book.title)}\0${identity(book.author)}`;

export async function recommendations(
  db: Store,
  userId = "",
): Promise<Recommendation[]> {
  const hidden = await hiddenReaders(db, userId);
  const preference = userId
    ? await db.get<{ genres: string }>(
        "SELECT genres FROM reading_preferences WHERE user_id=?",
        userId,
      )
    : undefined;
  const preferred = new Set<string>(
    preference ? JSON.parse(preference.genres) : [],
  );
  const preferenceScore = preferred.size
    ? `CASE WHEN b.genre IN (${[...preferred].map(() => "?").join(",")}) THEN 3 ELSE 0 END`
    : "0";
  // Rank before bounding the candidate pool, so new imports can compete with the starter catalogue.
  // Only this reader's private records and other readers' public reviews influence the ranking.
  const candidates = await db.all<Candidate>(
    `
    WITH taste AS (
      SELECT b.genre,lower(b.author) AS author,
        CASE WHEN r.rating>=4 THEN r.rating-3 WHEN r.rating BETWEEN 1 AND 2 THEN -1
          WHEN r.status IN ('Want to read','Currently reading') THEN 1 ELSE 0 END AS weight
      FROM reading r JOIN books b ON b.id=r.book_id WHERE r.user_id=?
    ), genres AS (SELECT genre,SUM(weight) AS affinity FROM taste GROUP BY genre),
    authors AS (SELECT author,SUM(weight) AS affinity FROM taste GROUP BY author),
    reviews AS (
      SELECT p.book_id,
        SUM(CASE WHEN f.user_id IS NOT NULL AND p.rating>=4 THEN 1 ELSE 0 END) AS circle,
        CASE WHEN count(*)>=3 AND AVG(p.rating)>3 THEN (AVG(p.rating)-3)*0.75 ELSE 0 END AS community
      FROM posts p LEFT JOIN follows f ON f.followed_id=p.user_id AND f.user_id=?
      WHERE p.kind='review' AND p.rating BETWEEN 1 AND 5 AND p.user_id<>?
      ${hidden.length ? `AND p.user_id NOT IN (${hidden.map(() => "?").join(",")})` : ""}
      GROUP BY p.book_id
    )
    SELECT b.*,COALESCE(g.affinity,0) AS "genreAffinity",COALESCE(a.affinity,0) AS "authorAffinity",
      COALESCE(v.circle,0) AS circle,COALESCE(v.community,0) AS community,
      COALESCE(g.affinity,0)+COALESCE(a.affinity,0)+${preferenceScore}+
      CASE WHEN COALESCE(v.circle,0)>2 THEN 4 ELSE COALESCE(v.circle,0)*2 END+
      COALESCE(v.community,0) AS score
    FROM books b LEFT JOIN genres g ON g.genre=b.genre
    LEFT JOIN authors a ON a.author=lower(b.author) AND lower(b.author)<>'unknown author'
    LEFT JOIN reviews v ON v.book_id=b.id
    WHERE NOT EXISTS(SELECT 1 FROM reading r WHERE r.user_id=? AND r.book_id=b.id)
      AND NOT EXISTS(SELECT 1 FROM recommendation_feedback h WHERE h.user_id=? AND h.book_id=b.id)
    ORDER BY score DESC,CASE WHEN b.id LIKE 'seed-%' THEN 0 ELSE 1 END,lower(b.title),b.id LIMIT 500`,
    userId,
    userId,
    userId,
    ...hidden,
    ...preferred,
    userId,
    userId,
  );
  const excluded = userId
    ? await db.all<Book>(
        `
    SELECT b.* FROM books b WHERE EXISTS(SELECT 1 FROM reading r WHERE r.user_id=? AND r.book_id=b.id)
      OR EXISTS(SELECT 1 FROM recommendation_feedback h WHERE h.user_id=? AND h.book_id=b.id)`,
        userId,
        userId,
      )
    : [];
  const seen = new Set(excluded.map(workKey)),
    authorCounts = new Map<string, number>(),
    genreCounts = new Map<string, number>();
  const metadataRows = await db.all<{ book_id: string; details: string }>(
    "SELECT book_id,details FROM book_metadata",
  );
  const metadata = new Map(
    metadataRows.map((r) => [r.book_id, JSON.parse(r.details) as BookMetadata]),
  );
  const hasTaste =
    preferred.size > 0 ||
    !!(
      userId &&
      (await db.get(
        "SELECT book_id FROM reading WHERE user_id=? AND (rating>=4 OR status IN ('Want to read','Currently reading')) LIMIT 1",
        userId,
      ))
    );
  const remaining = candidates.filter((b) => {
    if (
      seen.has(workKey(b)) ||
      b.authorAffinity < 0 ||
      !recommendationQuality(b, metadata.get(b.id) || null)
    )
      return false;
    const relevant =
      preferred.has(b.genre) ||
      b.genreAffinity > 0 ||
      b.authorAffinity > 0 ||
      b.circle > 0 ||
      b.community > 0;
    return relevant || (!hasTaste && b.id.startsWith("seed-"));
  });
  const result: Recommendation[] = [];
  while (remaining.length && result.length < 24) {
    // A small diversity penalty preserves strong matches while letting other genres surface.
    remaining.sort(
      (a, b) =>
        b.score -
          (genreCounts.get(b.genre) || 0) * 0.5 -
          (a.score - (genreCounts.get(a.genre) || 0) * 0.5) ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id),
    );
    const candidate = remaining.shift()!;
    const { score, genreAffinity, authorAffinity, circle, community, ...book } =
      candidate;
    const author = identity(book.author),
      key = workKey(book);
    if (
      seen.has(key) ||
      (author !== "unknown author" && (authorCounts.get(author) || 0) >= 2)
    )
      continue;
    seen.add(key);
    authorCounts.set(author, (authorCounts.get(author) || 0) + 1);
    genreCounts.set(book.genre, (genreCounts.get(book.genre) || 0) + 1);
    const reason =
      circle > 0
        ? `Rated highly by ${circle === 1 ? "a reader you follow" : "readers you follow"}`
        : preferred.has(book.genre)
          ? `Because you chose ${book.genre.toLowerCase()}`
          : authorAffinity > 0
            ? `More from ${book.author}`
            : genreAffinity > 0
              ? `Inspired by your interest in ${book.genre.toLowerCase()}`
              : community > 0
                ? "Rated highly in public community reviews"
                : "From the Shelves starter collection";
    result.push({ ...book, reason });
  }
  return result;
}
