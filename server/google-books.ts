import { languageExpression, languageSchema } from "./book-language.ts";
import { rankSearch, normalizedText } from "./book-quality.ts";
import { z } from "zod";
import type { Store } from "./store.ts";
import type { Book } from "../shared/types.ts";
import type { BookMetadata } from "../shared/book-metadata.ts";
import { readingGenres } from "../shared/genres.ts";
import { ApiError } from "./services.ts";

const strings = z.array(z.string()).optional();
const volumeSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,70}$/),
  saleInfo: z.object({ isEbook: z.boolean().optional() }).optional(),
  volumeInfo: z.object({
    title: z.string().trim().min(1),
    authors: strings,
    categories: strings,
    description: z.string().optional(),
    publisher: z.string().optional(),
    publishedDate: z.string().optional(),
    language: z.string().optional(),
    printType: z.string().optional(),
    pageCount: z.number().int().nonnegative().max(50000).optional(),
    imageLinks: z
      .object({
        thumbnail: z.string().optional(),
        smallThumbnail: z.string().optional(),
      })
      .optional(),
    industryIdentifiers: z
      .array(z.object({ type: z.string(), identifier: z.string() }))
      .optional(),
  }),
});
type Imported = { book: Book; metadata: BookMetadata };
// A volumes.list response wraps the requested book fields in items[].
export const GOOGLE_BOOK_FIELDS =
  "items(id,volumeInfo(title,authors,description,imageLinks/thumbnail))";
export type GoogleSearchOptions = {
  startIndex?: number;
  fields?: string | null;
};
export function googleBooksSearchUrl(
  query: string,
  language = "",
  options: GoogleSearchOptions = {},
) {
  const startIndex = z
    .number()
    .int()
    .min(0)
    .max(10000)
    .parse(options.startIndex ?? 0);
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", "10");
  url.searchParams.set("startIndex", String(startIndex));
  url.searchParams.set("printType", "books");
  url.searchParams.set("orderBy", "relevance");
  if (language)
    url.searchParams.set("langRestrict", languageSchema.parse(language));
  const fields =
    options.fields === undefined ? GOOGLE_BOOK_FIELDS : options.fields;
  if (fields?.trim()) url.searchParams.set("fields", fields.trim());
  else url.searchParams.set("projection", "lite");
  return url;
}
const searchResponse = z
  .object({
    totalItems: z.number().nonnegative().optional(),
    items: z.array(z.unknown()).optional(),
  })
  .transform((result) => ({
    ...result,
    totalItems: result.totalItems ?? result.items?.length ?? 0,
  }));
