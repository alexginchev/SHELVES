import { useEffect, useId, useRef, useState } from "react";
import type { Book } from "../shared/types";
import { api } from "./api";
import { Cover, ErrorMessage, Icon } from "./components";
import { BrandLoading } from "./SiteIdentity";
import { LanguageSelect } from "./LanguageSelect";

type Results = { items: Book[]; source: string; warning: string | null };
export function HeaderSearch() {
  const [query, setQuery] = useState(""),
    [open, setOpen] = useState(false);
  const [language, setLanguage] = useState(""),
    [offset, setOffset] = useState(0);
  const [composing, setComposing] = useState(false),
    [revision, setRevision] = useState(0);
  const [results, setResults] = useState<Results | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  const immediate = useRef(false),
    panelId = useId();
  const term = query.trim();
  useEffect(() => {
    const close = () => setOpen(false);
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    window.addEventListener("hashchange", close);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("hashchange", close);
      document.removeEventListener("pointerdown", outside);
    };
  }, []);
  useEffect(() => {
    setResults(null);
    setError("");
    setBusy(false);
    if (!open || composing || term.length < 2) return;
    const controller = new AbortController();
    setBusy(true);
    const timer = setTimeout(
      () => {
        api<Results>(
          `/books/search?q=${encodeURIComponent(term)}&language=${encodeURIComponent(language)}&startIndex=${offset}`,
          {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(15000),
            ]),
          },
        )
          .then((data) => {
            if (!controller.signal.aborted) setResults(data);
          })
          .catch((e) => {
            if (!controller.signal.aborted) setError(e.message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setBusy(false);
          });
      },
      immediate.current ? 0 : 300,
    );
    immediate.current = false;
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, language, offset, composing, revision, open]);
  const close = () => {
    input.current?.focus();
    setOpen(false);
  };
  function moveFocus(direction: number) {
    const links = Array.from(
      root.current?.querySelectorAll<HTMLAnchorElement>(
        ".quick-search-result",
      ) || [],
    );
    if (!links.length) return;
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    links[
      index < 0
        ? direction > 0
          ? 0
          : links.length - 1
        : (index + direction + links.length) % links.length
    ]?.focus();
  }
  return (
    <div
      className="header-search"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
        if (
          (event.key === "ArrowDown" || event.key === "ArrowUp") &&
          (event.target === input.current ||
            (event.target as HTMLElement).classList.contains(
              "quick-search-result",
            ))
        ) {
          event.preventDefault();
          setOpen(true);
          moveFocus(event.key === "ArrowDown" ? 1 : -1);
        }
      }}
    >
      <div className="header-search-field">
        <Icon name="search" />
        <input
          ref={input}
          type="search"
          aria-label="Search books and authors"
          role="combobox"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          autoComplete="off"
          placeholder="Search books, authors, ISBN…"
          value={query}
          maxLength={120}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOffset(0);
            setOpen(true);
          }}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              immediate.current = true;
              setRevision((n) => n + 1);
              setOpen(true);
            }
          }}
        />
        {query && (
          <button
            className="header-search-clear"
            aria-label="Clear book search"
            onClick={() => {
              setQuery("");
              setOffset(0);
              setOpen(true);
              input.current?.focus();
            }}
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <section
          className="quick-search-panel"
          id={panelId}
          role="dialog"
          aria-label="Book search results"
        >
          <div className="quick-search-heading">
            <strong>Find your next book</strong>
            <button className="plain-link" onClick={close}>
              Close search
            </button>
          </div>
          <LanguageSelect
            value={language}
            onChange={(value) => {
              setLanguage(value);
              setOffset(0);
            }}
            label="Results language"
          />
          {term.length < 2 ? (
            <p className="quick-search-hint">
              Search by title, author or ISBN. Results appear here.
            </p>
          ) : busy ? (
            <BrandLoading label="Finding books…" />
          ) : (
            <>
              <ErrorMessage message={error} />
              {error && (
                <button
                  className="outline-btn"
                  onClick={() => {
                    immediate.current = true;
                    setRevision((n) => n + 1);
                  }}
                >
                  Retry search
                </button>
              )}
              {results?.warning && (
                <p role="status" className="catalog-warning">
                  {results.warning}
                </p>
              )}
              {results && (
                <>
                  <p className="quick-search-count" role="status">
                    {results.items.length} results · {results.source}
                  </p>
                  <div className="quick-search-results">
                    {results.items.map((book) => (
                      <a
                        className="quick-search-result"
                        href={`#book/${book.id}`}
                        key={book.id}
                        onClick={() => setOpen(false)}
                      >
                        <Cover book={book} small />
                        <span>
                          <strong>{book.title}</strong>
                          <small>{book.author}</small>
                        </span>
                        <span aria-hidden="true">↗</span>
                      </a>
                    ))}
                  </div>
                  {!results.items.length && (
                    <p>No books found. Try another title or author.</p>
                  )}
                  {(offset > 0 || results.items.length === 10) && (
                    <nav
                      className="quick-search-pages"
                      aria-label="Search result pages"
                    >
                      <button
                        className="outline-btn"
                        disabled={offset === 0}
                        onClick={() => {
                          immediate.current = true;
                          setOffset((n) => n - 10);
                        }}
                      >
                        Previous
                      </button>
                      <span>Page {offset / 10 + 1}</span>
                      <button
                        className="outline-btn"
                        disabled={results.items.length < 10}
                        onClick={() => {
                          immediate.current = true;
                          setOffset((n) => n + 10);
                        }}
                      >
                        Next
                      </button>
                    </nav>
                  )}
                </>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
