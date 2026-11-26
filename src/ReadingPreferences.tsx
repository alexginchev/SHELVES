import { readingGenres } from "../shared/genres";
import { useEffect, useRef, useState } from "react";
import type {
  Book,
  ReadingPreferences as Preferences,
  User,
} from "../shared/types";
import { api, json } from "./api";
import { Cover, ErrorMessage, Icon } from "./components";

type SearchResult = { items: Book[] };

function OrbitScene({ books, notice }: { books: Book[]; notice: string }) {
  const scene = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const element = scene.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting && !document.hidden),
      { threshold: 0.1 },
    );
    const onVisibility = () =>
      setVisible(
        !document.hidden && element.getBoundingClientRect().bottom > 0,
      );
    observer.observe(element);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return (
    <section
      ref={scene}
      className={`taste-orbit-scene ${visible ? "" : "is-paused"}`}
      aria-label="Your completed reading orbit"
    >
      <div className="taste-orbit-motion" aria-hidden="true">
        <div className="taste-orbit-track" />
        {books.map((book, index) => (
          <div
            className={`taste-orbit-body taste-orbit-body-${index}`}
            key={book.id}
            style={{ animationDelay: `${index * -4}s` }}
          >
            <Cover book={book} />
          </div>
        ))}
        <div className="taste-orbit-core">
          <span>YOUR READING ORBIT</span>
          <strong>
            Three stories.
            <br />A world of next reads.
          </strong>
        </div>
      </div>
      <div className="taste-orbit-caption">
        <p role="status">{notice}</p>
        <span>{books.map((book) => book.title).join(" · ")}</span>
        <a href="#discover" className="outline-btn">
          Explore your picks <Icon name="arrow" />
        </a>
      </div>
    </section>
  );
}

