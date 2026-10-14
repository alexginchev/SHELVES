import { useCallback, useEffect, useState, useRef } from "react";
import type { Book, BookSummary, Post, Reading, User } from "../shared/types";
import { api, json } from "./api";
import {
  Cover,
  PaperCover,
  PostCard,
  Dialog,
  ErrorMessage,
} from "./components";
import type { FormEvent } from "react";
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
      <form onSubmit={submit}>
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
      </form>
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
      reviews: Post[];
      mine: Post | null;
    } | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [review, setReview] = useState(false),
    [deletePost, setDeletePost] = useState<Post | null>(null),
    [comment, setComment] = useState<Post | null>(null),
    [busy, setBusy] = useState(false),
    [dialogError, setDialogError] = useState(""),
    [copied, setCopied] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const version = ++generation.current;
    setError("");
    try {
      const [detail, reviews] = await Promise.all([
        api<{ book: Book; summary: BookSummary }>(`/books/${id}`),
        api<{ items: Post[]; mine: Post | null }>(`/books/${id}/reviews`),
      ]);
      if (version === generation.current)
        setData({ ...detail, reviews: reviews.items, mine: reviews.mine });
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
        <h2>Opening this story…</h2>
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
            {book.cover ? <PaperCover book={book} hidden /> : null}
          </div>
          <div>
            <span className="section-kicker">A WORLD BETWEEN THE PAGES</span>
            <h2>{book.title}</h2>
            <p className="book-page-author">{book.author}</p>
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
              <button className="primary-btn" onClick={() => onRead(book)}>
                {record ? "Update reading ↗" : "Add to my library ↗"}
              </button>
              <button
                className="outline-btn"
                onClick={() => (user ? setReview(true) : onAuth())}
              >
                {data.mine ? "Edit my public review" : "Write a public review"}
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
      <section className="view-panel">
        <span className="section-kicker">BETWEEN READERS</span>
        <h2>What the community thinks.</h2>
        <p className="view-intro">
          Public reviews from readers. Spoilers stay tucked away until you open
          them.
        </p>
        <div className="feed-list">
          {data.reviews.map((p) => (
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
          {!data.reviews.length ? (
            <div className="empty-state">
              <p>This conversation has room for your first impression.</p>
            </div>
          ) : null}
        </div>
      </section>
      {review ? (
        <PublicReviewDialog
          book={book}
          mine={data.mine}
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
          <form onSubmit={addComment}>
            <label>
              Your note
              <textarea name="body" required maxLength={500} />
            </label>
            <p className="local-note">
              This note is public. Notes on spoiler reviews stay behind the
              spoiler reveal.
            </p>
            <ErrorMessage message={dialogError} />
            <button className="primary-btn" disabled={busy}>
              {busy ? "Adding…" : "Add note ↗"}
            </button>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}
