import { BookEditions, EditionFacts } from "./BookEditions";
import type { BookMetadata } from "../shared/book-metadata";
import { useCallback, useEffect, useState, useRef } from "react";
import { AddToList } from "./AddToList";
import { BrandLoading } from "./SiteIdentity";
import type { Book, BookSummary, Post, Reading, User } from "../shared/types";
import { api, json } from "./api";
import {
  Cover,
  Form,
  PostCard,
  Dialog,
  ErrorMessage,
  Icon,
} from "./components";
import type { FormEvent } from "react";
import { useCursorPages } from "./useCursorPages";
import { ActivityMore } from "./PagedFeed";
import {
  acotarOrder,
  seriesPosition,
  workIdentity,
} from "../shared/book-identity";
import { RatingStars, StarRatingInput } from "./StarRating";
const emptyReviews: {
  items: Post[];
  mine: Post | null;
  nextCursor: string | null;
} = { items: [], mine: null, nextCursor: null };
export function PublicReviewDialog({
  book,
  mine,
  onClose,
  onSaved,
}: {
  book: Book;
  mine: Post | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(
        `/books/${book.id}/review`,
        json("PUT", {
          body: data.get("body"),
          rating: Number(data.get("rating")),
          containsSpoilers: data.get("spoilers") === "on",
        }),
      );
      await onSaved();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your review could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={mine ? "Edit public review" : "Write a public review"}
      onClose={onClose}
    >
      <span className="section-kicker">A STORY WORTH SHARING</span>
      <h2>{mine ? "Revisit your review." : "What stayed with you?"}</h2>
      <p>
        {book.title} · {book.author}
      </p>
      <Form noValidate onSubmit={submit}>
        <StarRatingInput
          initial={mine?.rating || 5}
          label="Public star rating"
          allowNone={false}
        />
        <label>
          Public review
          <textarea
            className="resize-none"
            name="body"
            required
            maxLength={1200}
            defaultValue={mine?.body || ""}
            placeholder="Tell other readers what made this book memorable."
          />
        </label>
        <label className="shelf-check">
          <input
            type="checkbox"
            name="spoilers"
            defaultChecked={mine?.containsSpoilers}
          />
          This review contains spoilers
        </label>
        <p className="local-note">
          This review and its rating are public. Your private journal stays
          separate. You can edit or delete your public review later.
        </p>
        <ErrorMessage message={error} />
        <button className="primary-btn" disabled={busy}>
          {busy
            ? "Publishing…"
            : mine
              ? "Save public review changes ↗"
              : "Publish review ↗"}
        </button>
      </Form>
    </Dialog>
  );
}
export function BookPage({
  id,
  user,
  record: savedRecord,
  library,
  revision,
  onRead,
  onAuth,
  onChanged,
}: {
  id: string;
  user: User | null;
  record?: Reading;
  library: Reading[];
  revision: number;
  onRead: (b: Book) => void;
  onAuth: () => void;
  onChanged: () => Promise<void>;
}) {
  const [data, setData] = useState<{
      book: Book;
      summary: BookSummary;
      metadata: BookMetadata | null;
    } | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [review, setReview] = useState(false),
    [addingToList, setAddingToList] = useState(false),
    [deletePost, setDeletePost] = useState<Post | null>(null),
    [comment, setComment] = useState<Post | null>(null),
    [busy, setBusy] = useState(false),
    [dialogError, setDialogError] = useState(""),
    [copied, setCopied] = useState(false);
  const [params, setParams] = useState(location.hash.split("?")[1] || "");
  const [reviewRevision, setReviewRevision] = useState(0);
  useEffect(() => {
    const update = () => setParams(location.hash.split("?")[1] || "");
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const query = new URLSearchParams(params);
  const reviewSort =
    query.get("reviewSort") === "appreciated" ? "appreciated" : "recent";
  const reviewFilter =
    query.get("reviewFilter") === "following" ? "following" : "all";
  const reviews = useCursorPages(
    `/books/${id}/reviews?sort=${reviewSort}&filter=${reviewFilter}`,
    revision + reviewRevision,
    emptyReviews,
    reviewFilter !== "following" || !!user,
    user?.id,
  );
  function changeReviewFilter(name: string, value: string) {
    const next = new URLSearchParams(location.hash.split("?")[1] || "");
    next.set(name, value);
    location.hash = `book/${id}?${next}`;
  }
  const generation = useRef(0);
  const detailController = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    const version = ++generation.current;
    detailController.current?.abort();
    const controller = new AbortController();
    detailController.current = controller;
    const options = {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    };
    setError("");
    try {
      const detail = await api<{
        book: Book;
        summary: BookSummary;
        metadata: BookMetadata | null;
      }>(`/books/${id}?cached=1`, options);
      if (version === generation.current) {
        setData(detail);
        const b = detail.book,
          m = detail.metadata;
        if (
          id.startsWith("gb_") &&
          (!b.cover ||
            !b.pages ||
            !b.year ||
            b.author === "Unknown author" ||
            b.description === "No description supplied for this edition." ||
            !m?.tags.length ||
            !m.publisher ||
            !m.language)
        ) {
          // Saved details remain usable while the provider fills missing fields.
          void api<typeof detail>(`/books/${id}`, options)
            .then((enriched) => {
              if (version === generation.current && !controller.signal.aborted)
                setData(enriched);
            })
            .catch(() => {
              /* Provider recovery is optional; keep the saved record. */
            });
        }
      }
    } catch (e) {
      if (version === generation.current)
        setError(e instanceof Error ? e.message : "Could not open this book.");
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [id]);
  // The key on this page resets book-specific state during navigation.
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
      detailController.current?.abort();
    };
  }, [load, revision, user?.id]);
  const changed = async () => {
    await onChanged();
    await load();
  };
  async function like(post: Post) {
    if (!user) {
      onAuth();
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await api(`/posts/${post.id}/like`, {
        method: post.liked ? "DELETE" : "PUT",
      });
      await changed();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update appreciation.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function deleteReview() {
    if (!deletePost) return;
    setBusy(true);
    setDialogError("");
    try {
      await api(`/posts/${deletePost.id}`, { method: "DELETE" });
      await changed();
      setDeletePost(null);
    } catch (e) {
      setDialogError(
        e instanceof Error ? e.message : "Could not delete your review.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function addComment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!comment) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setDialogError("");
    try {
      await api(
        `/posts/${comment.id}/comments`,
        json("POST", { body: form.get("body") }),
      );
      await changed();
      setComment(null);
    } catch (e) {
      setDialogError(
        e instanceof Error ? e.message : "Could not add your note.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <section className="view-panel" role="status">
        <BrandLoading label="Opening this story…" />
      </section>
    );
  const record =
    savedRecord ||
    (data
      ? library.find(
          (entry) => workIdentity(entry.book) === workIdentity(data.book),
        )
      : undefined);
  if (!data)
    return (
      <section className="view-panel">
        <h2>A page we could not find.</h2>
        <ErrorMessage message={error} />
        <button className="outline-btn" onClick={() => void load()}>
          Try again
        </button>
        <a className="plain-link" href="#discover">
          Back to discovery ↗
        </a>
      </section>
    );
  const { book, summary } = data;
  const series = seriesPosition(book);
  return (
    <>
      <section className="view-panel book-page">
        <a className="plain-link book-page-back" href="#discover">
          ← Discover books
        </a>
        <div className="book-page-hero">
          <div className="book-page-cover">
            <Cover book={book} />
          </div>
          <div className="book-page-overview">
            <div className="book-page-meta-line">
              <span>{book.genre}</span>
              {book.year ? <span>{book.year}</span> : null}
            </div>
            <h2>{book.title}</h2>
            <p className="book-page-author">
              {(data.metadata?.authors.length
                ? data.metadata.authors
                : [book.author]
              ).map((name, i) => (
                <span key={name}>
                  {i ? ", " : ""}
                  <a
                    className="plain-link"
                    href={`#author?name=${encodeURIComponent(name)}`}
                  >
                    {name}
                  </a>
                </span>
              ))}
            </p>
            <p className="community-score">
              {summary.averageRating !== null ? (
                <>
                  <RatingStars rating={Math.round(summary.averageRating)} />
                  <strong>{summary.averageRating.toFixed(1)}</strong>
                  <span>
                    · {summary.reviewCount} public{" "}
                    {summary.reviewCount === 1 ? "review" : "reviews"}
                  </span>
                </>
              ) : (
                <span>Be the first to leave a public review.</span>
              )}
            </p>
            <div className="book-page-actions">
              <button className="primary-btn" onClick={() => onRead(book)}>
                {record ? "Update reading ↗" : "Add to my library ↗"}
              </button>
              <button
                className="book-page-icon-action"
                onClick={() => (user ? setAddingToList(true) : onAuth())}
                aria-label="Add to list"
                title="Add to list"
              >
                <Icon name="plus" />
              </button>
              <button
                className="book-page-icon-action"
                aria-label={copied ? "Link copied" : "Copy book link"}
                title={copied ? "Link copied" : "Copy book link"}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(location.href);
                    setCopied(true);
                  } catch {
                    setError(
                      "Copy this page address from your browser to share it.",
                    );
                  }
                }}
              >
                <Icon name="share" />
              </button>
            </div>
          </div>
        </div>
        {series?.series === "acotar" && series.position > 0 ? (
          <section
            className="series-trail"
            aria-label="A Court of Thorns and Roses reading order"
          >
            <div>
              <span className="section-kicker">READING ORDER</span>
              <h3>Find your place in the series</h3>
            </div>
            <ol>
              {acotarOrder.map((title, index) => {
                const number = index + 1;
                const finished = library.some(
                  (entry) =>
                    seriesPosition(entry.book)?.series === "acotar" &&
                    seriesPosition(entry.book)?.position === number &&
                    entry.status === "Finished",
                );
                return (
                  <li
                    key={title}
                    className={`${number === series.position ? "current" : ""} ${finished ? "finished" : ""}`}
                  >
                    <span>
                      {finished ? "✓" : number.toString().padStart(2, "0")}
                    </span>
                    <small>{title}</small>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}
        <div className="book-page-body">
          <div className="book-page-description">
            <h3>About this book</h3>
            <p className="book-description">{book.description}</p>
          </div>
          <aside className="book-page-facts" aria-label="Book details">
            {record ? (
              <p className="private-reading-status">
                <strong>Your reading</strong>
                <span>
                  {record.status}
                  {record.rating ? (
                    <RatingStars rating={record.rating} />
                  ) : null}
                  {record.page ? ` · page ${record.page}` : ""}
                </span>
              </p>
            ) : null}
            {book.pages ? (
              <p className="book-page-length">
                <strong>Length</strong>
                <span>{book.pages} pages</span>
              </p>
            ) : null}
            {data.metadata ? (
              <details className="edition-details">
                <summary>Publication details</summary>
                <EditionFacts book={book} metadata={data.metadata} />
                <div className="book-metadata">
                  {data.metadata.tags.map((tag) => (
                    <span className="tag tag-sage" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <a
                  className="plain-link"
                  href={`https://books.google.com/books?id=${encodeURIComponent(data.metadata.providerId)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Book data from Google Books ↗
                </a>
                <p>
                  <a
                    className="plain-link"
                    href={`#author?name=${encodeURIComponent(data.metadata.authors[0] || book.author)}&q=${encodeURIComponent(book.title)}`}
                  >
                    Explore related editions ↗
                  </a>
                </p>
              </details>
            ) : null}
            {/^OL\d+W$/.test(book.id) ? (
              <a
                className="plain-link"
                href={`https://openlibrary.org/works/${book.id}`}
                target="_blank"
                rel="noreferrer"
              >
                Book data from Open Library ↗
              </a>
            ) : null}
          </aside>
        </div>
        <ErrorMessage message={error} />
      </section>
      <BookEditions key={book.id} book={book} metadata={data.metadata} />
      <section
        className="view-panel book-reviews"
        aria-label="Public book reviews"
      >
        <div className="book-reviews-heading">
          <h2>Reader reviews</h2>
          <button
            className="outline-btn"
            disabled={!!user && (reviews.busy || !!reviews.error)}
            onClick={() => (user ? setReview(true) : onAuth())}
          >
            {reviews.mine ? "Edit my public review" : "Write a public review"}
          </button>
        </div>
        <details className="review-controls">
          <summary>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            Sort and filter
          </summary>
          <div className="library-tools">
            <label>
              Review order
              <select
                value={reviewSort}
                onChange={(e) =>
                  changeReviewFilter("reviewSort", e.target.value)
                }
              >
                <option value="recent">Recent</option>
                <option value="appreciated">Most appreciated</option>
              </select>
            </label>
            <label>
              Review readers
              <select
                value={reviewFilter}
                onChange={(e) =>
                  changeReviewFilter("reviewFilter", e.target.value)
                }
              >
                <option value="all">Everyone</option>
                <option value="following">Following</option>
              </select>
            </label>
            <button
              className="outline-btn"
              disabled={reviews.busy || busy}
              onClick={() => setReviewRevision((n) => n + 1)}
            >
              Refresh reviews
            </button>
          </div>
        </details>
        {reviewSort === "appreciated" ? (
          <p className="local-note">
            Appreciations can change the order. Refresh to see the latest
            ranking.
          </p>
        ) : null}
        {reviewFilter === "following" && !user ? (
          <div className="empty-state">
            <p>Sign in to see reviews from readers you follow.</p>
            <button className="outline-btn" onClick={onAuth}>
              Sign in
            </button>
          </div>
        ) : (
          <>
            {reviews.items.length ? (
              <p className="local-note" role="status">
                {reviews.items.length}{" "}
                {reviews.items.length === 1 ? "review" : "reviews"}
              </p>
            ) : null}
            <div className="feed-list">
              {reviews.items.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  user={user}
                  onLike={(p) => void like(p)}
                  onComment={(p) => {
                    if (user) {
                      setDialogError("");
                      setComment(p);
                    } else onAuth();
                  }}
                  onDelete={(p) => {
                    setDialogError("");
                    setDeletePost(p);
                  }}
                  onEdit={() => setReview(true)}
                />
              ))}
              {!reviews.items.length && !reviews.busy && !reviews.error ? (
                <div className="empty-state">
                  <p>
                    {reviewFilter === "following"
                      ? "No reviews from readers you follow for this book yet."
                      : "This conversation has room for your first impression."}
                  </p>
                  {reviewFilter === "following" ? (
                    <a className="plain-link" href="#readers">
                      Find readers
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
            <ActivityMore
              activity={reviews}
              moreLabel="Load more reviews"
              loadingLabel="Loading reviews…"
              endLabel="You’ve reached the end of these reviews."
              disabled={busy}
            />
          </>
        )}
      </section>
      {addingToList && user ? (
        <AddToList
          key={`${book.id}-${user.id}`}
          book={book}
          onClose={() => setAddingToList(false)}
        />
      ) : null}
      {review ? (
        <PublicReviewDialog
          book={book}
          mine={reviews.mine}
          onClose={() => setReview(false)}
          onSaved={changed}
        />
      ) : null}
      {deletePost ? (
        <Dialog
          title="Delete public review"
          onClose={() => setDeletePost(null)}
        >
          <h2>Delete your public review?</h2>
          <p>
            This removes its public rating, likes, and conversation. Your
            private journal is kept.
          </p>
          <ErrorMessage message={dialogError} />
          <button
            className="primary-btn"
            disabled={busy}
            onClick={() => void deleteReview()}
          >
            {busy ? "Deleting…" : "Delete public review"}
          </button>
        </Dialog>
      ) : null}
      {comment ? (
        <Dialog title="Leave a little note" onClose={() => setComment(null)}>
          <h2>Leave a little note.</h2>
          <Form noValidate onSubmit={addComment}>
            <label>
              Your note
              <textarea
                className="resize-none"
                name="body"
                required
                maxLength={500}
              />
            </label>
            <p className="local-note">
              This note is public. Notes on spoiler reviews stay behind the
              spoiler reveal.
            </p>
            <ErrorMessage message={dialogError} />
            <button className="primary-btn" disabled={busy}>
              {busy ? "Adding…" : "Add note ↗"}
            </button>
          </Form>
        </Dialog>
      ) : null}
    </>
  );
}