function plainText(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp);/g,
      (e) =>
        ({
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&apos;": "'",
          "&nbsp;": " ",
        })[e]!,
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}
export function normalizeGoogleVolume(value: unknown): Imported | null {
  const parsed = volumeSchema.safeParse(value);
  if (!parsed.success) return null;
  const { id, volumeInfo: v } = parsed.data;
  if (v.printType && v.printType !== "BOOK") return null;
  const authors = [
    ...new Set(
      (v.authors || [])
        .slice(0, 20)
        .map((a) => a.trim().slice(0, 300))
        .filter(Boolean),
    ),
  ];
  const tags = [
    ...new Set(
      (v.categories || [])
        .slice(0, 30)
        .map((t) => t.trim().slice(0, 200))
        .filter(Boolean),
    ),
  ];
  const genre =
    readingGenres
      .filter((g) => g !== "Fiction")
      .find((g) =>
        tags.some((t) => t.toLowerCase().includes(g.toLowerCase())),
      ) ||
    (tags.some((t) => /fiction/i.test(t))
      ? "Fiction"
      : tags[0]?.split(" / ")[0].slice(0, 80)) ||
    "Uncategorized";
  let cover: string | null = null;
  try {
    const image = new URL(
      v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || "",
    );
    if (
      ["books.google.com", "books.googleusercontent.com"].includes(
        image.hostname,
      ) &&
      ["http:", "https:"].includes(image.protocol) &&
      !image.username &&
      !image.password
    ) {
      image.protocol = "https:";
      image.searchParams.delete("key");
      cover = image.href;
    }
  } catch {
    /* Missing or invalid covers use the existing cover placeholder. */
  }
  const date = v.publishedDate?.slice(0, 30) || null;
  return {
    book: {
      id: `gb_${id}`,
      title: v.title.slice(0, 300),
      author: authors.join(", ").slice(0, 300) || "Unknown author",
      genre,
      pages: v.pageCount || null,
      description:
        plainText(v.description || "") ||
        "No description supplied for this edition.",
      cover,
      color: "sage",
      year:
        date && /^\d{4}(?:-|$)/.test(date) ? Number(date.slice(0, 4)) : null,
    },
    metadata: {
      format: parsed.data.saleInfo?.isEbook === true ? "ebook" : null,
      authors,
      tags,
      publisher: v.publisher?.slice(0, 300) || null,
      publishedDate: date,
      language: v.language?.trim().toLowerCase().slice(0, 30) || null,
      identifiers: (v.industryIdentifiers || []).slice(0, 10).map((i) => ({
        type: i.type.slice(0, 30),
        identifier: i.identifier.slice(0, 100),
      })),
      providerId: id,
    },
  };
}
// Retry only transient failures, within a bounded total search budget.
async function fetchVolumes(
  url: URL,
  key: string,
  deadline = Date.now() + 10000,
  attempts = 3,
): Promise<Response> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(3000, deadline - Date.now())),
        ),
        // Node fetch decompresses the gzip response before response.json().
        headers: {
          "X-Goog-Api-Key": key,
          "Accept-Encoding": "gzip",
          "User-Agent": "Shelves (gzip)",
        },
      });
      if (
        ![500, 502, 503, 504].includes(response.status) ||
        attempt === attempts - 1 ||
        Date.now() >= deadline
      )
        return response;
      await response.body?.cancel();
    } catch (error) {
      if (attempt === attempts - 1 || Date.now() >= deadline) {
        if (
          error instanceof Error &&
          ["TimeoutError", "AbortError"].includes(error.name)
        )
          throw new ApiError(
            504,
            "Google Books took too long to respond. Please try again.",
          );
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
  }
  throw new Error("Provider unavailable");
}
const pending = new WeakMap<
  Store,
  Map<
    string,
    Promise<{ items: Book[]; source: string; warning: string | null }>
  >