export function ReadingPreferences({
  user,
  onAuth,
  onSaved,
  starters,
}: {
  user: User | null;
  onAuth: () => void;
  onSaved: () => Promise<void>;
  starters: Book[];
}) {
  const [genres, setGenres] = useState<string[]>([]);
  const [chosen, setChosen] = useState<Book[]>([]);
  const [completed, setCompleted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Book[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const orbitAnchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!notice) return;
    const frame = requestAnimationFrame(() =>
      orbitAnchor.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [notice]);

  useEffect(() => {
    setLoaded(false);
    setError("");
    setChosen([]);
    setGenres([]);
    if (!user) return;
    const controller = new AbortController();
    api<Preferences>("/preferences", { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setGenres(data.genres);
        setChosen(data.books);
        setCompleted(data.completed);
        setLoaded(true);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, [user?.id, retry]);

  useEffect(() => {
    const value = query.trim();
    setSearchError("");
    if (value.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setResults([]);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      api<SearchResult>(`/books/search?q=${encodeURIComponent(value)}`, {
        signal: controller.signal,
      })
        .then((data) => {
          if (!controller.signal.aborted) setResults(data.items);
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setSearchError(cause.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  function toggle(book: Book) {
    setNotice("");
    setChosen((current) =>
      current.some((item) => item.id === book.id)
        ? current.filter((item) => item.id !== book.id)
        : current.length < 3
          ? [...current, book]
          : current,
    );
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(
        "/preferences",
        json("PUT", { genres, bookIds: chosen.map((book) => book.id) }),
      );
      await onSaved();
      setCompleted(true);
      setNotice(
        "Your reading orbit is ready. Picks, readers, and posts now follow your taste.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save your books.",
      );
    } finally {
      setBusy(false);
    }
  }

  const suggestions = query.trim().length >= 2 ? results : starters;
  return (
    <section className="view-panel taste-page">
      <div className="taste-intro">
        <div>
          <h2>Find your people through books.</h2>
          <p>
            Pick three books you love. We’ll shape your next reads, readers to
            know, and the conversations you see.
          </p>
        </div>
        <div
          className="taste-progress"
          aria-label={`${chosen.length} of 3 books chosen`}
        >
          <strong>
            {chosen.length}
            <span>/3</span>
          </strong>
          <span>books in your orbit</span>
        </div>
      </div>
      <ErrorMessage message={error} />
      <div ref={orbitAnchor}>
        {notice && chosen.length === 3 ? (
          <OrbitScene books={chosen} notice={notice} />
        ) : null}
      </div>
      {!user ? (
        <div className="taste-guest">
          <div className="taste-guest-covers" aria-hidden="true">
            {starters.slice(0, 3).map((book) => (
              <Cover key={book.id} book={book} />
            ))}
          </div>
          <div>
            <strong>Your shelf starts here.</strong>
            <p>
              Choose the stories that stayed with you, then meet readers on the
              same wavelength.
            </p>
            <button className="primary-btn" onClick={onAuth}>
              Sign in to choose books <Icon name="arrow" />
            </button>
          </div>
        </div>
      ) : !loaded ? (
        error ? (
          <button
            className="outline-btn"
            onClick={() => setRetry((value) => value + 1)}
          >
            Try again
          </button>
        ) : (
          <p role="status">Opening your reading orbit…</p>
        )
      ) : (
        <>
          <div className="taste-slots" aria-live="polite">
            {[0, 1, 2].map((index) => {
              const book = chosen[index];
              return (
                <div
                  className={`taste-slot ${book ? "filled" : ""}`}
                  key={index}
                >
                  {book ? (
                    <>
                      <Cover book={book} />
                      <div className="taste-slot-caption">
                        <strong>{book.title}</strong>
                        <span>{book.author}</span>
                      </div>
                      <button
                        type="button"
                        className="taste-remove"
                        onClick={() => toggle(book)}
                        aria-label={`Remove ${book.title}`}
                        title={`Remove ${book.title}`}
                      >
                        <Icon name="close" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="taste-slot-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>One you’d recommend to a friend</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="taste-search">
            <label htmlFor="taste-book-search">Find a book you love</label>
            <div className="taste-search-field">
              <Icon name="search" />
              <input
                id="taste-book-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Title, author, or ISBN"
                autoComplete="off"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                >
                  <Icon name="close" />
                </button>
              )}
            </div>
            {searching && <span role="status">Looking for books…</span>}
            {searchError && (
              <p role="alert">
                {searchError}{" "}
                <button
                  type="button"
                  className="plain-link"
                  onClick={() => setQuery((value) => `${value} `)}
                >
                  Try again
                </button>
              </p>
            )}
          </div>
          <div className="taste-picks-heading">
            <h3>
              {query.trim().length >= 2
                ? "Search results"
                : "A few to get you started"}
            </h3>
            <span>
              {chosen.length === 3
                ? "Your three are set"
                : "Tap a cover to add it"}
            </span>
          </div>
          <div className="taste-book-grid">
            {suggestions.slice(0, 12).map((book) => {
              const selected = chosen.some((item) => item.id === book.id);
              return (
                <button
                  type="button"
                  key={book.id}
                  className={`taste-book ${selected ? "selected" : ""}`}
                  onClick={() => toggle(book)}
                  disabled={!selected && chosen.length === 3}
                  aria-pressed={selected}
                  aria-label={`${selected ? "Remove" : "Choose"} ${book.title} by ${book.author}`}
                >
                  <span className="taste-cover">
                    <Cover book={book} />
                    <span className="taste-select-mark">
                      <Icon name={selected ? "check" : "plus"} />
                    </span>
                  </span>
                  <strong>{book.title}</strong>
                  <small>{book.author}</small>
                </button>
              );
            })}
          </div>
          {query.trim().length >= 2 &&
            !searching &&
            !searchError &&
            !results.length && (
              <p>No books found. Try a different title or author.</p>
            )}
          <details className="taste-genres">
            <summary>
              Fine-tune with genres{" "}
              <span>
                {genres.length ? `${genres.length} selected` : "Optional"}
              </span>
            </summary>
            <fieldset className="genre-options" disabled={busy}>
              <legend>Choose up to five</legend>
              {readingGenres.map((genre) => (
                <label key={genre}>
                  <input
                    type="checkbox"
                    checked={genres.includes(genre)}
                    disabled={!genres.includes(genre) && genres.length >= 5}
                    onChange={(event) =>
                      setGenres((current) =>
                        event.target.checked
                          ? [...current, genre]
                          : current.filter((item) => item !== genre),
                      )
                    }
                  />
                  {genre}
                </label>
              ))}
            </fieldset>
          </details>
          <div className="taste-footer">
            <p>Your choices stay private. You can change them any time.</p>
            <div>
              <button
                type="button"
                className="primary-btn"
                disabled={busy || chosen.length < 3}
                onClick={() => void save()}
              >
                {busy
                  ? "Saving…"
                  : completed
                    ? "Update my orbit"
                    : "Show my orbit"}{" "}
                <Icon name="arrow" />
              </button>
              {completed && (
                <a className="outline-btn" href="#discover">
                  Explore your picks
                </a>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
