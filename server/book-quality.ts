import type { Book } from "../shared/types.ts";
import type { BookMetadata } from "../shared/book-metadata.ts";
import { readingGenres } from "../shared/genres.ts";
export const normalizedText = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
// These are catalog artefacts or derivative products, not a judgement of literary merit.
const derivativeKinds = [
  /\b(?:study guide|summary of|summaries of|analysis of|conversations on)\b/i,
  /\bcolou?ring book\b/i,
  /\b(?:companion|reading guide)\b/i,
  /\b(?:workbook|blank journal|blank notebook)\b/i,
  /\b(?:conference proceedings|doctoral thesis|dissertation|technical report|working paper)\b/i,
];
const derivative = {
  test: (title: string) =>
    derivativeKinds.some((pattern) => pattern.test(title)),
};
function searchPenalty(title: string, query: string) {
  const derivativePenalty = derivativeKinds.some(
    (pattern) => pattern.test(title) && !pattern.test(query),
  )
    ? 80
    : 0;
  const collection = /\b(?:box(?:ed)? set|bundle|collection)\b/i;
  return (
    derivativePenalty +
    (collection.test(title) && !collection.test(query) ? 12 : 0)
  );
}
export function recommendationQuality(
  book: Book,
  metadata: BookMetadata | null,
): boolean {
  if (derivative.test(book.title)) return false;
  if (!book.author.trim() || normalizedText(book.author) === "unknown author")
    return false;
  if (book.id.startsWith("seed-")) return true;
  const description = book.description.trim();
  if (
    description.length < 40 ||
    /^No description supplied|^Imported from /i.test(description)
  )
    return false;
  if (!book.id.startsWith("gb_")) return !!(book.pages && book.pages >= 40);
  if (
    !metadata ||
    !readingGenres.includes(book.genre as (typeof readingGenres)[number])
  )
    return false;
  const isbn = metadata.identifiers.some((i) => /^ISBN_(10|13)$/.test(i.type));
  return isbn || !!(metadata.publisher && book.pages && book.pages >= 40);
}
export function searchRelevance(book: Book, query: string): number {
  const q = normalizedText(
    query.replace(/\b(?:intitle|inauthor|subject|isbn):/gi, ""),
  );
  const title = normalizedText(book.title),
    author = normalizedText(book.author);
  const words = q.split(" ").filter(Boolean);
  if (!words.length) return 0;
  const titleWords = new Set(title.split(" ")),
    authorWords = new Set(author.split(" "));
  return (
    (title === q ? 100 : 0) +
    (title.startsWith(q) ? 30 : 0) +
    (author === q ? 60 : 0) +
    (words.filter((w) => titleWords.has(w)).length / words.length) * 20 +
    (words.filter((w) => authorWords.has(w)).length / words.length) * 10 -
    searchPenalty(book.title, query)
  );
}
export function rankSearch<T extends Book>(books: T[], query: string): T[] {
  return books
    .map((book, index) => ({
      book,
      index,
      score: searchRelevance(book, query),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.book);
}