>();
export function searchGoogleBooks(
  db: Store,
  query: string,
  language = "",
  options: GoogleSearchOptions = {},
) {
  language = languageSchema.parse(language);
  query = query.trim().replace(/\s+/g, " ");
  if (query.toLowerCase() === "acotar") query = "A Court of Thorns and Roses";
  const requestUrl = googleBooksSearchUrl(query, language, options);
  const startIndex = Number(requestUrl.searchParams.get("startIndex"));
  const cacheKey = JSON.stringify([
    "books-v4",
    query,
    language,
    startIndex,
    requestUrl.searchParams.get("fields"),
  ]);
  let requests = pending.get(db);
  if (!requests) {
    requests = new Map();
    pending.set(db, requests);
  }
  const existing = requests.get(cacheKey);
  if (existing) return existing;
  const request = runSearch(db, query, language, cacheKey, requestUrl).finally(
    () => requests!.delete(cacheKey),
  );
  requests.set(cacheKey, request);
  return request;
}
async function runSearch(
  db: Store,
  query: string,
  language: string,
  cacheKey: string,
  requestUrl: URL,
) {
  const key = process.env.GOOGLE_BOOKS_API_KEY?.trim();
  const startIndex = Number(requestUrl.searchParams.get("startIndex"));
  let row = await db.get<{ items: string; fetchedAt: number | string }>(
    'SELECT items,fetched_at AS "fetchedAt" FROM book_search_cache WHERE query=?',
    cacheKey,
  );
  // Preserve previously cached unfiltered searches across the language-aware cache upgrade.
  if (!row && !language && startIndex === 0)
    row = await db.get<{ items: string; fetchedAt: number | string }>(
      'SELECT items,fetched_at AS "fetchedAt" FROM book_search_cache WHERE query=?',
      query,
    );
  let cached: { at: number; items: Imported[] } | undefined;
  if (row)
    try {
      const stored = JSON.parse(row.items);
      if (!Array.isArray(stored)) throw new Error("Invalid cache");
      cached = { at: Number(row.fetchedAt), items: stored.slice(0, 10) };
      // Detail lookups may have enriched these editions since this search was cached.
      for (const item of cached.items) {
        item.book = {
          ...((await db.get<Book>(
            "SELECT * FROM books WHERE id=?",
            item.book.id,
          )) || item.book),
        };
      }
    } catch {
      cached = undefined;
      /* Ignore invalid cache and fetch again. */
    }
  let items: Imported[];
  try {
    if (cached && Date.now() - cached.at < 300000)
      return {
        items: rankSearch(
          cached.items.map((i) => i.book),
          query,
        ),
        source: "Google Books",
        warning: null,
      };
    else {
      if (!key)
        throw new ApiError(503, "Google Books search is not configured yet.");
      const url = requestUrl;
      const deadline = Date.now() + 10000;
      let response = await fetchVolumes(url, key, deadline);
      // Some Google index failures are specific to optional list parameters.
      if (
        [500, 502, 503, 504].includes(response.status) &&
        Date.now() < deadline
      ) {
        await response.body?.cancel();
        url.searchParams.delete("orderBy");
        url.searchParams.set("q", plainQuery(query));
        response = await fetchVolumes(url, key, deadline, 1);
      }
      if (!response.ok) {
        await response.body?.cancel();
        // Do not expose upstream error bodies: they may contain infrastructure details.
        if (response.status === 401 || response.status === 403)
          throw new ApiError(
            503,
            "Google Books access is blocked by the server’s API configuration. Please contact the Shelves administrator.",
          );
        if (response.status === 429)
          throw new ApiError(
            503,
            "Google Books has reached its request limit. Please try again later.",
          );
        throw new Error("Provider unavailable");
      }
      let result = searchResponse.parse(await response.json());
      const alternate = plainQuery(query);
      if (!result.totalItems && alternate !== query && Date.now() < deadline) {
        url.searchParams.set("q", alternate);
        url.searchParams.delete("orderBy");
        const retry = await fetchVolumes(url, key, deadline, 2);
        if (retry.status === 429)
          throw new ApiError(
            503,
            "Google Books has reached its request limit. Please try again later.",
          );
        if (!retry.ok) throw new Error("Provider unavailable");
        result = searchResponse.parse(await retry.json());
      }
      items = [
        ...new Map(
          (result.items || [])
            .slice(0, 10)
            .map(normalizeGoogleVolume)
            .filter((v): v is Imported => !!v)
            .map((v) => [v.book.id, v]),
        ).values(),
      ];
      if (result.items?.length && !items.length)
        throw new Error("Invalid volumes");
      // Lightweight search omits edition identity. Verify only when a filter
      // requires it; ordinary discovery stays a single small provider request.
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const needsIdentity =
          (language && !item.metadata.language) ||
          (queryFields(query).some((f) => f.field === "isbn") &&
            !item.metadata.identifiers.length);
        if (!needsIdentity) continue;
        const saved = await bookMetadata(db, item.book.id);
        if (saved)
          item.metadata = {
            ...item.metadata,
            language: saved.language,
            identifiers: saved.identifiers,
          };
        if (
          (!language || item.metadata.language) &&
          (!queryFields(query).some((f) => f.field === "isbn") ||
            item.metadata.identifiers.length)
        )
          continue;
        if (Date.now() >= deadline) throw new Error("Provider timeout");
        const detail = await fetchVolumes(
          new URL(
            `https://www.googleapis.com/books/v1/volumes/${item.metadata.providerId}`,
          ),
          key,
          deadline,
          1,
        );
        if (detail.status === 429)
          throw new ApiError(
            503,
            "Google Books has reached its request limit. Please try again later.",
          );
        if (!detail.ok) throw new Error("Provider unavailable");
        const enriched = normalizeGoogleVolume(await detail.json());
        if (enriched?.book.id === item.book.id) items[i] = enriched;
      }
      items = items.filter((i) => matchesFields(i, query));
      // Google's broad text matching can put unrelated titles beside an exact hit.
      // Narrow only when we actually have that title; keep general subject searches broad.
      const titleQuery = normalizedText(query.replace(/^"|"$/g, ""));
      if (
        !queryFields(query).length &&
        items.some((i) => normalizedText(i.book.title) === titleQuery)
      ) {
        const words = titleQuery
          .split(" ")
          .filter(
            (w) =>
              !["a", "an", "the", "of", "and", "in", "to", "for"].includes(w),
          );
        if (words.length >= 2)
          items = items.filter((i) => {
            const title = new Set(normalizedText(i.book.title).split(" "));
            return words.every((w) => title.has(w));
          });
      }
      if (language)
        items = items.filter((i) => i.metadata.language === language);
    }
  } catch (error) {
    if (cached?.items.length && Date.now() - cached.at < 86400000)
      return {
        items: rankSearch(
          cached.items.map((item) => item.book),
          query,
        ),
        source: "Saved Google Books results",
        warning:
          "Google Books is unavailable. Showing previous results for this search.",
      };
    const fields = queryFields(query);
    const terms = fields.length ? fields : [{ field: "text", value: query }];
    const conditions: string[] = [];
    const values: string[] = [];
    for (const term of terms) {
      const pattern = `%${term.value.toLowerCase().replace(/[!%_]/g, "!$&")}%`;
      if (term.field === "isbn") {
        // Identifier matching is checked below against parsed metadata.
        conditions.push(
          "EXISTS (SELECT 1 FROM book_metadata WHERE book_id=books.id AND details LIKE ? ESCAPE '!')",
        );
        values.push(pattern);
      } else if (term.field === "intitle" || term.field === "inauthor") {
        conditions.push(
          `lower(${term.field === "intitle" ? "title" : "author"}) LIKE ? ESCAPE '!'`,
        );
        values.push(pattern);
      } else {
        conditions.push(
          "(lower(title) LIKE ? ESCAPE '!' OR lower(author) LIKE ? ESCAPE '!')",
        );
        values.push(pattern, pattern);
      }
    }
    const candidates = await db.all<Book>(
      `SELECT * FROM books WHERE ${conditions.join(" AND ")} ${language ? "AND " + languageExpression(db) + "=?" : ""} ORDER BY title,id LIMIT 10 OFFSET ?`,
      ...values,
      ...(language ? [language] : []),
      startIndex,
    );
    const local: Book[] = [];
    for (const book of candidates) {
      const metadata = await bookMetadata(db, book.id);
      if (
        !fields.length ||
        matchesFields(
          { book, metadata: metadata || { identifiers: [] } },
          query,
        )
      )
        local.push(book);
    }
    if (local.length)
      return {
        items: rankSearch(local, query),
        source: "Saved catalog",
        warning:
          "Google Books is unavailable. Showing matching books already in Shelves.",
      };
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      503,
      "Google Books is temporarily unavailable. Please try again.",
    );
  }
  await db.transaction(async (tx) => {
    // Consistent lock order prevents overlapping search batches from deadlocking.
    const indices = items
      .map((_, index) => index)
      .sort((a, b) => items[a].book.id.localeCompare(items[b].book.id));
    for (const index of indices)
      items[index] = await saveVolume(tx, items[index]);
    await tx.run(
      "INSERT INTO book_search_cache VALUES (?,?,?) ON CONFLICT(query) DO UPDATE SET items=excluded.items,fetched_at=excluded.fetched_at",
      cacheKey,
      JSON.stringify(items),
      Date.now(),
    );
    await tx.run(
      "DELETE FROM book_search_cache WHERE fetched_at<?",
      Date.now() - 86400000,
    );
    await tx.run(
      "DELETE FROM book_search_cache WHERE query NOT IN (SELECT query FROM book_search_cache ORDER BY fetched_at DESC,query LIMIT 500)",
    );
  });
  return {
    items: rankSearch(
      items.map((i) => i.book),
      query,
    ),
    source: "Google Books",
    warning: null,
  };
}
export async function bookMetadata(
  db: Store,
  id: string,
): Promise<BookMetadata | null> {
  const row = await db.get<{ details: string }>(
    "SELECT details FROM book_metadata WHERE book_id=?",
    id,
  );
  return row ? JSON.parse(row.details) : null;
}

