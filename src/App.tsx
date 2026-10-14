import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Book,
  User,
  Reading,
  Shelf,
  Post,
  Recommendation,
  Reader,
  Stats,
  ReadingStatus,
} from "../shared/types";
import { api } from "./api";
import {
  Avatar,
  BookCard,
  Cover,
  ErrorMessage,
  Icon,
  PostCard,
} from "./components";
import { AuthDialog, BookDialog, ProfileForm, SimpleForm } from "./forms";
import { BookPage } from "./BookPage";
const views = {
  home: "Your reading nook",
  discover: "Find your next favorite",
  shelves: "Your personal library",
  community: "Better stories, together",
  journal: "Notes worth keeping",
  profile: "Your reading life",
  book: "Between the pages",
};
type View = keyof typeof views;
const nav: [View, string, string][] = [
  ["home", "Home", "home"],
  ["discover", "Discover", "search"],
  ["shelves", "My shelves", "shelves"],
  ["community", "Reading circle", "community"],
  ["journal", "Reading journal", "journal"],
];
const statuses: ReadingStatus[] = [
  "Currently reading",
  "Want to read",
  "Finished",
  "Did not finish",
];
const readBookId = () =>
  /^book\/([a-zA-Z0-9_-]{1,80})$/.exec(location.hash.slice(1))?.[1] || null;
const readView = (): View =>
  readBookId()
    ? "book"
    : Object.hasOwn(views, location.hash.slice(1))
      ? (location.hash.slice(1) as View)
      : "home";
