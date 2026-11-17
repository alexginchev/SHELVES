import { useEffect, useRef, useState } from "react";
import type { Book } from "../shared/types";
import { api } from "./api";
import { ErrorMessage } from "./components";
import { Catalog } from "./Catalog";

export function AuthorPage({ onBook }: { onBook: (book: Book) => void }) {
  const request = useRef<AbortController | null>(null);
  const [params, setParams] = useState(location.hash.split("?")[1] || "");
  const [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const update = () => {
      request.current?.abort();
      setBusy(false);
      setParams(location.hash.split("?")[1] || "");
      setError("");
      setNotice("");
    };
    window.addEventListener("hashchange", update);
    return () => {
      request.current?.abort();
      window.removeEventListener("hashchange", update);
    };
  }, []);
  const query = new URLSearchParams(params),
    name = query.get("name") || "";
  return (
    <>
      <section className="author-page author-profile">
        <div className="author-monogram" aria-hidden="true">
          {name
            .split(/\s+/)
            .filter(Boolean)
            .map((part) => part[0])
            .filter((_, i, all) => i === 0 || i === all.length - 1)
            .join("")}
        </div>
        <div className="author-profile-copy">
          <span className="section-kicker">AUTHOR</span>
          <h2>{name || "Choose an author from a book page."}</h2>
          <p>Books & editions in Shelves</p>
          <details className="author-about">
            <summary>About this profile</summary>
            <p>
              Collected editions credited to this name. Authors who share a name
              may appear together.
            </p>
          </details>
        </div>
        <div className="author-profile-actions">
          <button
            className="outline-btn"
            disabled={busy || !name}
            onClick={async () => {
              request.current?.abort();
              const controller = new AbortController();
              request.current = controller;
              setBusy(true);
              setError("");
              setNotice("");
              try {
                const clean = (value: string) =>
                  value.replace(/["\\]/g, " ").slice(0, 45);
                const q = `inauthor:"${clean(name)}"${query.get("q") ? ` intitle:"${clean(query.get("q")!)}"` : ""}`;
                const result = await api<{
                  items: Book[];
                  warning: string | null;
                }>(
                  `/books/search?q=${encodeURIComponent(q)}&language=${encodeURIComponent(query.get("language") || "")}`,
                  {
                    signal: AbortSignal.any([
                      controller.signal,
                      AbortSignal.timeout(15000),
                    ]),
                  },
                );
                if (controller.signal.aborted) return;
                setNotice(
                  result.warning ||
                    `${result.items.length} Google Books results checked. Matching editions appear below.`,
                );
                setRevision((r) => r + 1);
              } catch (e) {
                if (controller.signal.aborted) return;
                setError(
                  e instanceof Error ? e.message : "Could not load books.",
                );
              } finally {
                if (!controller.signal.aborted) setBusy(false);
              }
            }}
          >
            {busy ? "Loading books…" : "Find more books"}
          </button>
          <ErrorMessage message={error} />
          {notice ? <p role="status">{notice}</p> : null}
        </div>
      </section>
      {name ? (
        <Catalog key={`${name}-${revision}`} onBook={onBook} author={name} />
      ) : null}
    </>
  );
}
