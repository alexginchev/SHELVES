import { usePagedFeed, FeedMore } from "./PagedFeed";
import { ReaderControls } from "./SocialSafety";
import { ProfileIdentity } from "./ProfileIdentity";
import { useEffect, useState } from "react";
import type { Post, ReaderProfile, User } from "../shared/types";
import { api } from "./api";
import { Avatar, PostCard } from "./components";
export function ReaderPage({
  id,
  wallOnly = false,
  user,
  revision,
  busy,
  onFollow,
  onLike,
  onComment,
  onDelete,
}: {
  id: string;
  wallOnly?: boolean;
  user: User | null;
  revision: number;
  busy: boolean;
  onFollow: (following: boolean) => void;
  onLike: (post: Post) => void;
  onComment: (post: Post) => void;
  onDelete: (post: Post) => void;
}) {
  const [profile, setProfile] = useState<ReaderProfile | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [filter, setFilter] = useState("all");
  useEffect(() => {
    const controller = new AbortController();
    api<ReaderProfile>(`/readers/${id}`, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          setProfile(data);
          setError("");
          document.title = `${data.reader.displayName} · Shelves`;
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Could not load this reader.",
          );
      });
    return () => controller.abort();
  }, [id, revision, retry]);
  const wall = usePagedFeed(filter, revision + retry, true, id, user?.id);
  if (error)
    return (
      <section className="view-panel">
        <h2>We could not open this reading corner.</h2>
        <p role="alert">{error}</p>
        <button className="outline-btn" onClick={() => setRetry(retry + 1)}>
          Try again
        </button>{" "}
        <a className="plain-link" href="#community">
          Back to reading circle
        </a>
      </section>
    );
  if (!profile)
    return (
      <section className="view-panel" role="status">
        <h2>Opening this reading corner…</h2>
      </section>
    );
  const { reader } = profile,
    posts = wall.items;
  return (
    <>
      {!wallOnly ? (
        <>
          <ProfileIdentity
            reader={reader}
            followers={profile.followers}
            following={profile.followingCount}
          />
          <section className="view-panel profile-follow-actions">
            {reader.id === user?.id ? (
              <a className="outline-btn" href="#profile">
                Edit my profile
              </a>
            ) : (
              <button
                className={`follow-btn ${reader.following ? "following" : ""}`}
                disabled={busy || reader.interactionBlocked}
                onClick={() => onFollow(reader.following)}
              >
                {reader.interactionBlocked
                  ? "Interactions unavailable"
                  : reader.following
                    ? "Following"
                    : "Follow reader"}
              </button>
            )}
            {user && user.id !== reader.id ? (
              <ReaderControls targetId={reader.id} />
            ) : null}
          </section>
        </>
      ) : null}
      <section className="view-panel profile-wall">
        <div className="feed-heading">
          <h2>
            {wallOnly ? "Your profile wall" : "From their reading corner"}
          </h2>
          <div className="feed-filters">
            {[
              ["all", "All posts"],
              ["reviews", "Reviews"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={`filter-btn ${filter === value ? "active" : ""}`}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="view-intro">
          Public thoughts and book reviews shared with the circle.
        </p>
        <div className="feed-list">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              user={user}
              onLike={onLike}
              onComment={onComment}
              onDelete={onDelete}
            />
          ))}
        </div>
        <FeedMore feed={wall} />
        {!posts.length && !wall.busy && !wall.error ? (
          <div className="empty-state">
            <p>
              {reader.activityHidden
                ? "This reader’s activity is hidden by your reading circle controls."
                : filter === "reviews"
                  ? "No public reviews here yet."
                  : "Their first public story is still to come."}
            </p>
          </div>
        ) : null}
      </section>
    </>
  );
}
