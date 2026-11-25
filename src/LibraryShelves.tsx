import { useEffect, useRef, useState } from "react";
import type {
  Book,
  Reading,
  ReadingStatus,
  Recommendation,
} from "../shared/types";
import { api } from "./api";
import { Cover, Icon } from "./components";

const sections: { status: ReadingStatus; title: string }[] = [
  { status: "Currently reading", title: "Currently reading" },
  { status: "Want to read", title: "Up next" },
  { status: "Finished", title: "Finished" },
  { status: "Did not finish", title: "Set aside" },
];
type DiscoveryPage = { items: Book[]; error: string; until: number };
const discoveryCache = new Map<string, DiscoveryPage>();
const discoveryRequests = new Map<string, Promise<DiscoveryPage>>();

function discoveryPage(subject: string, page: number, refresh = false) {
  const key = `${subject}:${page}`;
  const cached = discoveryCache.get(key);
  if (!refresh && cached && cached.until > Date.now())
    return Promise.resolve(cached);
  const pending = discoveryRequests.get(key);
  if (pending) return pending;
  const request = api<{ items: Book[] }>(
    `/books/search?q=${encodeURIComponent(`subject:${subject}`)}&startIndex=${page * 10}`,
    { signal: AbortSignal.timeout(12000) },
  )
    .then((result): DiscoveryPage => ({
      items: result.items,
      error: "",
      until: Date.now() + 300000,
    }))
    .catch((): DiscoveryPage => ({
      items: [],
      error: "Could not load more books right now.",
      until: Date.now() + 60000,
    }))
    .then((result) => {
      discoveryCache.set(key, result);
      if (discoveryCache.size > 30)
        discoveryCache.delete(discoveryCache.keys().next().value!);
      return result;
    })
    .finally(() => discoveryRequests.delete(key));
  discoveryRequests.set(key, request);
  return request;
}

