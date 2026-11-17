import { BookEditions, EditionFacts } from "./BookEditions";
import type { BookMetadata } from "../shared/book-metadata";
import { useCallback, useEffect, useState, useRef } from "react";
import { AddToList } from "./AddToList";
import { BrandLoading } from "./SiteIdentity";
import type { Book, BookSummary, Post, Reading, User } from "../shared/types";
import { api, json } from "./api";
import { Cover, Form, PostCard, Dialog, ErrorMessage } from "./components";
import type { FormEvent } from "react";
import { useCursorPages } from "./useCursorPages";
import { ActivityMore } from "./PagedFeed";
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
        <label>
          Public star rating
          <select name="rating" defaultValue={mine?.rating || 5}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option value={n} key={n}>
                {n} {n === 1 ? "star" : "stars"}
              </option>
            ))}
          </select>
        </label>
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
  record,
  revision,
  onRead,
  onAuth,
  onChanged,
}: {
  id: string;
  user: User | null;
  record?: Reading;
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
  return (
    <>
      <section className="view-panel book-page">
        <a className="plain-link" href="#discover">
          ← Discover books
        </a>
        <div className="book-page-hero">
          <div className="book-page-cover">
            <Cover book={book} />
          </div>
          <div>
            <span className="section-kicker">A WORLD BETWEEN THE PAGES</span>
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
            <div className="book-metadata">
              <span className="tag tag-sage">{book.genre}</span>
              {book.year ? <span>{book.year}</span> : null}
              {book.pages ? <span>{book.pages} pages</span> : null}
            </div>
            <p className="community-score">
              {summary.averageRating !== null ? (
                <>
                  <strong>{summary.averageRating.toFixed(1)}</strong> / 5{" "}
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
              <button
                className="outline-btn"
                onClick={() => (user ? setAddingToList(true) : onAuth())}
              >
                Add to list
              </button>
              <button className="primary-btn" onClick={() => onRead(book)}>
                {record ? "Update reading ↗" : "Add to my library ↗"}
              </button>
              <button
                className="outline-btn"
                disabled={!!user && (reviews.busy || !!reviews.error)}
                onClick={() => (user ? setReview(true) : onAuth())}
              >
                {reviews.mine
                  ? "Edit my public review"
                  : "Write a public review"}
              </button>
              <button
                className="plain-link"
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
                {copied ? "Link copied" : "Copy book link"}
              </button>
            </div>
            {record ? (
              <p className="private-reading-status">
                Your private record: {record.status}
                {record.rating ? ` · ${record.rating}/5 stars` : ""}
                {record.page ? ` · page ${record.page}` : ""}
              </p>
            ) : null}
          </div>
        </div>
        <h3>About this book</h3>
        <p className="book-description">{book.description}</p>
        {data.metadata ? (
          <div className="edition-details">
            <h3>This edition</h3>
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
          </div>
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
        <ErrorMessage message={error} />
      </section>
      <BookEditions key={book.id} book={book} metadata={data.metadata} />
      <section
        className="view-panel book-reviews"
        aria-label="Public book reviews"
      >
        <span className="section-kicker">BETWEEN READERS</span>
        <h2>What the community thinks.</h2>
        <p className="view-intro">
          Public reviews from readers. Spoilers stay tucked away until you open
          them.
        </p>
        <div className="library-tools">
          <label>
            Review order
            <select
              value={reviewSort}
              onChange={(e) => changeReviewFilter("reviewSort", e.target.value)}
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
            <p className="local-note" role="status">
              {reviews.items.length} reviews loaded
            </p>
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
