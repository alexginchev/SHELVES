import { useEffect, useState } from "react";
import type { Reader, User } from "../shared/types";
import { api } from "./api";
import { Avatar, ErrorMessage, Form } from "./components";
type Result = {
  items: Reader[];
  total: number;
  page: number;
  pages: number;
  heading: string;
};
export function ReaderDirectory({
  user,
  onAuth,
  onChanged,
}: {
  user: User | null;
  onAuth: () => void;
  onChanged: () => Promise<void>;
}) {
  const [params, setParams] = useState(() => location.hash.split("?")[1] || ""),
    [data, setData] = useState<Result | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const update = () => setParams(location.hash.split("?")[1] || "");
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<Result>(`/readers/directory?${params}`, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [params, user?.id, revision]);
  const query = new URLSearchParams(params);
  function page(value: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(value));
    location.hash = `readers?${next}`;
  }
  async function follow(reader: Reader) {
    if (!user) {
      onAuth();
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/readers/${reader.id}/follow`, {
        method: reader.following ? "DELETE" : "PUT",
      });
      await onChanged();
      setRevision(revision + 1);
      setNotice(
        reader.following
          ? "Reader unfollowed."
          : "Added to your reading circle.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update your circle.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="view-panel reader-directory">
      <span className="section-kicker">BETTER STORIES, TOGETHER</span>
      <h2>{data?.heading || "Find your reading people"}</h2>
      <p>
        Search by public name or username. Open a reading corner to explore
        reviews and shared thoughts.
      </p>
      <div className="account-actions">
        <a href="#community" className="plain-link">
          Reading circle
        </a>
        {query.get("scope") && query.get("scope") !== "all" ? (
          <a href="#readers" className="plain-link">
            All readers
          </a>
        ) : null}
      </div>
      <Form
        key={params}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const value = String(
            new FormData(e.currentTarget).get("q") || "",
          ).trim();
          const next = new URLSearchParams(params);
          next.delete("page");
          if (value) next.set("q", value);
          else next.delete("q");
          if (next.toString() === params) setRevision(revision + 1);
          else location.hash = `readers?${next}`;
        }}
      >
        <label>
          Find readers
          <input
            type="search"
            name="q"
            maxLength={80}
            defaultValue={query.get("q") || ""}
          />
        </label>
        <div className="account-actions">
          <button className="primary-btn" disabled={loading}>
            Search readers
          </button>
          <button
            type="button"
            className="plain-link"
            disabled={loading}
            onClick={(e) => {
              e.currentTarget.form?.reset();
              const next = new URLSearchParams(params);
              next.delete("q");
              next.delete("page");
              location.hash = `readers?${next}`;
              setRevision(revision + 1);
            }}
          >
            Clear reader search
          </button>
        </div>
      </Form>
      <ErrorMessage message={error} />
      {error ? (
        <button
          className="outline-btn"
          onClick={() => setRevision(revision + 1)}
        >
          Try again
        </button>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {loading ? (
        <p role="status">Finding readers…</p>
      ) : data ? (
        <>
          <p className="search-source">
            {data.total} {data.total === 1 ? "reader" : "readers"} · Page{" "}
            {data.page} of {data.pages}
          </p>
          {data.items.map((reader) => (
            <div className="person-row community-row" key={reader.id}>
              <Avatar name={reader.displayName} />
              <div className="person-info">
                <a className="reader-link" href={`#reader/${reader.id}`}>
                  <strong>{reader.displayName}</strong>
                </a>
                <small>@{reader.username}</small>
                <p>{reader.bio || "A new chapter on Shelves."}</p>
              </div>
              {reader.id === user?.id ? (
                <span>You</span>
              ) : (
                <button
                  className={`follow-btn ${reader.following ? "following" : ""}`}
                  disabled={busy}
                  onClick={() => void follow(reader)}
                >
                  {reader.following ? "Following" : "Follow"}
                </button>
              )}
            </div>
          ))}
          {!data.items.length ? (
            <p className="empty-state">
              No readers found. Try another name or explore all readers.
            </p>
          ) : null}
          <nav className="account-actions" aria-label="Reader pages">
            <button
              className="outline-btn"
              disabled={data.page <= 1 || busy}
              onClick={() => page(data.page - 1)}
            >
              Previous readers
            </button>
            <button
              className="outline-btn"
              disabled={data.page >= data.pages || busy}
              onClick={() => page(data.page + 1)}
            >
              Next readers
            </button>
          </nav>
        </>
      ) : null}
    </section>
  );
}
