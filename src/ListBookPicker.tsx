import { useRef, useState, useEffect } from "react";
import type { Book } from "../shared/types";
import { ErrorMessage } from "./components";
import { PageNavigation, useNumberedPage } from "./NumberedPages";

export function ListBookPicker({
  books,
  onAdd,
}: {
  books: Book[];
  onAdd: (book: Book) => void;
}) {
  const [query, setQuery] = useState(""),
    [committed, setCommitted] = useState("");
  const [page, setPage] = useState(1),
    [composing, setComposing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (composing) return;
    const timer = setTimeout(
      () => {
        setCommitted(query);
        setPage(1);
      },
      query ? 300 : 0,
    );
    return () => clearTimeout(timer);
  }, [query, composing]);
  const result = useNumberedPage<Book>(
    `/books/catalog?q=${encodeURIComponent(committed)}&page=${page}`,
  );
  const waiting = query !== committed || composing || result.busy;
  return (
    <>
      <label>
        Find a book in the catalogue
        <input
          ref={input}
          type="search"
          value={query}
          maxLength={120}
          onChange={(e) => setQuery(e.target.value)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (!e.nativeEvent.isComposing) {
                setCommitted(query);
                setPage(1);
              }
            }
          }}
        />
      </label>
      {query && (
        <button
          type="button"
          className="plain-link"
          onClick={() => {
            setQuery("");
            setCommitted("");
            setPage(1);
            input.current?.focus();
          }}
        >
          Clear book search
        </button>
      )}
      <ErrorMessage message={result.error} />
      {result.error && (
        <button type="button" className="outline-btn" onClick={result.retry}>
          Try again
        </button>
      )}
      {waiting ? (
        <p role="status">Finding books…</p>
      ) : (
        <div className="list-picker">
          {result.data?.items.map((book) => {
            const selected = books.some((b) => b.id === book.id);
            return (
              <div key={book.id}>
                <span>
                  {book.title}
                  <small>{book.author}</small>
                </span>
                <button
                  type="button"
                  className="outline-btn"
                  disabled={selected || books.length >= 50}
                  aria-label={`${selected ? "Added" : "Add"} ${book.title}`}
                  onClick={() => onAdd(book)}
                >
                  {selected ? "Added" : "Add"}
                </button>
              </div>
            );
          })}
          {result.data?.total === 0 && (
            <p>
              No matching books. Search by another title or author, or find new
              books in Discover.
            </p>
          )}
        </div>
      )}
      {result.data && (
        <PageNavigation {...result.data} busy={waiting} onPage={setPage} />
      )}
    </>
  );
}
