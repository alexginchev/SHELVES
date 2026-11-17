import { useCursorPages } from "./useCursorPages";
import { ActivityMore } from "./PagedFeed";
import { useCallback, useEffect, useState } from "react";
import type {
  Notification,
  NotificationInbox,
  Post,
  User,
} from "../shared/types";
import { api } from "./api";
import { Avatar, ErrorMessage, PostCard } from "./components";
const emptyInbox: NotificationInbox = {
  items: [],
  unread: 0,
  nextCursor: null,
};
export function Notifications({
  revision,
  onChanged,
}: {
  revision: number;
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0),
    [unreadOnly, setUnreadOnly] = useState(false);
  const inbox = useCursorPages<NotificationInbox>(
    "/notifications?filter=" + (unreadOnly ? "unread" : "all"),
    revision + retry,
    emptyInbox,
  );
  async function read(item?: Notification, open = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(
        item ? `/notifications/${item.id}/read` : "/notifications/read-all",
        { method: item ? "PATCH" : "POST" },
      );
      await onChanged();
      if (open && item)
        location.hash =
          item.kind === "follow"
            ? `reader/${item.actorId}`
            : `post/${item.postId}`;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update notifications.",
      );
    } finally {
      setBusy(false);
    }
  }
  const items = inbox.items;
  return (
    <section className="view-panel">
      <span className="section-kicker">FROM YOUR READING CIRCLE</span>
      <h2>A little bookish activity.</h2>
      <p className="view-intro">
        New follows, appreciations, and notes on your public posts. Only you can
        see this inbox.
      </p>
      <div className="notification-tools">
        <div className="feed-filters">
          {[false, true].map((value) => (
            <button
              key={String(value)}
              className={`filter-btn ${unreadOnly === value ? "active" : ""}`}
              aria-pressed={unreadOnly === value}
              disabled={busy || inbox.busy}
              onClick={() => {
                setError("");
                setUnreadOnly(value);
              }}
            >
              {value ? "Unread" : "All activity"}
            </button>
          ))}
        </div>
        <button
          className="outline-btn"
          disabled={busy || inbox.busy}
          onClick={() => {
            setRetry(retry + 1);
          }}
        >
          Refresh activity
        </button>
        {inbox?.unread ? (
          <button
            className="plain-link"
            disabled={busy || inbox.busy}
            onClick={() => void read()}
          >
            Mark all as read
          </button>
        ) : null}
      </div>
      <ErrorMessage message={error} />
      {
        <>
          <p className="search-source">
            {inbox.unread} unread · {inbox.items.length} notifications loaded
          </p>
          <div className="notification-list">
            {items.map((item) => (
              <article
                className={`notification-item ${item.readAt ? "" : "unread"}`}
                key={item.id}
              >
                <Avatar name={item.displayName} />
                <div className="notification-content">
                  <a
                    className="reader-link"
                    href={
                      item.kind === "follow"
                        ? `#reader/${item.actorId}`
                        : `#post/${item.postId}`
                    }
                    onClick={(e) => {
                      if (
                        !e.ctrlKey &&
                        !e.metaKey &&
                        !e.shiftKey &&
                        e.button === 0
                      ) {
                        e.preventDefault();
                        void read(item, true);
                      }
                    }}
                  >
                    <strong>{item.displayName}</strong>{" "}
                    {item.kind === "follow"
                      ? "started following you."
                      : item.kind === "like"
                        ? "appreciated your post."
                        : "left a note on your post."}
                  </a>
                  <small>
                    {new Date(
                      item.createdAt.includes("T")
                        ? item.createdAt
                        : item.createdAt.replace(" ", "T") + "Z",
                    ).toLocaleString()}
                    {item.readAt ? "" : " · Unread"}
                  </small>
                </div>
                {!item.readAt ? (
                  <button
                    className="plain-link"
                    disabled={busy || inbox.busy}
                    onClick={() => void read(item)}
                  >
                    Mark read
                  </button>
                ) : null}
              </article>
            ))}
          </div>
          <ActivityMore
            activity={inbox}
            moreLabel="Load older notifications"
            loadingLabel="Loading notifications…"
            endLabel="You’ve reached the end of this activity."
            disabled={busy}
          />
          {!items.length && !inbox.busy && !inbox.error ? (
            <div className="empty-state">
              <h3>
                {unreadOnly
                  ? "You are all caught up."
                  : "Your next conversation starts here."}
              </h3>
              <p>
                {unreadOnly
                  ? "There are no unread notifications."
                  : "New activity on your posts and new followers will appear here."}
              </p>
              <a className="outline-btn" href="#community">
                Visit your reading circle
              </a>
            </div>
          ) : null}
        </>
      }
    </section>
  );
}
export function PostPage({
  id,
  user,
  revision,
  onLike,
  onComment,
  onDelete,
}: {
  id: string;
  user: User | null;
  revision: number;
  onLike: (post: Post) => void;
  onComment: (post: Post) => void;
  onDelete: (post: Post) => void;
}) {
  const [post, setPost] = useState<Post | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const load = useCallback(
    (signal: AbortSignal) => {
      void api<{ post: Post }>(`/posts/${id}`, { signal })
        .then((data) => {
          if (!signal.aborted) {
            setPost(data.post);
            setError("");
          }
        })
        .catch((e) => {
          if (!signal.aborted)
            setError(
              e instanceof Error ? e.message : "Could not load this post.",
            );
        });
    },
    [id],
  );
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, revision, retry]);
  return (
    <>
      <section className="view-panel">
        <a className="plain-link" href="#notifications">
          ← Notifications
        </a>
        <h2>A conversation worth keeping.</h2>
        {error ? (
          <>
            <ErrorMessage message={error} />
            <button className="outline-btn" onClick={() => setRetry(retry + 1)}>
              Retry post
            </button>
          </>
        ) : !post ? (
          <p role="status">Opening this conversation…</p>
        ) : (
          <p className="view-intro">Public notes from your reading circle.</p>
        )}
      </section>
      {post && !error ? (
        <PostCard
          post={post}
          user={user}
          onLike={onLike}
          onComment={onComment}
          onDelete={onDelete}
        />
      ) : null}
    </>
  );
}
