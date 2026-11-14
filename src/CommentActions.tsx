import { useState } from "react";
import type { Comment } from "../shared/types";
import { api, json } from "./api";
import { Dialog, ErrorMessage, Form } from "./components";
export function CommentActions({
  comment,
  onSaved,
}: {
  comment: Comment;
  onSaved: (body: string | null) => void;
}) {
  const [action, setAction] = useState<"edit" | "delete" | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(body?: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(
        "/comments/" + comment.id,
        body === undefined
          ? { method: "DELETE" }
          : json("PATCH", { body, originalBody: comment.body }),
      );
      onSaved(body ?? null);
      setAction(null);
      window.dispatchEvent(new Event("shelves-safety-changed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update comment.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="safety-actions">
        <button
          className="plain-link"
          onClick={() => {
            setError("");
            setAction("edit");
          }}
        >
          Edit comment
        </button>
        <button
          className="plain-link"
          onClick={() => {
            setError("");
            setAction("delete");
          }}
        >
          Delete comment
        </button>
      </div>
      {action ? (
        <Dialog
          title={action === "edit" ? "Edit comment" : "Delete comment?"}
          onClose={() => {
            if (!busy) setAction(null);
          }}
        >
          <h2>{action === "edit" ? "Edit comment" : "Delete comment?"}</h2>
          {action === "edit" ? (
            <Form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void save(
                  String(new FormData(e.currentTarget).get("body") || ""),
                );
              }}
            >
              <label>
                Your comment
                <textarea
                  className="resize-none"
                  name="body"
                  defaultValue={comment.body}
                  required
                  maxLength={500}
                  disabled={busy}
                />
              </label>
              <ErrorMessage message={error} />
              <button className="primary-btn" disabled={busy}>
                {busy ? "Saving…" : "Save comment"}
              </button>
            </Form>
          ) : (
            <>
              <p>
                This permanently removes your comment from the conversation.
              </p>
              <div className="safety-actions">
                <button
                  className="outline-btn"
                  disabled={busy}
                  onClick={() => setAction(null)}
                >
                  Cancel
                </button>
                <button
                  className="primary-btn"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  Delete comment
                </button>
              </div>
              <ErrorMessage message={error} />
            </>
          )}
        </Dialog>
      ) : null}
    </>
  );
}
