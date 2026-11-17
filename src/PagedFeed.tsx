import type { Post } from "../shared/types";
import { useCursorPages } from "./useCursorPages";
type Page = { items: Post[]; nextCursor: string | null };
const empty: Page = { items: [], nextCursor: null };
export function usePagedFeed(
  filter: string,
  revision: number,
  enabled = true,
  author?: string,
  viewerId?: string,
) {
  const base =
    "/feed?filter=" +
    encodeURIComponent(
      ["all", "following", "reviews", "for-you"].includes(filter)
        ? filter
        : "all",
    ) +
    (author ? "&author=" + encodeURIComponent(author) : "");
  return useCursorPages(base, revision, empty, enabled, viewerId);
}
export function FeedMore({ feed }: { feed: ReturnType<typeof usePagedFeed> }) {
  return (
    <ActivityMore
      activity={feed}
      moreLabel="Load more posts"
      loadingLabel="Loading posts…"
      endLabel="You’re up to date with this feed."
    />
  );
}
export function ActivityMore({
  activity: feed,
  moreLabel,
  loadingLabel,
  endLabel,
  disabled = false,
}: {
  activity: {
    items: { id: string }[];
    nextCursor: string | null;
    busy: boolean;
    error: string;
    load: () => Promise<void>;
  };
  moreLabel: string;
  loadingLabel: string;
  endLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="feed-pagination">
      {feed.error ? (
        <p className="form-error" role="alert">
          {feed.error}
        </p>
      ) : null}
      {feed.busy ? <p role="status">{loadingLabel}</p> : null}
      {(feed.nextCursor || feed.error) && !feed.busy ? (
        <button
          className="outline-btn"
          disabled={disabled}
          onClick={() => void feed.load()}
        >
          {feed.error ? "Try again" : moreLabel}
        </button>
      ) : null}
      {!feed.nextCursor &&
      !feed.busy &&
      !feed.error &&
      feed.items.length > 0 ? (
        <p>{endLabel}</p>
      ) : null}
    </div>
  );
}