function ShelfBook({
  record,
  onBook,
}: {
  record: Reading;
  onBook: (book: Book) => void;
}) {
  const { book, status, rating, page } = record;
  const progress = book.pages
    ? Math.min(100, Math.round((page / book.pages) * 100))
    : 0;
  return (
    <article className="book-tile shelf-book">
      <a
        className="shelf-book-link"
        href={`#book/${book.id}`}
        aria-label={`Open ${book.title}`}
        onClick={(event) => {
          if (
            event.button !== 0 ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          onBook(book);
        }}
      >
        <span className="shelf-book-cover">
          <Cover book={book} />
        </span>
        <strong>{book.title}</strong>
        <small>{book.author}</small>
      </a>
      {rating > 0 ? (
        <span
          className="shelf-rating"
          role="img"
          aria-label={`${rating} out of 5 stars`}
        >
          {Array.from({ length: 5 }, (_, index) => (
            <span className={index < rating ? "filled" : ""} key={index}>
              <Icon name="star" />
            </span>
          ))}
        </span>
      ) : status === "Currently reading" && page > 0 ? (
        <span
          className="shelf-book-progress"
          aria-label={`Page ${page}${book.pages ? ` of ${book.pages}` : ""}`}
        >
          <span style={{ width: `${progress}%` }} />
          <small>
            Page {page}
            {book.pages ? ` of ${book.pages}` : ""}
          </small>
        </span>
      ) : (
        <small className="shelf-book-state">{status}</small>
      )}
    </article>
  );
}

export function LibraryShelf({
  title,
  records,
  onBook,
  onViewAll,
}: {
  title: string;
  records: Reading[];
  onBook: (book: Book) => void;
  onViewAll?: () => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  if (!records.length) return null;
  const move = (direction: number) =>
    track.current?.scrollBy({
      left: direction * Math.max(300, track.current.clientWidth * 0.75),
      behavior: "smooth",
    });
  return (
    <section className="library-shelf" aria-label={`${title} shelf`}>
      <div className="library-shelf-heading">
        <h3>
          {title} <span>{records.length}</span>
        </h3>
        <div className="library-shelf-controls">
          {onViewAll ? (
            <button type="button" className="plain-link" onClick={onViewAll}>
              Full shelf <Icon name="arrowUpRight" />
            </button>
          ) : null}
          {records.length > 4 ? (
            <>
              <button
                type="button"
                onClick={() => move(-1)}
                aria-label={`Scroll ${title} left`}
              >
                <Icon name="back" />
              </button>
              <button
                type="button"
                onClick={() => move(1)}
                aria-label={`Scroll ${title} right`}
              >
                <Icon name="arrow" />
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div className="library-shelf-track" ref={track}>
        {records.map((record) => (
          <ShelfBook record={record} onBook={onBook} key={record.bookId} />
        ))}
      </div>
      <div className="library-shelf-ledge" aria-hidden="true" />
    </section>
  );
}

export function LibraryShelves({
  records,
  selected,
  customName,
  onBook,
  onStatus,
}: {
  records: Reading[];
  selected: string;
  customName?: string;
  onBook: (book: Book) => void;
  onStatus: (status: ReadingStatus) => void;
}) {
  if (selected && customName)
    return (
      <LibraryShelf title={customName} records={records} onBook={onBook} />
    );
  return (
    <div className="library-shelves">
      {sections
        .filter((section) => !selected || selected === section.status)
        .map((section) => (
          <LibraryShelf
            key={section.status}
            title={section.title}
            records={records.filter(
              (record) => record.status === section.status,
            )}
            onBook={onBook}
            onViewAll={!selected ? () => onStatus(section.status) : undefined}
          />
        ))}
    </div>
  );
}

export function ExploreShelf({
  genre,
  savedIds,
  fallback,
  onBook,
}: {
  genre: string;
  savedIds: string[];
  fallback: Recommendation[];
  onBook: (book: Book) => void;
}) {
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<Book[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const lastRetry = useRef(0);
  const subject = /^[\p{L} ]{2,40}$/u.test(genre) ? genre : "fiction";
  useEffect(() => {
    let active = true;
    const refresh = retry !== lastRetry.current;
    lastRetry.current = retry;
    setBusy(true);
    setError("");
    discoveryPage(subject, page, refresh).then((result) => {
      if (!active) return;
      setItems(result.items);
      setError(result.error);
      setBusy(false);
    });
    return () => {
      active = false;
    };
  }, [subject, page, retry]);
  const visible = (error ? fallback : items).filter(
    (book) => !savedIds.includes(book.id),
  );
  return (
    <section className="explore-shelf" aria-label="Discover more books">
      <div className="library-shelf-heading">
        <h3>Beyond your shelf</h3>
        <a href="#discover" className="plain-link">
          Explore books <Icon name="arrowUpRight" />
        </a>
      </div>
      {busy ? (
        <p role="status" className="shelf-loading">
          Finding books for your next chapter…
        </p>
      ) : null}
      {error ? (
        <p role="status" className="shelf-loading">
          {error}{" "}
          <button
            type="button"
            className="plain-link"
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry
          </button>
        </p>
      ) : null}
      <div className="explore-shelf-track">
        {visible.map((book) => (
          <a
            href={`#book/${book.id}`}
            key={book.id}
            className="explore-shelf-book"
            aria-label={`Open ${book.title}`}
            onClick={(event) => {
              if (
                event.button !== 0 ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              onBook(book);
            }}
          >
            <Cover book={book} />
            <strong>{book.title}</strong>
            <small>{book.author}</small>
          </a>
        ))}
      </div>
      {!busy && !error && items.length === 0 ? (
        <p className="shelf-loading">No more titles on this page.</p>
      ) : null}
      {!busy && !error && (page > 0 || items.length === 10) ? (
        <div className="explore-shelf-pages">
          <button
            type="button"
            className="outline-btn"
            disabled={page === 0}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </button>
          <span>Page {page + 1}</span>
          <button
            type="button"
            className="outline-btn"
            disabled={items.length < 10}
            onClick={() => setPage((value) => value + 1)}
          >
            More books <Icon name="arrow" />
          </button>
        </div>
      ) : null}
    </section>
  );
}