/** Cache-aside ISBN lookup using the existing PostgreSQL catalogue (SQLite in tests).
 * Persisted metadata wins even with no API key or an unavailable provider.
 * Search cache + in-flight coalescing also prevent repeated concurrent misses.
 */
export async function getBookByISBN(
  db: Store,
  input: string,
): Promise<Book | null> {
  const isbn = input.replace(/[\s-]/g, "").toUpperCase();
  if (!/^(?:\d{9}[\dX]|\d{13})$/.test(isbn))
    throw new ApiError(400, "Enter a valid 10- or 13-character ISBN.");
  const checksum = [...isbn].reduce(
    (sum, digit, index) =>
      sum +
      (digit === "X" ? 10 : Number(digit)) *
        (isbn.length === 10 ? 10 - index : index % 2 ? 3 : 1),
    0,
  );
  if (checksum % (isbn.length === 10 ? 11 : 10))
    throw new ApiError(400, "This ISBN has an invalid check digit.");
  const saved = await db.all<Book & { details: string }>(
    `SELECT b.*,m.details FROM books b JOIN book_metadata m ON m.book_id=b.id WHERE replace(replace(upper(m.details),'-',''),' ','') LIKE ? ORDER BY b.id`,
    `%${isbn}%`,
  );
  for (const { details, ...book } of saved) {
    try {
      if (
        matchesFields({ book, metadata: JSON.parse(details) }, `isbn:${isbn}`)
      )
        return book;
    } catch {
      /* A malformed metadata entry is a cache miss, not a failed lookup. */
    }
  }
  // runSearch persists verified book data and metadata atomically before returning.
  const result = await searchGoogleBooks(db, `isbn:${isbn}`);
  return result.items[0] || null;
}

