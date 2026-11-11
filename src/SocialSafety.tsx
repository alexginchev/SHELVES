import { useEffect, useState } from "react";
import type { User } from "../shared/types";
import { api, json } from "./api";
import { Dialog, ErrorMessage, Form } from "./components";

export function ReportButton({
  kind,
  targetId,
}: {
  kind: "post" | "comment" | "reader" | "list_comment";
  targetId: string;
}) {
  const label = kind === "list_comment" ? "list comment" : kind;
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  return (
    <>
      <button
        className="plain-link"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        Report {label}
      </button>
      {open ? (
        <Dialog
          title={sent ? "Report received" : "Report " + label}
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <h2>{sent ? "Report received" : "Report " + label}</h2>
          {sent ? (
            <>
              <p role="status">
                Your report was sent to the Shelves administrators. Your
                identity is not shared with the reported reader.
              </p>
              <button className="outline-btn" onClick={() => setOpen(false)}>
                Close
              </button>
            </>
          ) : (
            <Form
              noValidate
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                const data = new FormData(e.currentTarget);
                setBusy(true);
                setError("");
                try {
                  await api(
                    "/reports",
                    json("POST", {
                      kind,
                      targetId,
                      reason: data.get("reason"),
                      details: data.get("details"),
                    }),
                  );
                  setSent(true);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Could not send report.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <p>
                Tell us what needs review. Reporting does not automatically
                remove content.
              </p>
              <label>
                Reason
                <select name="reason" aria-label="Reason" disabled={busy}>
                  {[
                    "Spam",
                    "Harassment",
                    "Hate or threats",
                    "Inappropriate content",
                    "Other",
                  ].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label>
                Additional details (optional)
                <textarea
                  className="resize-none"
                  name="details"
                  maxLength={1000}
                  rows={4}
                  disabled={busy}
                />
              </label>
              <ErrorMessage message={error} />
              <button className="primary-btn" disabled={busy}>
                {busy ? "Sending…" : "Send report"}
              </button>
            </Form>
          )}
        </Dialog>
      ) : null}
    </>
  );
}
type Control = {
  id: string;
  kind: "block" | "mute";
  username: string;
  displayName: string;
};
function changed() {
  window.dispatchEvent(new Event("shelves-safety-changed"));
}
export function ReaderControls({ targetId }: { targetId: string }) {
  const [items, setItems] = useState<Control[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setItems(null);
    setError("");
    api<{ items: Control[] }>("/me/reader-controls", { signal: c.signal })
      .then((r) => {
        if (!c.signal.aborted) setItems(r.items);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [targetId, revision]);
  const blocked = items?.some((x) => x.id === targetId && x.kind === "block"),
    muted = items?.some((x) => x.id === targetId && x.kind === "mute");
  async function save(kind: "block" | "mute", remove: boolean) {
    setBusy(true);
    setError("");
    try {
      await api(`/readers/${targetId}/controls/${kind}`, {
        method: remove ? "DELETE" : "PUT",
      });
      setConfirm(false);
      setRevision((x) => x + 1);
      changed();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update reader controls.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="reader-safety">
      <div className="safety-actions">
        <button
          className="plain-link"
          disabled={busy || !items}
          onClick={() => void save("mute", !!muted)}
        >
          {muted ? "Unmute reader" : "Mute reader"}
        </button>
        <button
          className="plain-link"
          disabled={busy || !items}
          onClick={() =>
            blocked ? void save("block", true) : setConfirm(true)
          }
        >
          {blocked ? "Unblock reader" : "Block reader"}
        </button>
        <ReportButton kind="reader" targetId={targetId} />
      </div>
      <p>
        {blocked
          ? "You blocked this reader. Unblocking will not restore follows."
          : muted
            ? "This reader’s activity is hidden for you."
            : "Mute to hide activity, or block to stop direct interactions."}
      </p>
      <ErrorMessage message={error} />
      {error && !items ? (
        <button
          className="plain-link"
          onClick={() => setRevision((x) => x + 1)}
        >
          Try again
        </button>
      ) : null}
      {confirm ? (
        <Dialog
          title="Block this reader?"
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <h2>Block this reader?</h2>
          <p>
            This removes follows in both directions and prevents likes,
            comments, and new follows between your accounts. Public content can
            still be seen when signed out.
          </p>
          <div className="safety-actions">
            <button
              className="outline-btn"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Cancel
            </button>
            <button
              className="primary-btn"
              disabled={busy}
              onClick={() => void save("block", false)}
            >
              Block reader
            </button>
          </div>
          <ErrorMessage message={error} />
        </Dialog>
      ) : null}
    </div>
  );
}
export function SafetySettings({ user }: { user: User | null }) {
  const [items, setItems] = useState<Control[] | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState("");
  useEffect(() => {
    const c = new AbortController();
    setItems(null);
    setError("");
    if (user)
      api<{ items: Control[] }>("/me/reader-controls", { signal: c.signal })
        .then((r) => {
          if (!c.signal.aborted) setItems(r.items);
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(e.message);
        });
    return () => c.abort();
  }, [user?.id, revision]);
  return (
    <section className="view-panel">
      <h2>Your reading circle controls</h2>
      <p>
        Manage readers you have muted or blocked. Unblocking does not restore
        follows.
      </p>
      {!user ? (
        <p>Sign in to manage your controls.</p>
      ) : (
        <>
          <ErrorMessage message={error} />
          {error ? (
            <button
              className="outline-btn"
              onClick={() => setRevision((x) => x + 1)}
            >
              Try again
            </button>
          ) : null}
          {!items && !error ? (
            <p role="status">Loading reader controls…</p>
          ) : null}
          {items?.length === 0 ? (
            <div className="empty-state">
              No muted or blocked readers. Open a reader’s profile to manage
              interactions.
            </div>
          ) : null}
          {items?.map((r) => (
            <div className="safety-entry" key={r.id + r.kind}>
              <div>
                <a href={`#reader/${r.id}`}>{r.displayName}</a>
                <p>
                  @{r.username} · {r.kind === "block" ? "Blocked" : "Muted"}
                </p>
              </div>
              <button
                className="outline-btn"
                disabled={!!busy}
                onClick={async () => {
                  setBusy(r.id);
                  setError("");
                  try {
                    await api(`/readers/${r.id}/controls/${r.kind}`, {
                      method: "DELETE",
                    });
                    setRevision((x) => x + 1);
                    changed();
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not update controls.",
                    );
                  } finally {
                    setBusy("");
                  }
                }}
              >
                {r.kind === "block" ? "Unblock" : "Unmute"}
              </button>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
type Report = {
  id: string;
  kind: "post" | "comment" | "reader" | "list_comment";
  targetId: string;
  reason: string;
  details: string;
  status: string;
  createdAt: string;
  reporter: string;
  content: string;
};
export function AdminReports({ user }: { user: User | null }) {
  const [data, setData] = useState<{
      items: Report[];
      pages: number;
      page: number;
      total: number;
    } | null>(null),
    [status, setStatus] = useState("open"),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [action, setAction] = useState<{
      report: Report;
      action: "dismiss" | "remove";
    } | null>(null);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError("");
    if (user?.isAdmin)
      api<typeof data>(`/admin/reports?status=${status}&page=${page}`, {
        signal: c.signal,
      })
        .then((r) => {
          if (!c.signal.aborted) setData(r);
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(e.message);
        });
    return () => c.abort();
  }, [user?.id, user?.isAdmin, status, page, revision]);
  return (
    <section className="view-panel">
      <h2>Community reports</h2>
      {!user?.isAdmin ? (
        <p>Administrator access is required.</p>
      ) : (
        <>
          <p>
            Review reports privately. Remove posts or comments only after
            reviewing the content. Use account moderation to suspend or restore
            a reader’s access.
          </p>
          <a className="outline-btn" href="#moderation-accounts">
            Account moderation
          </a>
          <label>
            Report status
            <select
              aria-label="Report status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="open">Open</option>
              <option value="dismissed">Dismissed</option>
              <option value="removed">Removed</option>
            </select>
          </label>
          <ErrorMessage message={error} />
          {error ? (
            <button
              className="outline-btn"
              onClick={() => setRevision((x) => x + 1)}
            >
              Try again
            </button>
          ) : null}
          {!data && !error ? <p role="status">Loading reports…</p> : null}
          {data?.items.length === 0 ? (
            <p className="empty-state">No {status} reports.</p>
          ) : null}
          {data?.items.map((r) => (
            <article className="report-entry" key={r.id}>
              <h3>
                {r.reason} ·{" "}
                {r.kind === "list_comment" ? "list comment" : r.kind}
              </h3>
              <p>
                Reported by @{r.reporter} ·{" "}
                {new Date(r.createdAt).toLocaleString()}
              </p>
              <blockquote className="preserve-lines">{r.content}</blockquote>
              {r.details ? <p className="preserve-lines">{r.details}</p> : null}
              <div className="safety-actions">
                {r.kind !== "comment" && r.kind !== "list_comment" ? (
                  <a
                    className="plain-link"
                    href={`#${r.kind === "reader" ? "reader" : "post"}/${r.targetId}`}
                  >
                    View {r.kind}
                  </a>
                ) : null}
                {r.status === "open" ? (
                  <>
                    <button
                      className="outline-btn"
                      onClick={() =>
                        setAction({ report: r, action: "dismiss" })
                      }
                    >
                      Dismiss report
                    </button>
                    {r.kind !== "reader" ? (
                      <button
                        className="plain-link"
                        onClick={() =>
                          setAction({ report: r, action: "remove" })
                        }
                      >
                        Remove{" "}
                        {r.kind === "list_comment" ? "list comment" : r.kind}
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </article>
          ))}
          {data && data.pages > 1 ? (
            <div className="safety-actions">
              <button
                className="outline-btn"
                disabled={data.page === 1}
                onClick={() => setPage(data.page - 1)}
              >
                Previous
              </button>
              <span>
                Page {data.page} of {data.pages}
              </span>
              <button
                className="outline-btn"
                disabled={data.page === data.pages}
                onClick={() => setPage(data.page + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
          {action ? (
            <Dialog
              title={
                action.action === "remove"
                  ? "Remove reported content?"
                  : "Dismiss this report?"
              }
              onClose={() => {
                if (!busy) setAction(null);
              }}
            >
              <h2>
                {action.action === "remove"
                  ? "Remove reported content?"
                  : "Dismiss this report?"}
              </h2>
              <p>
                {action.action === "remove"
                  ? "This permanently deletes the reported " +
                    (action.report.kind === "list_comment"
                      ? "list comment"
                      : action.report.kind) +
                    ". Removing a post also removes its comments and likes."
                  : "This closes the report without removing content."}
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
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await api(
                        `/admin/reports/${action.report.id}/resolve`,
                        json("POST", { action: action.action }),
                      );
                      setAction(null);
                      setRevision((x) => x + 1);
                      changed();
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Could not resolve report.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {action.action === "remove"
                    ? "Remove content"
                    : "Dismiss report"}
                </button>
              </div>
              <ErrorMessage message={error} />
            </Dialog>
          ) : null}
        </>
      )}
    </section>
  );
}
