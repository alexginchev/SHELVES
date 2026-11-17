import { useEffect, useRef, useState } from "react";
import { api } from "./api";
export type CursorPage = { items: { id: string }[]; nextCursor: string | null };
export function useCursorPages<P extends CursorPage>(
  base: string,
  revision: number,
  empty: P,
  enabled = true,
  viewerId?: string,
) {
  const [data, setData] = useState<P>(empty),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const generation = useRef(0),
    pending = useRef(false),
    controller = useRef<AbortController | null>(null);
  const previousKey = useRef(""),
    loadedCount = useRef(0),
    refreshFailed = useRef(false);
  loadedCount.current = data.items.length;
  useEffect(() => {
    const version = ++generation.current;
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    pending.current = false;
    const key = JSON.stringify([base, enabled, viewerId]);
    const target =
      previousKey.current === key ? Math.max(20, loadedCount.current) : 20;
    if (previousKey.current !== key) setData(empty);
    previousKey.current = key;
    refreshFailed.current = false;
    setError("");
    setBusy(enabled);
    if (enabled)
      (async () => {
        const result = await api<P>(base, {
          signal: AbortSignal.any([c.signal, AbortSignal.timeout(15000)]),
        });
        while (result.nextCursor && result.items.length < target) {
          const next = await api<P>(
            base + "&before=" + encodeURIComponent(result.nextCursor),
            { signal: AbortSignal.any([c.signal, AbortSignal.timeout(15000)]) },
          );
          result.items.push(...next.items);
          result.nextCursor = next.nextCursor;
        }
        return result;
      })()
        .then((r) => {
          if (version === generation.current && !c.signal.aborted) setData(r);
        })
        .catch((e) => {
          if (version === generation.current && !c.signal.aborted) {
            refreshFailed.current = true;
            setError(e.message);
          }
        })
        .finally(() => {
          if (version === generation.current && !c.signal.aborted)
            setBusy(false);
        });
    return () => {
      c.abort();
      controller.current?.abort();
    };
  }, [base, revision, enabled, retry, viewerId, empty]);
  async function load() {
    if (pending.current || busy) return;
    if (refreshFailed.current || !data.nextCursor) {
      setRetry((x) => x + 1);
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    const version = generation.current,
      c = new AbortController();
    controller.current = c;
    try {
      const r = await api<P>(
        base + "&before=" + encodeURIComponent(data.nextCursor),
        { signal: AbortSignal.any([c.signal, AbortSignal.timeout(15000)]) },
      );
      if (version === generation.current && !c.signal.aborted)
        setData((old) => ({
          ...r,
          items: [
            ...old.items,
            ...r.items.filter((p) => !old.items.some((x) => x.id === p.id)),
          ],
          nextCursor: r.nextCursor,
        }));
    } catch (e) {
      if (version === generation.current && !c.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Could not load more activity.",
        );
    } finally {
      if (version === generation.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  return { ...data, busy, error, load };
}
