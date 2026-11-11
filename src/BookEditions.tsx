import { useEffect, useState, useRef } from "react";
import type { Book } from "../shared/types";
import type { BookMetadata } from "../shared/book-metadata";
import { languageName } from "../shared/languages";
import { api } from "./api";
import { ErrorMessage, Cover } from "./components";
import { LanguageSelect } from "./LanguageSelect";
export function EditionFacts({
  book,
  metadata,
}: {
  book: Book;
  metadata: BookMetadata | null;
}) {
  return (
    <dl className="edition-facts">
      <div>
        <dt>Publisher</dt>
        <dd>{metadata?.publisher || "Not supplied"}</dd>
      </div>
      <div>
        <dt>Published</dt>
        <dd>{metadata?.publishedDate || book.year || "Not supplied"}</dd>
      </div>
      <div>
        <dt>Language</dt>
        <dd>{languageName(metadata?.language)}</dd>
      </div>
      <div>
        <dt>Format</dt>
        <dd>
          {metadata?.format === "ebook" ? "E-book" : "Format not supplied"}
        </dd>
      </div>
      <div>
        <dt>Length</dt>
        <dd>{book.pages ? book.pages + " pages" : "Not supplied"}</dd>
      </div>
      {!metadata?.identifiers.some((i) => /^ISBN_/.test(i.type)) ? (
        <div>
          <dt>ISBN</dt>
          <dd>Not supplied</dd>
        </div>
      ) : null}
      {metadata?.identifiers
        .filter((i) => /^ISBN_/.test(i.type))
        .map((i) => (
          <div key={i.type + i.identifier}>
            <dt>{i.type.replaceAll("_", " ")}</dt>
            <dd>{i.identifier}</dd>
          </div>
        ))}
    </dl>
  );
}
type Result = {
  items: { book: Book; metadata: BookMetadata | null }[];
  total: number;
  page: number;
  pages: number;
};
export function BookEditions({
  book,
  metadata,
}: {
  book: Book;
  metadata: BookMetadata | null;
}) {
  const [params, setParams] = useState(location.hash.split("?")[1] || ""),
    [result, setResult] = useState<Result | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [importing, setImporting] = useState(false),
    [notice, setNotice] = useState(""),
    [importError, setImportError] = useState(""),
    [retry, setRetry] = useState(0);
  const query = new URLSearchParams(params),
    language = query.get("language") || "",
    page = query.get("editionPage") || "1";
  const importController = useRef<AbortController | null>(null);
  useEffect(() => {
    setImporting(false);
    setImportError("");
    setNotice("");
    return () => importController.current?.abort();
  }, [book.id, language]);
  useEffect(() => {
    const update = () => setParams(location.hash.split("?")[1] || "");
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    api<Result>(
      `/books/${book.id}/editions?language=${encodeURIComponent(language)}&page=${encodeURIComponent(page)}`,
      { signal: AbortSignal.any([c.signal, AbortSignal.timeout(15000)]) },
    )
      .then((r) => {
        if (!c.signal.aborted) setResult(r);
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.message);
          setResult(null);
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [book.id, language, page, retry]);
  function navigate(nextLanguage: string, nextPage: number) {
    const next = new URLSearchParams();
    if (nextLanguage) next.set("language", nextLanguage);
    if (nextPage > 1) next.set("editionPage", String(nextPage));
    location.hash = "book/" + book.id + (next.size ? "?" + next : "");
    setNotice("");
  }
  return (
    <section className="view-panel book-editions">
      <h2>Choose your edition</h2>
      <p>
        Compare editions with the same title and author. Open the one you own,
        then add it to your library. Notes and progress stay with each edition.
      </p>
      <div className="library-tools">
        <LanguageSelect
          label="Edition language"
          value={language}
          onChange={(value) => navigate(value, 1)}
        />
      </div>
      <button
        className="outline-btn"
        disabled={importing}
        onClick={async () => {
          importController.current?.abort();
          const controller = new AbortController();
          importController.current = controller;
          setImporting(true);
          setImportError("");
          setNotice("");
          try {
            const clean = (v: string) =>
              v
                .replaceAll('"', " ")
                .replaceAll(String.fromCharCode(92), " ")
                .slice(0, 45);
            const q = `intitle:"${clean(book.title)}" inauthor:"${clean(metadata?.authors[0] || book.author)}"`;
            const r = await api<{ warning: string | null }>(
              `/books/search?q=${encodeURIComponent(q)}&language=${encodeURIComponent(language)}`,
              {
                signal: AbortSignal.any([
                  controller.signal,
                  AbortSignal.timeout(15000),
                ]),
              },
            );
            if (controller.signal.aborted) return;
            setNotice(
              r.warning ||
                "Google Books checked. Matching editions are listed below.",
            );
            setRetry((r) => r + 1);
          } catch (e) {
            if (!controller.signal.aborted)
              setImportError(
                e instanceof Error ? e.message : "Could not find editions.",
              );
          } finally {
            if (!controller.signal.aborted) setImporting(false);
          }
        }}
      >
        {importing ? "Checking Google Books…" : "Find more editions"}
      </button>
      {notice ? <p role="status">{notice}</p> : null}
      <ErrorMessage message={importError} />
      {importError ? (
        <p className="view-intro">
          Your saved editions are still below. Select Find more editions to try
          Google Books again.
        </p>
      ) : null}
      <ErrorMessage message={error} />
      {error ? (
        <button className="plain-link" onClick={() => setRetry((r) => r + 1)}>
          Retry editions
        </button>
      ) : null}
      {loading ? (
        <p role="status">Loading editions…</p>
      ) : result ? (
        <>
          <p className="search-source">
            {result.total} matching{" "}
            {result.total === 1 ? "edition" : "editions"} · Page {result.page}{" "}
            of {result.pages}
          </p>
          {!result.items.length ? (
            <p className="empty-state">
              No matching editions in this language yet. Try another language or
              find more editions.
            </p>
          ) : (
            <div className="edition-grid">
              {result.items.map((item) => (
                <article className="edition-card" key={item.book.id}>
                  <div className="edition-card-heading">
                    <Cover book={item.book} small />
                    <div>
                      <h3>{item.book.title}</h3>
                      <p>{item.book.author}</p>
                    </div>
                  </div>
                  <EditionFacts book={item.book} metadata={item.metadata} />
                  {item.book.id === book.id ? (
                    <span className="tag tag-sage">Currently viewing</span>
                  ) : (
                    <a
                      className="outline-btn"
                      href={
                        "#book/" +
                        item.book.id +
                        (language
                          ? "?language=" + encodeURIComponent(language)
                          : "")
                      }
                    >
                      Choose this edition
                    </a>
                  )}
                </article>
              ))}
            </div>
          )}
          <nav className="account-actions" aria-label="Edition pages">
            <button
              className="outline-btn"
              disabled={result.page <= 1}
              onClick={() => navigate(language, result.page - 1)}
            >
              Previous editions
            </button>
            <button
              className="outline-btn"
              disabled={result.page >= result.pages}
              onClick={() => navigate(language, result.page + 1)}
            >
              Next editions
            </button>
          </nav>
        </>
      ) : null}
      <p className="view-intro">
        Check the ISBN against your copy. Missing details mean the source has
        not supplied them; binding is never guessed from a cover.
      </p>
      <p className="view-intro">
        Different translated titles may not be grouped together. Search Discover
        using the translated title to find those editions.
      </p>
    </section>
  );
}
