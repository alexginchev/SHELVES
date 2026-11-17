import { useEffect, useState } from "react";
import { api } from "./api";

export type NumberedPage<T> = {
  items: T[];
  total: number;
  page: number;
  pages: number;
};
export function useNumberedPage<T>(
  url: string,
  revision = 0,
  enabled = true,
  viewer = "",
) {
  const [data, setData] = useState<NumberedPage<T> | null>(null);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    setBusy(enabled);
    if (enabled)
      api<NumberedPage<T>>(url, {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
      })
        .then((result) => {
          if (!controller.signal.aborted) setData(result);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    return () => controller.abort();
  }, [url, revision, retry, enabled, viewer]);
  return { data, busy, error, retry: () => setRetry((n) => n + 1) };
}
export function PageNavigation({
  page,
  pages,
  busy,
  onPage,
}: {
  page: number;
  pages: number;
  busy: boolean;
  onPage: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <nav className="list-actions" aria-label="Pagination">
      <button
        type="button"
        className="outline-btn"
        disabled={busy || page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous page
      </button>
      <span role="status">
        Page {page} of {pages}
      </span>
      <button
        type="button"
        className="outline-btn"
        disabled={busy || page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Next page
      </button>
    </nav>
  );
}