function queryFields(query: string) {
  return [
    ...query.matchAll(/\b(intitle|inauthor|isbn):(?:"([^"]+)"|(\S+))/gi),
  ].map((m) => ({ field: m[1].toLowerCase(), value: (m[2] || m[3]).trim() }));
}
function plainQuery(query: string) {
  return query.replace(
    /\b(?:intitle|inauthor|isbn):(?:"([^"]+)"|(\S+))/gi,
    (_, quoted, word) => quoted || word,
  );
}
function matchesFields(
  item: { book: Book; metadata: Pick<BookMetadata, "identifiers"> },
  query: string,
) {
  const clean = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  return queryFields(query).every(({ field, value }) => {
    if (field === "isbn")
      return item.metadata.identifiers.some(
        (i) =>
          i.type.startsWith("ISBN") &&
          i.identifier.replace(/[- ]/g, "").toUpperCase() ===
            value.replace(/[- ]/g, "").toUpperCase(),
      );
    const actual = clean(
      field === "intitle" ? item.book.title : item.book.author,
    );
    return clean(value)
      .split(" ")
      .every((term) => actual.split(" ").includes(term));
  });
}
async function saveVolume(tx: Store, incoming: Imported): Promise<Imported> {
  // Serialize same-volume merges across PostgreSQL search/detail requests, including first insert.
  if (tx.kind === "postgres")
    await tx.get("SELECT pg_advisory_xact_lock(hashtext(?))", incoming.book.id);
  const previous = await tx.get<Book>(
    "SELECT * FROM books WHERE id=?",
    incoming.book.id,
  );
  const old = await bookMetadata(tx, incoming.book.id);
  const b = { ...incoming.book };
  const metadata = { ...incoming.metadata };
  if (previous) {
    if (b.author === "Unknown author") b.author = previous.author;
    if (b.genre === "Uncategorized") b.genre = previous.genre;
    if (b.description === "No description supplied for this edition.")
      b.description = previous.description;
    b.cover ||= previous.cover;
    b.pages ||= previous.pages;
    b.year ||= previous.year;
  }
  if (old) {
    for (const field of ["authors", "tags", "identifiers"] as const) {
      if (!metadata[field].length)
        Object.assign(metadata, { [field]: old[field] });
    }
    for (const field of [
      "publisher",
      "publishedDate",
      "language",
      "format",
    ] as const) {
      if (!metadata[field]) Object.assign(metadata, { [field]: old[field] });
    }
  }
  await tx.run(
    "INSERT INTO books VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,author=excluded.author,genre=excluded.genre,pages=excluded.pages,description=excluded.description,cover=excluded.cover,year=excluded.year",
    b.id,
    b.title,
    b.author,
    b.genre,
    b.pages,
    b.description,
    b.cover,
    b.color,
    b.year,
  );
  await tx.run(
    "INSERT INTO book_metadata VALUES (?,?) ON CONFLICT(book_id) DO UPDATE SET details=excluded.details",
    b.id,
    JSON.stringify(metadata),
  );
  await tx.run("DELETE FROM book_authors WHERE book_id=?", b.id);
  for (const name of metadata.authors)
    await tx.run("INSERT INTO book_authors VALUES (?,?)", b.id, name);

  return { book: b, metadata };
}
const detailRequests = new WeakMap<
  Store,
  Map<string, { at: number; request: Promise<void> }>
