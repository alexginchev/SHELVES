import {
  leisureNovel,
  normalizedText,
  recommendationQuality,
} from "./book-quality.ts";
import type { BookMetadata } from "../shared/book-metadata.ts";
import { hiddenReaders } from "./social-safety.ts";
import type { Store } from "./store.ts";
import type { Book, Recommendation } from "../shared/types.ts";
import { workIdentity, seriesPosition } from "../shared/book-identity.ts";

type Candidate = Book & {
  score: number;
  genreAffinity: number;
  authorAffinity: number;
  circle: number;
  community: number;
  peers: number;
};
const identity = (text: string) =>
  text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const workKey = workIdentity;
// Stable for one day and one reader: reloading does not shuffle the shelf,
// while equally scored books do not occupy the same slots forever.
function dailyOrder(book: Book, userId: string, day: number) {
  const value = `${userId}:${day}:${book.id}`;
  let hash = 2166136261;
  for (const character of value)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}
const otherReadingGenres = new Set([
  "Nature",
  "Poetry",
  "History",
  "Nonfiction",
]);
const starterReasons: Record<string, string> = {
  "seed-garden": "A hidden place, a new friendship, a classic to rediscover",
  "seed-creatures": "Warm coastal fiction with an unforgettable octopus",
  "seed-overstory": "An interwoven literary story about lives shaped by trees",
  "seed-smallthings": "A quietly powerful story about one difficult choice",
  "seed-piranesi": "A mysterious house and a world worth getting lost in",
};
const commonWords = new Set(
  "about after again against along among around author became before behind being between books chapter character collection comes could every first from great have into itself lives many novel other people readers reading story stories their there these those through under where which while world young".split(
    " ",
  ),
);
function themes(book: Book) {
  return new Set(
    normalizedText(book.description)
      .split(" ")
      .filter((word) => word.length >= 5 && !commonWords.has(word)),
  );
}

