import { LanguageSelect } from "./LanguageSelect";
import { useEffect, useState } from "react";
import type { Book } from "../shared/types";
import { api } from "./api";
import { BookCard, ErrorMessage, Form } from "./components";
type Result = {
  items: Book[];
  total: number;
  page: number;
  pages: number;
  genres: string[];
};
export function Catalog({
  onBook,
  author,
}: {
  onBook: (book: Book) => void;
  author?: string;
}) {
  const [params, setParams] = useState(() => location.hash.split("?")[1] || ""),
    [result, setResult] = useState<Result | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const update = () => setParams(location.hash.split("?")[1] || "");
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const filters = new URLSearchParams(params);
    if (author) filters.set("author", author);
    api<Result>(`/books/catalog?${filters}`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    })
      .then((data) => {
        if (!controller.signal.aborted) setResult(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [params, retry, author]);
  const query = new URLSearchParams(params);
  function go(page: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(page));
    location.hash = `${author ? "author" : "catalog"}?${next}`;
  }
  return (
    <section
      className={`view-panel catalog-page ${author ? "author-catalog" : ""}`}
    >
      {author ? (
        <div className="collection-heading">
          <h2>Books and editions</h2>
          <a className="plain-link" href="#discover">
            Discover more ↗
          </a>
        </div>
      ) : (
        <>
          <span className="section-kicker">FOLLOW YOUR CURIOSITY</span>
          <h2>
            {author ? "Books and editions" : "Explore the book catalogue."}
          </h2>
          <p>
            Browse books already in Shelves. For books beyond this collection,
            use the live title or author search in Discover.
          </p>
          <a className="plain-link" href="#discover">
            Back to Discover
          </a>
        </>
      )}
      <details className="catalog-filters" open={author ? undefined : true}>
        <summary>
          Filters & sort
          {["q", "genre", "language", "from", "to", "sort"].filter((key) =>
            query.get(key),
          ).length
            ? " · Active"
            : ""}
        </summary>
        <Form
          key={params}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const from = String(data.get("from") || ""),
              to = String(data.get("to") || "");
            if (from && to && Number(from) > Number(to)) {
              setError("Start year must not be after end year.");
              return;
            }
            const next = new URLSearchParams();
            if (author) next.set("name", author);
            for (const [key, value] of data.entries())
              if (String(value).trim()) next.set(key, String(value).trim());
            const serialized = next.toString();
            if (serialized === params) setRetry(retry + 1);
            else
              location.hash = `${author ? "author" : "catalog"}?${serialized}`;
          }}
        >
          <div className="library-tools">
            <label>
              Catalogue title or author
              <input
                name="q"
                type="search"
                maxLength={120}
                defaultValue={query.get("q") || ""}
              />
            </label>
            <label>
              Catalogue genre
              <select
                name="genre"
                aria-label="Catalogue genre"
                defaultValue={query.get("genre") || ""}
              >
                <option value="">All genres</option>
                {[
                  ...new Set([
                    ...(result?.genres || []),
                    ...(query.get("genre") ? [query.get("genre")!] : []),
                  ]),
                ].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            <LanguageSelect
              value={query.get("language") || ""}
              label="Catalogue language"
            />
            <label>
              Published from
              <input
                name="from"
                type="number"
                min={0}
                max={3000}
                step={1}
                defaultValue={query.get("from") || ""}
              />
            </label>
            <label>
              Published through
              <input
                name="to"
                type="number"
                min={0}
                max={3000}
                step={1}
                defaultValue={query.get("to") || ""}
              />
            </label>
            <label>
              Catalogue sort
              <select
                name="sort"
                aria-label="Catalogue sort"
                defaultValue={query.get("sort") || "title"}
              >
                <option value="title">Title A–Z</option>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
          </div>
          <div className="account-actions">
            <button className="primary-btn" disabled={loading}>
              Apply filters
            </button>
            <button
              type="button"
              className="plain-link"
              disabled={loading}
              onClick={(e) => {
                e.currentTarget.form?.reset();
                location.hash = author
                  ? `author?name=${encodeURIComponent(author)}`
                  : "catalog";
                if (!params) setRetry(retry + 1);
              }}
            >
              Clear filters
            </button>
          </div>
        </Form>
      </details>
      <ErrorMessage message={error} />
      {error ? (
        <button className="outline-btn" onClick={() => setRetry(retry + 1)}>
          Try again
        </button>
      ) : null}
      {loading ? (
        <p role="status">Finding books…</p>
      ) : !error && result ? (
        <>
          <p className="search-source" role="status">
            {result.total} {result.total === 1 ? "book" : "books"} · Page{" "}
            {result.page} of {result.pages}
          </p>
          {result.items.length ? (
            <div className={`book-grid ${author ? "collection-books" : ""}`}>
              {result.items.map((book) => (
                <BookCard key={book.id} book={book} onOpen={onBook} />
              ))}
            </div>
          ) : (
            <p className="empty-state">
              No books match these filters. Try another genre or a wider year
              range.
            </p>
          )}
          <nav className="account-actions" aria-label="Catalogue pages">
            <button
              className="outline-btn"
              disabled={result.page <= 1}
              onClick={() => go(result.page - 1)}
            >
              Previous page
            </button>
            <button
              className="outline-btn"
              disabled={result.page >= result.pages}
              onClick={() => go(result.page + 1)}
            >
              Next page
            </button>
          </nav>
        </>
      ) : null}
    </section>
  );
}
