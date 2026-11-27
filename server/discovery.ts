import { leisureNovel, normalizedText } from "./book-quality.ts";
import { bookMetadata, searchGoogleBooks } from "./google-books.ts";
import type { Store } from "./store.ts";
import type { Book } from "../shared/types.ts";

// Ordinary search stays lightweight. Discovery needs these extra facts to
// avoid presenting guides, reference works, or poorly described editions.
export const DISCOVERY_FIELDS =
  "items(id,volumeInfo(title,authors,description,imageLinks/thumbnail,categories,pageCount,publisher,publishedDate,language,industryIdentifiers))";

const subjects: Record<string, string> = {
  Fantasy: "Fantasy",
  Romance: "Romance",
  Mystery: "Mystery",
  "Science fiction": "Science Fiction",
  Classic: "Fiction",
  Literary: "Fiction",
  Fiction: "Fiction",
};

export async function discoverNovels(
  db: Store,
  genre: string,
  startIndex: number,
  language = "en",
) {
  const subject = subjects[genre] || "Fiction";
  const result = await searchGoogleBooks(db, `subject:${subject}`, language, {
    startIndex,
    fields: DISCOVERY_FIELDS,
  });
  const seen = new Set<string>();
  const items: Book[] = [];
  for (const book of result.items) {
    const metadata = await bookMetadata(db, book.id);
    const work = `${normalizedText(book.title)}\0${normalizedText(book.author)}`;
    if (!leisureNovel(book, metadata, true) || seen.has(work)) continue;
    seen.add(work);
    items.push(book);
  }
  return {
    items,
    hasMore: result.items.length === 10,
    source: result.source,
    warning: result.warning,
  };
}