type Snapshot = {
  user: User | null;
  books: Book[];
  recommendations: Recommendation[];
  posts: Post[];
  readers: Reader[];
  library: Reading[];
  shelves: Shelf[];
  stats: Stats | null;
};
const empty: Snapshot = {
  user: null,
  books: [],
  recommendations: [],
  posts: [],
  readers: [],
  library: [],
  shelves: [],
  stats: null,
};
export function App() {
  const [data, setData] = useState<Snapshot>(empty),
    [bookId, setBookId] = useState<string | null>(readBookId),
    [revision, setRevision] = useState(0),
    [view, setView] = useState<View>(readView),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [auth, setAuth] = useState(false),
    [book, setBook] = useState<Book | null>(null),
    [shelf, setShelf] = useState(""),
    [composer, setComposer] = useState<{
      kind: "post" | "shelf" | "comment" | "delete";
      post?: Post;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("all");
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState<{
      items: Book[];
      source: string;
      warning: string | null;
    } | null>(null),
    [searching, setSearching] = useState(false),
    [searchError, setSearchError] = useState("");
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    try {
      const snapshot = await api<Snapshot>("/snapshot");
      if (version === generation.current) {
        setData(snapshot);
        setError("");
        setRevision((value) => value + 1);
      }
    } catch (e) {
      if (version === generation.current)
        setError(e instanceof Error ? e.message : "Could not load Shelves.");
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => {
      generation.current++;
    };
  }, [refresh]);
  useEffect(() => {
    const update = () => {
      setView(readView());
      setBookId(readBookId());
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    setSearchError("");
    setSearch(null);
    if (view !== "discover" || query.trim().length < 2) {
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      api<{ items: Book[]; source: string; warning: string | null }>(
        `/books/search?q=${encodeURIComponent(query.trim())}`,
        { signal: controller.signal },
      )
        .then(setSearch)
        .catch((e) => {
          if (!controller.signal.aborted)
            setSearchError(e instanceof Error ? e.message : "Search failed.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, view]);
  function navigate(next: View) {
    setView(next);
    location.hash = next;
    setFilter("all");
  }
  function openBookPage(selected: Book) {
    setBookId(selected.id);
    setView("book");
    location.hash = `book/${selected.id}`;
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function requireUser() {
    if (!data.user) {
      setAuth(true);
      return false;
    }
    return true;
  }
  async function mutate(action: () => Promise<unknown>, message: string) {
    if (!requireUser() || busy) return;
    setBusy(true);
    try {
      await action();
      await refresh();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const saved = async () => {
    await refresh();
    setNotice("Saved to your Shelves account.");
  };
  async function signOut() {
    setBusy(true);
    try {
      await api("/auth/logout", { method: "POST" });
      await refresh();
      setShelf("");
      setNotice("You have signed out.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  }
  const username = data.user?.displayName || "Reader";
  const filteredLibrary = data.library.filter(
    (r) => !shelf || r.status === shelf || r.shelfIds.includes(shelf),
  );
  const goal = data.stats?.goal || 30,
    finished = data.stats?.finished || 0,
    pct = Math.min(100, Math.round((finished / goal) * 100));
  const followed = new Set(
    data.readers.filter((r) => r.following).map((r) => r.id),
  );
  const visiblePosts = data.posts.filter(
    (p) =>
      filter === "all" ||
      (filter === "reviews" && p.kind === "review") ||
      (filter === "following" &&
        (followed.has(p.userId) || p.userId === data.user?.id)),
  );
  const shelfTitle =
    data.shelves.find((s) => s.id === shelf)?.name || shelf || "Your shelves.";
  const startPost = () => {
    if (requireUser()) setComposer({ kind: "post" });
  };
  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
          <a className="brand" href="#home">
            <span className="brand-mark">
              <Icon name="leaf" />
            </span>
            <span>
              <strong>shelves</strong>
              <small>THE BOOKISH SOCIAL CLUB</small>
            </span>
          </a>
          <div className="sidebar-label">YOUR CORNER</div>
          <nav className="main-nav" aria-label="Main navigation">
            {nav.map(([key, label, icon]) => (
              <button
                key={key}
                className={`nav-item ${view === key ? "active" : ""}`}
                onClick={() => {
                  setShelf("");
                  navigate(key);
                }}
                aria-current={view === key ? "page" : undefined}
              >
                <span className="nav-icon">
                  <Icon name={icon} />
                </span>
                {label}
              </button>
            ))}
          </nav>
          <div className="sidebar-label shelf-label">
            YOUR SHELVES
            <button
              className="plus-btn"
              aria-label="Create shelf"
              onClick={() => {
                if (requireUser()) setComposer({ kind: "shelf" });
              }}
            >
              +
            </button>
          </div>
          <nav className="shelf-nav" aria-label="Book shelves">
            {statuses.map((status, i) => (
              <button
                className="shelf-link"
                key={status}
                onClick={() => {
                  setShelf(status);
                  navigate("shelves");
                }}
              >
                <i
                  className={`shelf-dot ${i === 0 ? "sage" : i === 1 ? "coral" : "blue"}`}
                />
                {status}
                <span>
                  {data.library.filter((r) => r.status === status).length}
                </span>
              </button>
            ))}
            {data.shelves.map((s) => (
              <button
                key={s.id}
                className="shelf-link"
                onClick={() => {
                  setShelf(s.id);
                  navigate("shelves");
                }}
              >
                <i className="shelf-dot blue" />
                {s.name}
                <span>{s.count}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-note">
            <div className="note-sun">✳</div>
            <p className="note-title">
              A slower kind
              <br />
              of social.
            </p>
            <p className="note-copy">
              Less scrolling. More stories worth keeping.
            </p>
            <span className="note-squiggle">〰 〰 〰</span>
          </div>
          <button
            className="profile-mini"
            onClick={() => (data.user ? navigate("profile") : setAuth(true))}
          >
            <Avatar name={username} />
            <span className="profile-mini-text">
              <strong>{data.user ? username : "Make yourself at home"}</strong>
              <small>
                {data.user
                  ? `@${data.user.username}`
                  : "Sign in or join Shelves"}
              </small>
            </span>
          </button>
        </aside>
        <main className="main-content">
          <header className="topbar">
            <a className="mobile-brand" href="#home">
              <span className="brand-mark">
                <Icon name="leaf" />
              </span>{" "}
              shelves
            </a>
            <div className="breadcrumbs">
              <span id="eyebrow">
                {new Date()
                  .toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })
                  .toUpperCase()}
              </span>
              <h1>{views[view]}</h1>
            </div>
            <div className="top-actions">
              <label className="search-box">
                <Icon name="search" />
                <input
                  type="search"
                  value={query}
                  maxLength={120}
                  placeholder="Find a book or author…"
                  aria-label="Search books and authors"
                  onChange={(e) => {
                    setQuery(e.target.value);
                    navigate("discover");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setQuery("");
                  }}
                />
              </label>
              {data.user ? (
                <button
                  className="avatar avatar-you top-avatar"
                  onClick={() => navigate("profile")}
                  aria-label="Open profile"
                >
                  {username[0]?.toUpperCase()}
                </button>
              ) : (
                <button
                  className="outline-btn sign-in-button"
                  onClick={() => setAuth(true)}
                >
                  Sign in
                </button>
              )}
            </div>
          </header>
          {error ? (
            <div className="load-error" role="alert">
              <span>{error}</span>
              <button className="outline-btn" onClick={() => void refresh()}>
                Retry
              </button>
            </div>
          ) : null}
          <div className="content-grid">
            <section className="feed-column" aria-busy={loading}>
              {loading ? (
                <section className="view-panel loading-panel" role="status">
                  <span className="section-kicker">
                    OPENING YOUR READING NOOK
                  </span>
                  <h2>A new chapter is loading…</h2>
                </section>
              ) : null}
              {!loading && view === "book" && bookId ? (
                <BookPage
                  key={bookId}
                  id={bookId}
                  user={data.user}
                  record={data.library.find((r) => r.bookId === bookId)}
                  revision={revision}
                  onRead={setBook}
                  onAuth={() => setAuth(true)}
                  onChanged={saved}
                />
              ) : null}
              {!loading && view === "home" ? (
                <>
                  <section className="welcome-card">
                    <div className="welcome-copy">
                      <span className="eyebrow-pill">✦ YOUR DAILY PAGE</span>
                      <h2>
                        Stories are better
                        <br />
                        when <em>shared.</em>
                      </h2>
                      <p>
                        A little inspiration for your reading life, one page at
                        a time.
                      </p>
                      <button
                        className="primary-btn"
                        onClick={() =>
                          data.user ? navigate("profile") : setAuth(true)
                        }
                      >
                        {data.user
                          ? "Set a reading goal"
                          : "Start your reading story"}{" "}
                        <span>↗</span>
                      </button>
                    </div>
                    <div className="welcome-art" aria-hidden="true">
                      <div className="art-sun" />
                      <div className="art-leaf leaf-one" />
                      <div className="art-leaf leaf-two" />
                      <div className="art-book book-back" />
                      <div className="art-book book-mid" />
                      <div className="art-book book-front">
                        <span>
                          THE
                          <br />
                          QUIET
                          <br />
                          WILD
                        </span>
                      </div>
                      <div className="art-mug">
                        <span>〰</span>
                      </div>
                      <div className="art-steam">⌁</div>
                      <div className="art-ground" />
                    </div>
                    <span className="welcome-doodle">✳</span>
                  </section>
                  <section className="compose-card">
                    <div className="compose-top">
                      <Avatar name={username} />
                      <button
                        className="compose-placeholder"
                        onClick={startPost}
                      >
                        What is on your mind
                        {data.user ? `, ${username.split(" ")[0]}` : ""}?
                      </button>
                    </div>
                    <div className="compose-bottom">
                      <span className="compose-hint">
                        A thought, a quote, a story worth sharing.
                      </span>
                      <button className="outline-btn" onClick={startPost}>
                        Create post ↗
                      </button>
                    </div>
                  </section>
                  <div className="feed-heading">
                    <div>
                      <span className="section-kicker">
                        FROM YOUR COMMUNITY
                      </span>
                      <h2>
                        The reading room <span>✳</span>
                      </h2>
                    </div>
                    <div className="feed-filters">
                      {[
                        ["all", "For you"],
                        ["following", "Following"],
                        ["reviews", "Reviews"],
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          className={`filter-btn ${filter === key ? "active" : ""}`}
                          onClick={() => setFilter(key)}
                          aria-pressed={filter === key}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="feed-list">
                    {visiblePosts.map((p) => (
                      <PostCard
                        key={p.id}
                        post={p}
                        user={data.user}
                        onLike={(p) =>
                          void mutate(
                            () =>
                              api(`/posts/${p.id}/like`, {
                                method: p.liked ? "DELETE" : "PUT",
                              }),
                            p.liked
                              ? "Appreciation removed."
                              : "A little appreciation shared.",
                          )
                        }
                        onComment={(p) => {
                          if (requireUser())
                            setComposer({ kind: "comment", post: p });
                        }}
                        onDelete={(p) =>
                          setComposer({ kind: "delete", post: p })
                        }
                      />
                    ))}
                    {!visiblePosts.length ? (
                      <section className="view-panel empty-state">
                        <span className="section-kicker">
                          GOOD CONVERSATIONS START SMALL
                        </span>
                        <h2>
                          {filter === "following"
                            ? "Build your reading circle."
                            : "The next story could be yours."}
                        </h2>
                        <p>
                          {filter === "following"
                            ? "Follow other readers to see their public notes here."
                            : "Share a thought about what you are reading, or find your next book."}
                        </p>
                        <button
                          className="primary-btn"
                          onClick={() =>
                            filter === "following"
                              ? navigate("community")
                              : startPost()
                          }
                        >
                          {filter === "following"
                            ? "Find readers ↗"
                            : "Share a thought ↗"}
                        </button>
                      </section>
                    ) : null}
                  </div>
                  <section className="view-panel">
                    <span className="section-kicker">
                      MADE FOR YOUR NEXT CHAPTER
                    </span>
                    <h2>Something good is waiting.</h2>
                    <div className="book-grid">
                      {data.recommendations.slice(0, 3).map((b) => (
                        <BookCard
                          key={b.id}
                          book={b}
                          reason={b.reason}
                          onOpen={openBookPage}
                        />
                      ))}
                    </div>
                    <button
                      className="plain-link"
                      onClick={() => navigate("discover")}
                    >
                      Explore all picks ↗
                    </button>
                  </section>
                </>
              ) : null}
              {!loading && view === "discover" ? (
                <section className="view-panel">
                  <span className="section-kicker">
                    {query.trim().length >= 2
                      ? "FOLLOW YOUR CURIOSITY"
                      : "MADE FOR YOU"}
                  </span>
                  <h2>
                    {query.trim().length >= 2
                      ? "A story to look for."
                      : "Find your next favorite."}
                  </h2>
                  <p className="view-intro">
                    {query.trim().length >= 2
                      ? "Search real books by title or author."
                      : "Picks shaped by your saved books and ratings. A different path is always welcome."}
                  </p>
                  <label className="discover-search">
                    Book title or author
                    <input
                      type="search"
                      value={query}
                      maxLength={120}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Try Ursula K. Le Guin"
                    />
                  </label>
                  {searching ? (
                    <p role="status">Looking through the catalog…</p>
                  ) : null}
                  <ErrorMessage message={searchError} />
                  {search?.warning ? (
                    <p className="catalog-warning" role="status">
                      {search.warning}
                    </p>
                  ) : null}
                  {search ? (
                    <p className="search-source">
                      {search.items.length} results · {search.source}
                    </p>
                  ) : null}
                  <div className="book-grid">
                    {(query.trim().length >= 2
                      ? search?.items || []
                      : data.recommendations
                    ).map((b) => (
                      <BookCard
                        key={b.id}
                        book={b}
                        reason={"reason" in b ? String(b.reason) : undefined}
                        onOpen={openBookPage}
                        onDismiss={
                          query.trim().length < 2
                            ? (b) =>
                                void mutate(
                                  () =>
                                    api(`/recommendations/${b.id}/dismiss`, {
                                      method: "PUT",
                                    }),
                                  "This pick is hidden from your recommendations.",
                                )
                            : undefined
                        }
                      />
                    ))}
                  </div>
                  {!searching &&
                  !searchError &&
                  !(query.trim().length >= 2
                    ? search?.items.length
                    : data.recommendations.length) ? (
                    <div className="empty-state">
                      <p>
                        {query.trim().length >= 2
                          ? "No matches. Try another title or author."
                          : "You have explored the current picks. Search the catalog for something new."}
                      </p>
                    </div>
                  ) : null}
                </section>
              ) : null}
              {!loading && view === "shelves" ? (
                <section className="view-panel">
                  <span className="section-kicker">
                    A LIBRARY THAT IS ALL YOURS
                  </span>
                  <h2>{shelfTitle}</h2>
                  <p className="view-intro">
                    The stories you have met, and the ones still calling your
                    name.
                  </p>
                  {data.user ? (
                    <>
                      <div className="library-tabs">
                        <button
                          className={`outline-btn ${!shelf ? "selected" : ""}`}
                          onClick={() => setShelf("")}
                        >
                          All books
                        </button>
                        {statuses.map((s) => (
                          <button
                            key={s}
                            className={`outline-btn ${shelf === s ? "selected" : ""}`}
                            onClick={() => setShelf(s)}
                          >
                            {s}
                          </button>
                        ))}
                        <button
                          className="outline-btn"
                          onClick={() => setComposer({ kind: "shelf" })}
                        >
                          + New shelf
                        </button>
                        {data.shelves.map((s) => (
                          <button
                            className={`outline-btn ${shelf === s.id ? "selected" : ""}`}
                            key={s.id}
                            onClick={() => setShelf(s.id)}
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                      <div className="book-grid">
                        {filteredLibrary.map((r) => (
                          <BookCard
                            key={r.bookId}
                            book={r.book}
                            reason={`${r.status}${r.rating ? ` · ${r.rating}/5 stars` : ""}${r.page ? ` · page ${r.page}` : ""}`}
                            onOpen={openBookPage}
                          />
                        ))}
                      </div>
                      {!filteredLibrary.length ? (
                        <div className="empty-state">
                          <p>No books here yet. Find one that calls to you.</p>
                          <button
                            className="primary-btn"
                            onClick={() => navigate("discover")}
                          >
                            Discover books ↗
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="empty-state">
                      <p>A shelf of your own begins with an account.</p>
                      <button
                        className="primary-btn"
                        onClick={() => setAuth(true)}
                      >
                        Join Shelves ↗
                      </button>
                    </div>
                  )}
                </section>
              ) : null}
              {!loading && view === "community" ? (
                <section className="view-panel">
                  <span className="section-kicker">FIND YOUR PEOPLE</span>
                  <h2>There is room in the circle.</h2>
                  <p className="view-intro">
                    Real readers, shared curiosity, and your next good
                    conversation.
                  </p>
                  {data.readers.map((r) => (
                    <div className="person-row community-row" key={r.id}>
                      <Avatar name={r.displayName} />
                      <div className="person-info">
                        <strong>{r.displayName}</strong>
                        <small>@{r.username}</small>
                        <p>{r.bio || "A new chapter on Shelves."}</p>
                      </div>
                      <button
                        className={`follow-btn ${r.following ? "following" : ""}`}
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            () =>
                              api(`/readers/${r.id}/follow`, {
                                method: r.following ? "DELETE" : "PUT",
                              }),
                            r.following
                              ? "Reader unfollowed."
                              : "Added to your reading circle.",
                          )
                        }
                      >
                        {r.following ? "Following" : "Follow"}
                      </button>
                    </div>
                  ))}
                  {!data.readers.length ? (
                    <div className="empty-state">
                      <p>
                        Your community is just beginning. Invite another reader
                        to create an account on this Shelves instance.
                      </p>
                    </div>
                  ) : null}
                </section>
              ) : null}
              {!loading && view === "journal" ? (
                <section className="view-panel">
                  <span className="section-kicker">
                    YOUR PRIVATE READING JOURNAL
                  </span>
                  <h2>Little things worth remembering.</h2>
                  <p className="view-intro">
                    Your private reviews, gathered from your reading records.
                  </p>
                  {data.library
                    .filter((r) => r.review)
                    .map((r) => (
                      <article className="journal-entry" key={r.bookId}>
                        <div className="journal-date">
                          {r.rating ? `${r.rating} / 5` : "A NOTE"}
                        </div>
                        <div>
                          <button
                            className="plain-link journal-title"
                            onClick={() => openBookPage(r.book)}
                          >
                            {r.book.title}
                          </button>
                          <p className="preserve-lines">{r.review}</p>
                        </div>
                      </article>
                    ))}
                  {!data.library.some((r) => r.review) ? (
                    <div className="empty-state">
                      <p>
                        Open a book and leave a private review to begin your
                        journal.
                      </p>
                      <button
                        className="primary-btn"
                        onClick={() => navigate("shelves")}
                      >
                        Visit my shelves ↗
                      </button>
                    </div>
                  ) : null}
                </section>
              ) : null}
              {!loading && view === "profile" ? (
                <section className="view-panel">
                  {data.user ? (
                    <>
                      <div className="profile-hero">
                        <Avatar name={username} />
                        <div>
                          <span className="section-kicker">
                            YOUR READING LIFE
                          </span>
                          <h2>{username}</h2>
                          <p>@{data.user.username}</p>
                          <div className="profile-stats">
                            <span>
                              <b>{data.stats?.followers || 0}</b> followers
                            </span>
                            <span>
                              <b>{data.stats?.following || 0}</b> following
                            </span>
                            <span>
                              <b>{finished}</b> books finished this year
                            </span>
                          </div>
                        </div>
                      </div>
                      <h2>Your year between the pages</h2>
                      <p>
                        {data.stats?.pages || 0} pages tracked ·{" "}
                        {data.stats?.reading || 0} books in progress
                      </p>
                      <div className="goal-number">
                        <strong>{finished}</strong>
                        <span>of {goal} books this year</span>
                      </div>
                      <div
                        className="goal-track"
                        role="progressbar"
                        aria-label="Yearly reading goal"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <ProfileForm
                        user={data.user}
                        onSaved={async () => {
                          await saved();
                        }}
                      />
                      <button
                        className="outline-btn"
                        disabled={busy}
                        onClick={() => void signOut()}
                      >
                        Sign out
                      </button>
                    </>
                  ) : (
                    <div className="empty-state">
                      <h2>Your reading life belongs here.</h2>
                      <p>
                        Create an account to keep your library and goal
                        together.
                      </p>
                      <button
                        className="primary-btn"
                        onClick={() => setAuth(true)}
                      >
                        Join Shelves ↗
                      </button>
                    </div>
                  )}
                </section>
              ) : null}
            </section>
            <aside className="right-rail">
              {data.books[0] ? (
                <section className="rail-card book-pick-card">
                  <span className="section-kicker">A LITTLE INSPIRATION</span>
                  <h3>Today's book nook</h3>
                  <div className="pick-book">
                    <Cover book={data.books[0]} small />
                    <div className="pick-info">
                      <span className="tag tag-sage">
                        {data.books[0].genre}
                      </span>
                      <h4>{data.books[0].title}</h4>
                      <p>{data.books[0].author}</p>
                      <button
                        className="outline-btn"
                        onClick={() => openBookPage(data.books[0])}
                      >
                        View book ↗
                      </button>
                    </div>
                  </div>
                  <p className="pick-quote">
                    “Where you tend a rose, my lad, a thistle cannot grow.”
                  </p>
                </section>
              ) : null}
              <section className="rail-card goal-card">
                <div className="rail-heading">
                  <div>
                    <span className="section-kicker">
                      YOUR {new Date().getFullYear()} JOURNEY
                    </span>
                    <h3>Pages in progress</h3>
                  </div>
                  <button
                    className="plain-arrow"
                    aria-label="Edit reading goal"
                    onClick={() =>
                      data.user ? navigate("profile") : setAuth(true)
                    }
                  >
                    ↗
                  </button>
                </div>
                <div className="goal-number">
                  <strong>{finished}</strong>
                  <span>of {goal} books</span>
                  <b className="goal-percent">{pct}%</b>
                </div>
                <div className="goal-track">
                  <span style={{ width: `${pct}%` }} />
                </div>
                <div className="goal-caption">
                  <span>{Math.max(0, goal - finished)} books to go</span>
                  <span>One page at a time.</span>
                </div>
                {!data.user ? (
                  <button className="plain-link" onClick={() => setAuth(true)}>
                    Set your own goal ↗
                  </button>
                ) : null}
              </section>
              <section className="rail-card people-card">
                <span className="section-kicker">GOOD COMPANY</span>
                <h3>Readers to know</h3>
                {data.readers.slice(0, 3).map((r) => (
                  <div className="person-row" key={r.id}>
                    <Avatar name={r.displayName} />
                    <div className="person-info">
                      <strong>{r.displayName}</strong>
                      <small>@{r.username}</small>
                    </div>
                    <button
                      className={`follow-btn ${r.following ? "following" : ""}`}
                      disabled={busy}
                      onClick={() =>
                        void mutate(
                          () =>
                            api(`/readers/${r.id}/follow`, {
                              method: r.following ? "DELETE" : "PUT",
                            }),
                          r.following
                            ? "Reader unfollowed."
                            : "Added to your circle.",
                        )
                      }
                    >
                      {r.following ? "Following" : "Follow"}
                    </button>
                  </div>
                ))}
                {!data.readers.length ? (
                  <p className="rail-empty">
                    Good stories find good company. Your community is just
                    beginning.
                  </p>
                ) : null}
                <button
                  className="outline-btn full-width"
                  onClick={() => navigate("community")}
                >
                  Explore your reading circle ↗
                </button>
              </section>
              <footer className="rail-footer">
                <span>Made with a little bookish magic ✳</span>
                <span>© Shelves {new Date().getFullYear()}</span>
              </footer>
            </aside>
          </div>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {(
          [
            ["home", "Home", "home"],
            ["discover", "Discover", "search"],
            ["post", "Post", "plus"],
            ["shelves", "Shelves", "shelves"],
            ["profile", "You", "profile"],
          ] as const
        ).map(([key, label, icon]) => (
          <button
            key={key}
            className={`${view === key ? "active" : ""} ${key === "post" ? "mobile-compose" : ""}`}
            onClick={() => {
              if (key === "post") startPost();
              else {
                setShelf("");
                navigate(key);
              }
            }}
          >
            <Icon name={icon} />
            <small>{label}</small>
          </button>
        ))}
      </nav>
      {auth ? (
        <AuthDialog
          onClose={() => setAuth(false)}
          onUser={async () => {
            await refresh();
            setNotice("Welcome to your reading nook.");
          }}
        />
      ) : null}
      {book ? (
        <BookDialog
          key={`${book.id}-${data.user?.id || "guest"}`}
          book={book}
          record={data.library.find((r) => r.bookId === book.id)}
          shelves={data.shelves}
          user={data.user}
          onAuth={() => setAuth(true)}
          onClose={() => setBook(null)}
          onSaved={saved}
        />
      ) : null}
      {composer ? (
        <SimpleForm
          kind={composer.kind}
          post={composer.post}
          onClose={() => setComposer(null)}
          onSaved={saved}
        />
      ) : null}
      <div
        className={`toast ${notice ? "show" : ""}`}
        role="status"
        aria-live="polite"
      >
        {notice}
      </div>
    </>
  );
}