export async function recommendations(
  db: Store,
  userId = "",
  language = "",
): Promise<Recommendation[]> {
  const hidden = await hiddenReaders(db, userId);
  const preference = userId
    ? await db.get<{ genres: string; book_ids: string }>(
        "SELECT genres,book_ids FROM reading_preferences WHERE user_id=?",
        userId,
      )
    : undefined;
  const favoriteIds: string[] = preference
    ? JSON.parse(preference.book_ids)
    : [];
  const favorites = favoriteIds.length
    ? await db.all<Book>(
        `SELECT * FROM books WHERE id IN (${favoriteIds.map(() => "?").join(",")})`,
        ...favoriteIds,
      )
    : [];
  const feedback = userId
    ? await db.all<Book & { signal: "more" | "less" }>(
        `SELECT b.*,t.signal FROM recommendation_taste_feedback t
         JOIN books b ON b.id=t.book_id WHERE t.user_id=? ORDER BY b.id LIMIT 30`,
        userId,
      )
    : [];
  const moreBooks = feedback.filter((book) => book.signal === "more");
  const lessBooks = feedback.filter((book) => book.signal === "less");
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
      UNION ALL
      SELECT b.genre,lower(b.author),4 AS weight FROM books b
      WHERE b.id IN (${favoriteIds.length ? favoriteIds.map(() => "?").join(",") : "NULL"})
      UNION ALL
      SELECT b.genre,lower(b.author),CASE WHEN t.signal='more' THEN 5 ELSE -4 END AS weight
      FROM recommendation_taste_feedback t JOIN books b ON b.id=t.book_id WHERE t.user_id=?
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
    ), my_public_likes AS (
      SELECT DISTINCT lower(trim(b.title)) AS title,lower(trim(b.author)) AS author
      FROM posts p JOIN books b ON b.id=p.book_id
      WHERE p.user_id=? AND p.kind='review' AND p.rating>=4
        AND lower(trim(b.author))<>'' AND lower(trim(b.author))<>'unknown author'
    ), similar_readers AS (
      SELECT p.user_id,count(DISTINCT p.book_id) AS shared
      FROM posts p JOIN books b ON b.id=p.book_id
      JOIN my_public_likes mine ON mine.title=lower(trim(b.title)) AND mine.author=lower(trim(b.author))
      WHERE p.kind='review' AND p.rating>=4 AND p.user_id<>?
        ${hidden.length ? `AND p.user_id NOT IN (${hidden.map(() => "?").join(",")})` : ""}
      GROUP BY p.user_id ORDER BY shared DESC,p.user_id LIMIT 50
    ), peer_picks AS (
      SELECT p.book_id,count(DISTINCT p.user_id) AS peers,
        SUM(CASE WHEN s.shared>=2 THEN 2 ELSE 1 END) AS affinity
      FROM posts p JOIN similar_readers s ON s.user_id=p.user_id
      WHERE p.kind='review' AND p.rating>=4 GROUP BY p.book_id
    )
    SELECT b.*,COALESCE(g.affinity,0) AS "genreAffinity",COALESCE(a.affinity,0) AS "authorAffinity",
      COALESCE(v.circle,0) AS circle,COALESCE(v.community,0) AS community,
      COALESCE(peer.peers,0) AS peers,
      COALESCE(g.affinity,0)+COALESCE(a.affinity,0)+${preferenceScore}+
      CASE WHEN COALESCE(v.circle,0)>2 THEN 4 ELSE COALESCE(v.circle,0)*2 END+
      COALESCE(v.community,0)+CASE WHEN COALESCE(peer.affinity,0)>=3 THEN 7.5 ELSE COALESCE(peer.affinity,0)*2.5 END AS score
    FROM books b LEFT JOIN genres g ON g.genre=b.genre
    LEFT JOIN authors a ON a.author=lower(b.author) AND lower(b.author)<>'unknown author'
    LEFT JOIN reviews v ON v.book_id=b.id
    LEFT JOIN peer_picks peer ON peer.book_id=b.id
    WHERE NOT EXISTS(SELECT 1 FROM reading r WHERE r.user_id=? AND r.book_id=b.id)
      AND NOT EXISTS(SELECT 1 FROM recommendation_feedback h WHERE h.user_id=? AND h.book_id=b.id)
      AND NOT EXISTS(SELECT 1 FROM posts own WHERE own.user_id=? AND own.kind='review' AND own.book_id=b.id)
    ORDER BY score DESC,CASE WHEN b.id LIKE 'seed-%' THEN 0 ELSE 1 END,lower(b.title),b.id LIMIT 500`,
    userId,
    ...favoriteIds,
    userId,
    userId,
    userId,
    ...hidden,
    userId,
    userId,
    ...hidden,
    ...preferred,
    userId,
    userId,
    userId,
  );
  const excluded = userId
    ? await db.all<Book>(
        `
    SELECT b.* FROM books b WHERE EXISTS(SELECT 1 FROM reading r WHERE r.user_id=? AND r.book_id=b.id)
      OR EXISTS(SELECT 1 FROM recommendation_feedback h WHERE h.user_id=? AND h.book_id=b.id)
      OR EXISTS(SELECT 1 FROM posts p WHERE p.user_id=? AND p.kind='review' AND p.book_id=b.id)`,
        userId,
        userId,
        userId,
      )
    : [];
  const seen = new Set([...excluded, ...favorites].map(workKey)),
    authorCounts = new Map<string, number>(),
    genreCounts = new Map<string, number>();
  const completedSeries = new Map<string, number>();
  const readerHistory = userId
    ? await db.all<Book & { status: string }>(
        "SELECT b.*,r.status FROM reading r JOIN books b ON b.id=r.book_id WHERE r.user_id=?",
        userId,
      )
    : [];
  for (const book of readerHistory) {
    const series = seriesPosition(book);
    if (series && series.position > 0 && book.status === "Finished")
      completedSeries.set(
        series.series,
        Math.max(completedSeries.get(series.series) || 0, series.position),
      );
  }
  const seriesReady = (book: Book) => {
    const series = seriesPosition(book);
    return (
      !series ||
      (series.position > 0 &&
        series.position <= (completedSeries.get(series.series) || 0) + 1)
    );
  };
  const metadataRows = await db.all<{ book_id: string; details: string }>(
    "SELECT book_id,details FROM book_metadata",
  );
  const metadata = new Map(
    metadataRows.map((r) => [r.book_id, JSON.parse(r.details) as BookMetadata]),
  );
  const liked = userId
    ? await db.all<Book>(
        `SELECT b.* FROM books b WHERE EXISTS
          (SELECT 1 FROM reading r WHERE r.user_id=? AND r.book_id=b.id AND r.rating>=4)
          OR EXISTS (SELECT 1 FROM posts p WHERE p.user_id=? AND p.book_id=b.id AND p.kind='review' AND p.rating>=4)
          ORDER BY b.id LIMIT 20`,
        userId,
        userId,
      )
    : [];
  const anchors = [
    ...new Map(
      [...favorites, ...liked, ...moreBooks].map((book) => [book.id, book]),
    ).values(),
  ].slice(0, 20);
  const anchorThemes = anchors.map((book) => ({ book, words: themes(book) }));
  const themeMatch = new Map<string, { book: Book; strength: number }>();
  const lessThemes = lessBooks.map((book) => themes(book));
  const negativeTheme = new Map<string, number>();
  for (const candidate of candidates) {
    const words = themes(candidate);
    const negativeOverlap = Math.max(
      0,
      ...lessThemes.map(
        (avoid) => [...words].filter((word) => avoid.has(word)).length,
      ),
    );
    if (negativeOverlap >= 2)
      negativeTheme.set(candidate.id, Math.min(9, negativeOverlap * 2.5));
    let strongest: { book: Book; strength: number } | undefined;
    for (const anchor of anchorThemes) {
      if (workKey(anchor.book) === workKey(candidate)) continue;
      const shared = [...words].filter((word) => anchor.words.has(word));
      // A single shared word is too weak to justify a personal match.
      if (shared.length < 2) continue;
      // A concrete story connection should outweigh a broad genre match.
      const strength = Math.min(9, shared.length * 2.5);
      if (!strongest || strength > strongest.strength)
        strongest = { book: anchor.book, strength };
    }
    if (strongest) themeMatch.set(candidate.id, strongest);
  }
  const wantsOtherReading = (book: Book) =>
    otherReadingGenres.has(book.genre) &&
    (preferred.has(book.genre) ||
      favorites.some((favorite) => favorite.genre === book.genre));
  const pleasantFit = (book: Book) =>
    leisureNovel(book, metadata.get(book.id) || null) ||
    (wantsOtherReading(book) &&
      recommendationQuality(book, metadata.get(book.id) || null));
  const matchesLanguage = (book: Book) =>
    !language ||
    (metadata.get(book.id)?.language ||
      (book.id.startsWith("seed-") ? "en" : "")) === language;
  const relevantCandidates = candidates.filter((b) => {
    if (
      seen.has(workKey(b)) ||
      b.authorAffinity < 0 ||
      !pleasantFit(b) ||
      !seriesReady(b) ||
      !matchesLanguage(b)
    )
      return false;
    const relevant =
      preferred.has(b.genre) ||
      b.genreAffinity > 0 ||
      b.authorAffinity > 0 ||
      b.circle > 0 ||
      b.community > 0 ||
      b.peers > 0 ||
      themeMatch.has(b.id);
    return relevant;
  });
  // A cold start can use complete, covered novels imported from Google Books.
  // Keep local unverified imports out of this pool; the starter books remain safe defaults.
  const remaining = relevantCandidates.length
    ? relevantCandidates
    : candidates.filter(
        (book) =>
          (book.id.startsWith("seed-") ||
            (book.id.startsWith("gb_") && !!book.cover)) &&
          !seen.has(workKey(book)) &&
          pleasantFit(book) &&
          seriesReady(book) &&
          matchesLanguage(book),
      );
  const result: Recommendation[] = [];
  const day = Math.floor(Date.now() / 86400000);
  while (remaining.length && result.length < 24) {
    // A small diversity penalty preserves strong matches while letting other genres surface.
    remaining.sort(
      (a, b) =>
        b.score +
          (themeMatch.get(b.id)?.strength || 0) -
          (negativeTheme.get(b.id) || 0) -
          (genreCounts.get(b.genre) || 0) * 0.5 -
          (a.score +
            (themeMatch.get(a.id)?.strength || 0) -
            (negativeTheme.get(a.id) || 0) -
            (genreCounts.get(a.genre) || 0) * 0.5) ||
        dailyOrder(a, userId, day) - dailyOrder(b, userId, day) ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id),
    );
    const candidate = remaining.shift()!;
    const {
      score,
      genreAffinity,
      authorAffinity,
      circle,
      community,
      peers,
      ...book
    } = candidate;
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
    const favoriteAuthor = favorites.find(
      (picked) =>
        identity(picked.author) === author && author !== "unknown author",
    );
    const favoriteGenre = favorites.find(
      (picked) => picked.genre === book.genre,
    );
    const thematic = themeMatch.get(book.id);
    const explicitMore = moreBooks.find(
      (picked) =>
        picked.genre === book.genre ||
        identity(picked.author) === author ||
        thematic?.book.id === picked.id,
    );
    const reason =
      circle > 0
        ? `Rated highly by ${circle === 1 ? "a reader you follow" : "readers you follow"}`
        : peers > 0
          ? `Loved by ${peers === 1 ? "a reader" : "readers"} with your taste`
          : favoriteAuthor
            ? `Because you loved ${favoriteAuthor.title}`
            : explicitMore
              ? `More like ${explicitMore.title}`
              : thematic
                ? `A story to try after ${thematic.book.title}`
                : favoriteGenre
                  ? `In the world of ${favoriteGenre.genre.toLowerCase()} you love`
                  : preferred.has(book.genre)
                    ? `Because you chose ${book.genre.toLowerCase()}`
                    : authorAffinity > 0
                      ? `More from ${book.author}`
                      : genreAffinity > 0
                        ? `Inspired by your interest in ${book.genre.toLowerCase()}`
                        : community > 0
                          ? "Rated highly in public community reviews"
                          : starterReasons[book.id] ||
                            `A ${book.genre.toLowerCase()} story to explore`;
    result.push({ ...book, reason });
  }
  return result;
}
