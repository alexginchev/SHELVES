import { api } from "./api";
import { CommentActions } from "./CommentActions";
import { createPortal } from "react-dom";
import { ReportButton } from "./SocialSafety";
import { ReaderName } from "./ShelvesBadge";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormHTMLAttributes,
  type ReactNode,
} from "react";
import type { Book, Post, User, Comment } from "../shared/types";
export function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </>
    ),
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
    back: <path d="m10 5-7 7 7 7M3 12h18" />,
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    share: (
      <>
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="5" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m9 10 6-3M9 14l6 3" />
      </>
    ),
    trash: <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />,
    flag: <path d="M5 21V3c5-3 9 3 14 0v10c-5 3-9-3-14 0" />,
    chevron: <path d="m8 10 4 4 4-4" />,
    comment: <path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0Z" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5M20 12a8 8 0 0 0-14-5M4 12a8 8 0 0 0 14 5" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7h.01" />
      </>
    ),
    star: (
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />
    ),
    sparkles: (
      <path d="m10 3 2.4 6.6L19 12l-6.6 2.4L10 21l-2.4-6.6L1 12l6.6-2.4ZM20 2v5M17.5 4.5h5" />
    ),
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
export function Avatar({ name, src }: { name: string; src?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (src && !failed)
    return (
      <img
        className="avatar avatar-you avatar-image"
        src={src}
        alt=""
        onError={() => setFailed(true)}
      />
    );
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
  dirty = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  dirty?: boolean;
}) {
  const [confirmClose, setConfirmClose] = useState(false);
  const requestClose = () => (dirty ? setConfirmClose(true) : onClose());
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = requestClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="book-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        closeRef.current();
      }}
    >
      <div className="dialog-topline">
        <button
          className="app-dialog-close"
          onClick={requestClose}
          aria-label="Close dialog"
        >
          ×
        </button>
      </div>
      {children}
      {confirmClose && (
        <Dialog title="Discard changes?" onClose={() => setConfirmClose(false)}>
          <h2>Discard changes?</h2>
          <p>Your unsaved changes will be lost.</p>
          <div className="list-actions">
            <button
              className="outline-btn"
              autoFocus
              onClick={() => setConfirmClose(false)}
            >
              Keep editing
            </button>
            <button className="primary-btn" onClick={onClose}>
              Discard changes
            </button>
          </div>
        </Dialog>
      )}
    </dialog>,
    document.body,
  );
}
export function Cover({
  book,
  small = false,
}: {
  book: Book;
  small?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [book.cover]);
  return book.cover && !failed ? (
    <img
      className={small ? "real-cover small-cover" : "real-cover"}
      src={book.cover}
      alt={`${book.title} cover`}
      loading="lazy"
      onError={() => setFailed(true)}
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
      aria-hidden="true"
    >
      <span className="cover-small">A SHELVES PICK</span>
      <strong title={book.title}>{book.title.toUpperCase()}</strong>
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
      <a
        className="book-open"
        href={`#book/${book.id}`}
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
          onOpen(book);
        }}
        aria-label={`Open ${book.title}`}
      >
        <Cover book={book} />
        <h3>{book.title}</h3>
      </a>
      <p>{book.author}</p>
      <span className="tag tag-sage">{book.genre}</span>
      {reason ? <p className="recommendation-reason">{reason}</p> : null}
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
  compact = false,
}: {
  post: Post;
  user: User | null;
  onLike: (p: Post) => void;
  onComment: (p: Post) => void;
  onDelete: (p: Post) => void;
  onEdit?: (p: Post) => void;
  compact?: boolean;
}) {
  const [comments, setComments] = useState(post.comments);
  const [nextComments, setNextComments] = useState(post.commentsCursor),
    [commentCount, setCommentCount] = useState(
      post.commentCount ?? post.comments.length,
    ),
    [commentsBusy, setCommentsBusy] = useState(false),
    [commentsError, setCommentsError] = useState("");
  const commentsRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    commentsRequest.current?.abort();
    commentsRequest.current = null;
    setComments(post.comments);
    setNextComments(post.commentsCursor);
    setCommentCount(post.commentCount ?? post.comments.length);
    setCommentsBusy(false);
    setCommentsError("");
    return () => commentsRequest.current?.abort();
  }, [post.comments, post.commentsCursor, post.commentCount, user?.id]);
  async function olderComments() {
    if (!nextComments || commentsRequest.current) return;
    const controller = new AbortController();
    commentsRequest.current = controller;
    setCommentsBusy(true);
    setCommentsError("");
    try {
      const page = await api<{
        items: Comment[];
        nextCursor: string | null;
        total: number;
      }>(
        `/posts/${post.id}/comments?before=${encodeURIComponent(nextComments)}`,
        {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        },
      );
      if (!controller.signal.aborted) {
        setComments((old) => [
          ...old,
          ...page.items.filter((c) => !old.some((x) => x.id === c.id)),
        ]);
        setNextComments(page.nextCursor);
        setCommentCount(page.total);
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setCommentsError(
          e instanceof Error ? e.message : "Could not load older notes.",
        );
    } finally {
      if (!controller.signal.aborted) {
        setCommentsBusy(false);
        commentsRequest.current = null;
      }
    }
  }
  const conversation = (
    <>
      {[...comments].reverse().map((c) => (
        <div className="comment-line" key={c.id}>
          <strong>{c.displayName}</strong> <span>{c.body}</span>
          {user?.id === c.userId ? (
            <CommentActions
              comment={c}
              onSaved={(body) => {
                if (body === null) setCommentCount((n) => Math.max(0, n - 1));
                setComments((old) =>
                  body === null
                    ? old.filter((x) => x.id !== c.id)
                    : old.map((x) => (x.id === c.id ? { ...x, body } : x)),
                );
              }}
            />
          ) : null}
          {user && user.id !== c.userId ? (
            <ReportButton kind="comment" targetId={c.id} />
          ) : null}
        </div>
      ))}
      <ErrorMessage message={commentsError} />
      {commentsBusy ? (
        <p role="status">Loading older notes…</p>
      ) : nextComments ? (
        <button className="outline-btn" onClick={() => void olderComments()}>
          {commentsError ? "Try again" : "Load older notes"}
        </button>
      ) : null}
    </>
  );
  const content = (
    <>
      <p className={`post-copy ${post.kind === "quote" ? "quote-copy" : ""}`}>
        {post.body}
      </p>
      {compact ? (
        commentCount > 0 ? (
          <details className="post-conversation">
            <summary>
              {commentCount} {commentCount === 1 ? "note" : "notes"} in this
              conversation
            </summary>
            {conversation}
          </details>
        ) : null
      ) : (
        conversation
      )}
    </>
  );
  return (
    <article className={`post-card ${compact ? "social-post" : ""}`}>
      {compact && post.feedReason ? (
        <p className="post-feed-reason">
          <Icon name="sparkles" />
          {post.feedReason}
        </p>
      ) : null}
      <div className="post-head">
        <Avatar
          name={post.displayName}
          src={
            post.avatarVersion
              ? `/api/readers/${post.userId}/images/avatar?v=${post.avatarVersion}`
              : undefined
          }
        />
        <div className="post-author">
          <a className="reader-link" href={`#reader/${post.userId}`}>
            <strong>
              <ReaderName name={post.displayName} verified={post.isAdmin} />
            </strong>
          </a>
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
          aria-label={
            compact
              ? `${post.liked ? "Remove appreciation" : "Appreciate post"} (${post.likes})`
              : undefined
          }
          title={compact ? "Appreciate post" : undefined}
        >
          <Icon name="heart" />
          <b>{post.likes}</b> {compact ? null : "appreciations"}
        </button>
        <button
          className="comment-btn"
          onClick={() => onComment(post)}
          aria-label={compact ? `Add a note (${commentCount})` : undefined}
          title={compact ? "Add a note" : undefined}
        >
          {compact ? <Icon name="comment" /> : null}
          {commentCount} {compact ? null : "notes"}
        </button>
        {user && user.id !== post.userId ? (
          <ReportButton kind="post" targetId={post.id} compact={compact} />
        ) : null}
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
// Keep platform constraints, but present errors inside the application.
export function Form({
  onSubmit,
  children,
  ...props
}: FormHTMLAttributes<HTMLFormElement>) {
  const errorId = useId();
  const [message, setMessage] = useState("");
  function clear(form: HTMLFormElement) {
    for (const field of Array.from(form.elements)) {
      if (field.getAttribute("aria-describedby") === errorId) {
        field.removeAttribute("aria-invalid");
        field.removeAttribute("aria-describedby");
      }
    }
  }
  return (
    <form
      {...props}
      noValidate
      onInput={(e) => {
        clear(e.currentTarget);
        setMessage("");
      }}
      onSubmit={(e) => {
        clear(e.currentTarget);
        const invalid = Array.from(e.currentTarget.elements).find(
          (
            field,
          ): field is
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
            (field instanceof HTMLInputElement ||
              field instanceof HTMLTextAreaElement ||
              field instanceof HTMLSelectElement) &&
            !field.validity.valid,
        );
        if (invalid) {
          e.preventDefault();
          invalid.setAttribute("aria-invalid", "true");
          invalid.setAttribute("aria-describedby", errorId);
          setMessage(invalid.validationMessage);
          invalid.focus();
          invalid.scrollIntoView({ block: "center" });
        } else {
          setMessage("");
          onSubmit?.(e);
        }
      }}
    >
      {message ? (
        <p id={errorId} className="form-error" role="alert">
          {message}
        </p>
      ) : null}
      {children}
    </form>
  );
}