>();
export async function refreshGoogleBook(db: Store, id: string): Promise<void> {
  const key = process.env.GOOGLE_BOOKS_API_KEY?.trim();
  if (!key || !/^gb_[a-zA-Z0-9_-]{1,70}$/.test(id)) return;
  const book = await db.get<Book>("SELECT * FROM books WHERE id=?", id);
  if (!book) return;
  const metadata = await bookMetadata(db, id);
  if (
    book.cover &&
    book.pages &&
    book.year &&
    book.author !== "Unknown author" &&
    book.description !== "No description supplied for this edition." &&
    metadata?.tags.length &&
    metadata.publisher &&
    metadata.language
  )
    return;
  let entries = detailRequests.get(db);
  if (!entries) {
    entries = new Map();
    detailRequests.set(db, entries);
  }
  const existing = entries.get(id);
  if (existing && Date.now() - existing.at < 3600000) return existing.request;
  const request = (async () => {
    try {
      const url = new URL(
        `https://www.googleapis.com/books/v1/volumes/${id.slice(3)}`,
      );
      const response = await fetchVolumes(url, key, Date.now() + 3000, 1);
      if (!response.ok) {
        await response.body?.cancel();
        return;
      }
      const item = normalizeGoogleVolume(await response.json());
      if (!item || item.book.id !== id) return;
      await db.transaction((tx) => saveVolume(tx, item));
    } catch {
      /* A provider failure must not prevent opening a saved book. */
    }
  })();
  entries.set(id, { at: Date.now(), request });
  if (entries.size > 500) entries.delete(entries.keys().next().value!);
  return request;
}
