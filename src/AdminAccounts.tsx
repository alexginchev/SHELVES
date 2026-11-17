import { useEffect, useState, useRef } from "react";
import type { User } from "../shared/types";
import { api, json } from "./api";
import { Dialog, ErrorMessage, Form } from "./components";
type Account = {
  id: string;
  username: string;
  displayName: string;
  reason: string | null;
  createdAt: string | null;
  protected: boolean;
};
type History = {
  action: string;
  reason: string;
  actorName: string;
  createdAt: string;
};
export function AdminAccounts({ user }: { user: User | null }) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [data, setData] = useState<{
      items: Account[];
      pages: number;
      page: number;
    } | null>(null),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<Account | null>(null),
    [history, setHistory] = useState<History[] | null>(null),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError("");
    if (!user?.isAdmin) return;
    const timer = setTimeout(
      () => {
        api<typeof data>(
          `/admin/accounts?q=${encodeURIComponent(query)}&page=${page}`,
          { signal: c.signal },
        )
          .then((r) => {
            if (!c.signal.aborted) setData(r);
          })
          .catch((e) => {
            if (!c.signal.aborted) setError(e.message);
          });
      },
      query ? 300 : 0,
    );
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [user?.id, user?.isAdmin, query, page, revision]);
  useEffect(() => {
    setHistory(null);
    setActionError("");
    if (!selected) return;
    const c = new AbortController();
    api<{ items: History[] }>(`/admin/accounts/${selected.id}/history`, {
      signal: c.signal,
    })
      .then((r) => {
        if (!c.signal.aborted) setHistory(r.items);
      })
      .catch((e) => {
        if (!c.signal.aborted) setActionError(e.message);
      });
    return () => c.abort();
  }, [selected]);
  if (!user?.isAdmin)
    return (
      <section className="view-panel">
        <h2>Account moderation</h2>
        <p>Administrator access required.</p>
      </section>
    );
  return (
    <section className="view-panel">
      <h2>Account moderation</h2>
      <p>
        Suspension signs a reader out and hides their public activity. Restoring
        access preserves their books and requires a new sign-in. Administrator
        accounts are protected.
      </p>
      <a className="plain-link" href="#moderation">
        Back to reports
      </a>
      <label>
        Find a username
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
      </label>
      {query ? (
        <button
          className="plain-link"
          onClick={() => {
            setQuery("");
            setPage(1);
            searchRef.current?.focus();
          }}
        >
          Clear search
        </button>
      ) : null}
      <ErrorMessage message={error} />
      {error ? (
        <button
          className="outline-btn"
          onClick={() => setRevision((x) => x + 1)}
        >
          Try again
        </button>
      ) : null}
      {!data && !error ? <p role="status">Loading accounts…</p> : null}
      {data?.items.length === 0 ? (
        <p>No accounts match this username.</p>
      ) : null}
      {data?.items.map((a) => (
        <article className="safety-entry" key={a.id}>
          <div>
            <a href={`#reader/${a.id}`}>{a.displayName}</a>
            <p>
              @{a.username} ·{" "}
              {a.reason
                ? "Suspended"
                : a.protected
                  ? "Administrator"
                  : "Active"}
            </p>
            {a.reason ? <p className="preserve-lines">{a.reason}</p> : null}
          </div>
          <button className="outline-btn" onClick={() => setSelected(a)}>
            Review account
          </button>
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
      {selected ? (
        <Dialog
          title={"Review @" + selected.username}
          onClose={() => {
            if (!busy) setSelected(null);
          }}
        >
          <h2>Review @{selected.username}</h2>
          <h3>Action history</h3>
          {!history && !actionError ? (
            <p role="status">Loading history…</p>
          ) : null}
          {history?.length === 0 ? <p>No previous account actions.</p> : null}
          <div className="moderation-history">
            {history?.map((h, i) => (
              <div className="report-entry" key={i}>
                <strong>
                  {h.action === "suspend" ? "Suspended" : "Restored"}
                </strong>
                <p>
                  @{h.actorName} · {new Date(h.createdAt).toLocaleString()}
                </p>
                <p className="preserve-lines">{h.reason}</p>
              </div>
            ))}
          </div>
          {!selected.protected ? (
            <Form
              noValidate
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                const reason = String(
                  new FormData(e.currentTarget).get("reason") || "",
                );
                setBusy(true);
                setActionError("");
                try {
                  await api(
                    `/admin/accounts/${selected.id}/status`,
                    json("POST", {
                      action: selected.reason ? "restore" : "suspend",
                      reason,
                    }),
                  );
                  setSelected(null);
                  setRevision((x) => x + 1);
                  window.dispatchEvent(new Event("shelves-safety-changed"));
                } catch (e) {
                  setActionError(
                    e instanceof Error
                      ? e.message
                      : "Could not update account.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <p>
                {selected.reason
                  ? "Restore this reader’s ability to sign in and make their activity visible again."
                  : "Suspend this account, revoke its sessions, and hide its public activity. This does not delete their data."}
              </p>
              <label>
                Reason for this action
                <textarea
                  className="resize-none"
                  name="reason"
                  required
                  minLength={10}
                  maxLength={1000}
                  rows={4}
                  disabled={busy}
                />
              </label>
              <div className="safety-actions">
                <button
                  type="button"
                  className="outline-btn"
                  disabled={busy}
                  onClick={() => setSelected(null)}
                >
                  Cancel
                </button>
                <button className="primary-btn" disabled={busy || !history}>
                  {busy
                    ? "Saving…"
                    : selected.reason
                      ? "Restore account"
                      : "Suspend account"}
                </button>
              </div>
            </Form>
          ) : (
            <p>Administrator accounts cannot be suspended here.</p>
          )}
          <ErrorMessage message={actionError} />
        </Dialog>
      ) : null}
    </section>
  );
}
