import { useEffect, useRef, type ReactNode } from "react";
import type { Book, Post, User } from "../shared/types";
export function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    home: <path d="m3 10 9-7 9 7v10H15v-7H9v7H3Z" />,
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="6.8" />
        <path d="m16 16 5 5" />
      </>
    ),
    shelves: (
      <>
        <path d="M5 3h14v18H7a2 2 0 0 1-2-2zM5 18h14M9 7h6M9 10h6" />
      </>
    ),
    journal: (
      <>
        <path d="m4 16-.8 5 5-1L21 7l-4-4zM14 6l4 4" />
      </>
    ),
    community: (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M3 20v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6M19 20v-3a6 6 0 0 0-2-4" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4 21c0-9 16-9 16 0" />
      </>
    ),
    leaf: (
      <>
        <path d="M4 21C12 15 18 9 20 3M8 17C3 11 7 6 12 7c0 5-1 8-4 10ZM13 12C11 5 17 2 21 3c0 5-3 8-8 9Z" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    heart: <path d="M20 5c-4-4-8 1-8 1S8 1 4 5c-5 5 8 15 8 15s13-10 8-15Z" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name] || paths.shelves}
    </svg>
  );
}
export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar avatar-you" aria-hidden="true">
      {name[0]?.toUpperCase() || "R"}
    </span>
  );
}
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="book-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        closeRef.current();
      }}
    >
      <button
        className="app-dialog-close"
        onClick={onClose}
        aria-label="Close dialog"
      >
        ×
      </button>
      {children}
    </dialog>
  );
}
export function Cover({
  book,
  small = false,
}: {
  book: Book;
  small?: boolean;
}) {
  return book.cover ? (
    <img
      className={small ? "real-cover small-cover" : "real-cover"}
      src={book.cover}
      alt={`${book.title} cover`}
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.display = "none";
        e.currentTarget.nextElementSibling?.classList.remove("cover-hidden");
      }}
    />
  ) : (
    <PaperCover book={book} small={small} />
  );
}
export function PaperCover({
  book,
  small = false,
  hidden = false,
}: {
  book: Book;
  small?: boolean;
  hidden?: boolean;
}) {
  return (
    <div
      className={`${small ? "mini-cover" : "large-cover"} paper-cover color-${book.color} ${hidden ? "cover-hidden" : ""}`}
    >
      <span className="cover-small">A SHELVES PICK</span>
      <strong>{book.title.toUpperCase()}</strong>
      <span className="cover-flower">✿</span>
      <small>{book.author.toUpperCase()}</small>
    </div>
  );
}
export function BookCard({
  book,
  reason,
  onOpen,
  onDismiss,
}: {
  book: Book;
  reason?: string;
  onOpen: (b: Book) => void;
  onDismiss?: (b: Book) => void;
}) {
  return (
    <article className="book-tile">
      <button
        className="book-open"
        onClick={() => onOpen(book)}
        aria-label={`Open ${book.title}`}
      >
        <Cover book={book} />
        {book.cover ? <PaperCover book={book} hidden /> : null}
        <h3>{book.title}</h3>
      </button>
      <p>{book.author}</p>
      <span className="tag tag-sage">{book.genre}</span>
      {reason ? <p className="recommendation-reason">{reason}</p> : null}
      <button className="outline-btn" onClick={() => onOpen(book)}>
        View book ↗
      </button>
      {onDismiss ? (
        <button className="dismiss-book" onClick={() => onDismiss(book)}>
          Not interested
        </button>
      ) : null}
    </article>
  );
}
export function PostCard({
  post,
  user,
  onLike,
  onComment,
  onDelete,
  onEdit,
}: {
  post: Post;
  user: User | null;
  onLike: (p: Post) => void;
  onComment: (p: Post) => void;
  onDelete: (p: Post) => void;
  onEdit?: (p: Post) => void;
}) {
  const content = (
    <>
      <p className={`post-copy ${post.kind === "quote" ? "quote-copy" : ""}`}>
        {post.body}
      </p>
      {post.comments.map((c) => (
        <div className="comment-line" key={c.id}>
          <strong>{c.displayName}</strong> <span>{c.body}</span>
        </div>
      ))}
    </>
  );
  return (
    <article className="post-card">
      <div className="post-head">
        <Avatar name={post.displayName} />
        <div className="post-author">
          <strong>{post.displayName}</strong>
          <small>
            @{post.username} · {new Date(post.createdAt).toLocaleDateString()}
          </small>
        </div>
        <span className="tag tag-sage">{post.kind}</span>
      </div>
      {post.rating > 0 ? (
        <p
          className="review-rating"
          aria-label={`${post.rating} out of 5 stars`}
        >
          {"★".repeat(post.rating)}
          {"☆".repeat(5 - post.rating)}{" "}
          <span>
            {post.rating}/5{post.editedAt ? " · edited" : ""}
          </span>
        </p>
      ) : null}
      {post.containsSpoilers ? (
        <details className="spoiler-review">
          <summary>Contains spoilers — reveal review and notes</summary>
          {content}
        </details>
      ) : (
        content
      )}
      {post.bookTitle ? (
        <div className="post-book-chip">
          Reading alongside:{" "}
          {post.bookId ? (
            <a href={`#book/${post.bookId}`}>
              <strong>{post.bookTitle} ↗</strong>
            </a>
          ) : (
            <strong>{post.bookTitle}</strong>
          )}
        </div>
      ) : null}
      <div className="post-actions">
        <button
          className={`like-btn ${post.liked ? "liked" : ""}`}
          onClick={() => onLike(post)}
          aria-pressed={post.liked}
        >
          <Icon name="heart" />
          <b>{post.likes}</b> appreciations
        </button>
        <button className="comment-btn" onClick={() => onComment(post)}>
          {post.comments.length} notes
        </button>
        {user?.id === post.userId ? (
          <>
            {post.kind === "review" && post.bookId && onEdit ? (
              <button className="edit-review" onClick={() => onEdit(post)}>
                Edit review
              </button>
            ) : null}
            <button className="delete-post" onClick={() => onDelete(post)}>
              Delete post
            </button>
          </>
        ) : null}
      </div>
    </article>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p className="form-error" role="alert">
      {message}
    </p>
  ) : null;
}
