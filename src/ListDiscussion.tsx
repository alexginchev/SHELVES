import { ReportButton } from "./SocialSafety";
import { useEffect, useRef, useState } from "react";
import type { BookList, User } from "../shared/types";
import type { ListComment, ListConversation } from "../shared/list-comments";
import { api, json } from "./api";
import { Avatar, Dialog, ErrorMessage, Form } from "./components";

export function ListDiscussion({
  list,
  user,
  onAuth,
}: {
  list: BookList;
  user: User | null;
  onAuth: () => void;
}) {
  const [data, setData] = useState<ListConversation | null>(null),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [deleting, setDeleting] = useState<ListComment | null>(null),
    [deleteError, setDeleteError] = useState("");
  const request = useRef({ id: crypto.randomUUID(), body: "" });
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    api<ListConversation>(`/lists/${list.id}/comments?page=${page}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [list.id, list.visibility, user?.id, page, revision]);
  return (
    <section className="view-panel list-discussion">
      <span className="section-kicker">BETWEEN READERS</span>
      <h2>Talk about this collection.</h2>
      <p>
        {list.visibility === "public"
          ? "Share a recommendation or ask about a book. Comments are public; please avoid spoilers."
          : "This list is private. Earlier comments are visible only to you. Publish the list to reopen the conversation."}
      </p>
      {list.visibility === "public" ? (
        user ? (
          <Form
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError("");
              setNotice("");
              const body = draft.trim();
              if (request.current.body !== body)
                request.current = { id: crypto.randomUUID(), body };
              try {
                await api(
                  `/lists/${list.id}/comments`,
                  json("POST", request.current),
                );
                if (!active.current) return;
                setDraft("");
                request.current = { id: crypto.randomUUID(), body: "" };
                setNotice("Comment added.");
                setPage(1);
                setRevision((r) => r + 1);
              } catch (e) {
                if (active.current)
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Could not add your comment.",
                  );
              } finally {
                if (active.current) setBusy(false);
              }
            }}
          >
            <label>
              Your comment
              <textarea
                className="resize-none"
                required
                maxLength={1000}
                value={draft}
                disabled={busy}
                onChange={(e) => setDraft(e.target.value)}
              />
            </label>
            <button className="primary-btn" disabled={busy || loading}>
              {busy ? "Adding…" : "Add comment"}
            </button>
          </Form>
        ) : (
          <button className="outline-btn" onClick={onAuth}>
            Sign in to comment
          </button>
        )
      ) : null}
      <ErrorMessage message={error} />
      {error ? (
        <button
          className="outline-btn"
          onClick={() => setRevision((r) => r + 1)}
        >
          Refresh conversation
        </button>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {loading ? (
        <p role="status">Loading conversation…</p>
      ) : data ? (
        <>
          <p className="discussion-count">
            {data.total} {data.total === 1 ? "comment" : "comments"} · Newest
            first
          </p>
          {data.items.length ? (
            <div className="discussion-comments">
              {data.items.map((comment) => (
                <article className="discussion-comment" key={comment.id}>
                  <div className="discussion-author">
                    <Avatar name={comment.displayName} />
                    <a
                      className="reader-link"
                      href={`#reader/${comment.userId}`}
                    >
                      {comment.displayName}
                    </a>
                    <time dateTime={comment.createdAt}>
                      {new Date(comment.createdAt).toLocaleDateString()}
                    </time>
                  </div>
                  <p className="discussion-body">{comment.body}</p>
                  {user && user.id !== comment.userId ? (
                    <ReportButton kind="list_comment" targetId={comment.id} />
                  ) : null}
                  {user &&
                  (user.id === comment.userId || user.id === list.userId) ? (
                    <button
                      className="plain-link"
                      disabled={busy}
                      onClick={() => {
                        setDeleteError("");
                        setDeleting(comment);
                      }}
                    >
                      Delete comment
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">
              No comments yet. Start the conversation with a book
              recommendation.
            </p>
          )}
          <nav className="account-actions" aria-label="Conversation pages">
            <button
              className="outline-btn"
              disabled={busy || data.page <= 1}
              onClick={() => setPage(data.page - 1)}
            >
              Newer comments
            </button>
            <span>
              Page {data.page} of {data.pages}
            </span>
            <button
              className="outline-btn"
              disabled={busy || data.page >= data.pages}
              onClick={() => setPage(data.page + 1)}
            >
              Older comments
            </button>
          </nav>
        </>
      ) : null}
      {deleting ? (
        <Dialog
          title="Delete comment"
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <h2>Delete this comment?</h2>
          <p>This permanently removes the comment from the collection.</p>
          <ErrorMessage message={deleteError} />
          <div className="account-actions">
            <button
              className="outline-btn"
              autoFocus
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Keep comment
            </button>
            <button
              className="primary-btn"
              disabled={busy}
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                setDeleteError("");
                try {
                  await api(`/lists/${list.id}/comments/${deleting.id}`, {
                    method: "DELETE",
                  });
                  if (!active.current) return;
                  setDeleting(null);
                  setNotice("Comment deleted.");
                  setRevision((r) => r + 1);
                } catch (e) {
                  if (active.current)
                    setDeleteError(
                      e instanceof Error
                        ? e.message
                        : "Could not delete the comment.",
                    );
                } finally {
                  if (active.current) setBusy(false);
                }
              }}
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}
