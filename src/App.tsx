import { HeaderSearch } from "./HeaderSearch";
import {
  BrandMark,
  BrandLoading,
  SiteFooter,
  SiteInformation,
} from "./SiteIdentity";
import { LanguageSelect } from "./LanguageSelect";
import { usePagedFeed, FeedMore } from "./PagedFeed";
import { AdminAccounts } from "./AdminAccounts";
import { SafetySettings, AdminReports } from "./SocialSafety";
import { ProfileIdentity, ProfileManagement } from "./ProfileIdentity";
import { CurrentlyReading } from "./CurrentlyReading";
import { ReaderName } from "./ShelvesBadge";
import { AuthorPage } from "./AuthorPage";
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
import {
  AuthDialog,
  BookDialog,
  ProfileForm,
  SimpleForm,
  ShelfDialog,
} from "./forms";
import { BookPage } from "./BookPage";
import { ReaderPage } from "./ReaderPage";
import { Notifications, PostPage } from "./Notifications";
import { Lists } from "./Lists";
import { AccountSettings } from "./AccountSettings";
import { ReadingPreferences } from "./ReadingPreferences";
import { Catalog } from "./Catalog";
import { ReaderDirectory } from "./ReaderDirectory";
const views = {
  terms: "Terms of use",
  cookies: "Cookies",
  home: "Your reading nook",
  discover: "Find your next favorite",
  shelves: "Your personal library",
  community: "Better stories, together",
  journal: "Notes worth keeping",
  profile: "Your reading life",
  book: "Between the pages",
  reader: "A reader's corner",
  notifications: "Your notifications",
  post: "From the reading room",
  lists: "Collections worth sharing",
  list: "A collection of stories",
  settings: "Account settings",
  safety: "Your reading circle controls",
  moderation: "Community reports",
  "moderation-accounts": "Account moderation",
  preferences: "Your reading preferences",
  author: "Authors",
  catalog: "Browse the catalogue",
  readers: "Find your reading people",
};
type View = keyof typeof views;
const nav: [View, string, string][] = [
  ["home", "Home", "home"],
  ["discover", "Discover", "search"],
  ["shelves", "My shelves", "shelves"],
  ["community", "Reading circle", "community"],
  ["journal", "Reading journal", "journal"],
  ["lists", "Book lists", "shelves"],
];
const statuses: ReadingStatus[] = [
  "Currently reading",
  "Want to read",
  "Finished",
  "Did not finish",
];
const readBookId = () =>
  /^book\/([a-zA-Z0-9_-]{1,80})$/.exec(
    location.hash.slice(1).split("?")[0],
  )?.[1] || null;
const readReaderId = () =>
  /^reader\/([a-zA-Z0-9_-]{1,80})$/.exec(location.hash.slice(1))?.[1] || null;
const readPostId = () =>
  /^post\/([a-zA-Z0-9_-]{1,80})$/.exec(location.hash.slice(1))?.[1] || null;
const readListId = () =>
  /^list\/([a-zA-Z0-9_-]{1,80})$/.exec(location.hash.slice(1))?.[1] || null;
const readShelf = () =>
  location.hash.startsWith("#shelves?")
    ? new URLSearchParams(location.hash.split("?")[1]).get("shelf") || ""
    : "";
const readView = (): View =>
  readListId()
    ? "list"
    : readBookId()
      ? "book"
      : readReaderId()
        ? "reader"
        : readPostId()
          ? "post"
          : Object.hasOwn(views, location.hash.slice(1).split("?")[0])
            ? (location.hash.slice(1).split("?")[0] as View)
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
  unreadNotifications: number;
  preferencesCompleted: boolean;
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
  unreadNotifications: 0,
  preferencesCompleted: false,
};
export function App() {
  const [data, setData] = useState<Snapshot>(empty),
    [bookId, setBookId] = useState<string | null>(readBookId),
    [readerId, setReaderId] = useState<string | null>(readReaderId),
    [postId, setPostId] = useState<string | null>(readPostId),
    [listId, setListId] = useState<string | null>(readListId),
    [revision, setRevision] = useState(0),
    [view, setView] = useState<View>(readView),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [auth, setAuth] = useState(false),
    [book, setBook] = useState<Book | null>(null),
    [shelf, setShelf] = useState(readShelf),
    [shelfAction, setShelfAction] = useState<{
      shelf: Shelf;
      deleting: boolean;
    } | null>(null),
    [libraryQuery, setLibraryQuery] = useState(""),
    [librarySort, setLibrarySort] = useState("recent"),
    [composer, setComposer] = useState<{
      kind: "post" | "shelf" | "comment" | "delete";
      post?: Post;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("all");
  const [searchLanguage, setSearchLanguage] = useState("");
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState<{
      items: Book[];
      source: string;
      warning: string | null;
    } | null>(null),
    [searching, setSearching] = useState(false),
    [searchError, setSearchError] = useState(""),
    [searchRetry, setSearchRetry] = useState(0),
    [searchComposing, setSearchComposing] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const userId = data.user?.id;
    if (!userId) return;
    const controller = new AbortController();
    let pending = false;
    const update = async () => {
      if (document.hidden || pending) return;
      pending = true;
      try {
        const result = await api<{ unread: number }>("/notifications/unread", {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        });
        if (!controller.signal.aborted)
          setData((current) =>
            current.user?.id === userId
              ? { ...current, unreadNotifications: result.unread }
              : current,
          );
      } catch {
        /* Keep the last confirmed count; the inbox provides explicit retry. */
      } finally {
        pending = false;
      }
    };
    const timer = setInterval(() => void update(), 30000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [data.user?.id]);
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
    const update = () => {
      void refresh();
    };
    window.addEventListener("shelves-safety-changed", update);
    return () => window.removeEventListener("shelves-safety-changed", update);
  }, [refresh]);
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
      setReaderId(readReaderId());
      setPostId(readPostId());
      setListId(readListId());
      setShelf(readShelf());
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
    if (view !== "discover" || query.trim().length < 2 || searchComposing) {
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      api<{ items: Book[]; source: string; warning: string | null }>(
        `/books/search?q=${encodeURIComponent(query.trim())}&language=${encodeURIComponent(searchLanguage)}`,
        {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        },
      )
        .then((result) => {
          if (!controller.signal.aborted) setSearch(result);
        })
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
  }, [query, view, searchLanguage, searchRetry, searchComposing]);
  useEffect(() => {
    document.title = `${views[view]} · Shelves`;
  }, [view]);
  function navigate(next: View, selectedShelf = "") {
    setView(next);
    setShelf(next === "shelves" ? selectedShelf : "");
    location.hash =
      next === "shelves" && selectedShelf
        ? `shelves?shelf=${encodeURIComponent(selectedShelf)}`
        : next;
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
  const spotlight =
    data.books.find((b) => b.id === "seed-garden") || data.books[0];
  const username = data.user?.displayName || "Reader";
  const filteredLibrary = data.library
    .filter(
      (r) =>
        (!shelf || r.status === shelf || r.shelfIds.includes(shelf)) &&
        `${r.book.title} ${r.book.author}`
          .toLowerCase()
          .includes(libraryQuery.trim().toLowerCase()),
    )
    .sort((a, b) =>
      librarySort === "title"
        ? a.book.title.localeCompare(b.book.title)
        : librarySort === "author"
          ? a.book.author.localeCompare(b.book.author)
          : librarySort === "rating"
            ? b.rating - a.rating
            : 0,
    );
  const selectedShelf = data.shelves.find((s) => s.id === shelf);
  const goal = data.stats?.goal || 30,
    finished = data.stats?.finished || 0,
    pct = Math.min(100, Math.round((finished / goal) * 100));
  const feedPage = usePagedFeed(
    filter,
    revision,
    view === "home" || view === "community",
    undefined,
    data.user?.id,
  );
  const visiblePosts = feedPage.items;
  const shelfTitle =
    data.shelves.find((s) => s.id === shelf)?.name || shelf || "All books";
  const startPost = () => {
    if (requireUser()) setComposer({ kind: "post" });
  };
  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
          <a className="brand" href="#home" aria-label="Shelves home">
            <BrandMark />
          </a>
          <div className="sidebar-body">
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
                    navigate("shelves", status);
                  }}
                >
                  <i
                    className={`shelf-dot ${i === 0 ? "sage" : i === 1 ? "coral" : "blue"}`}
                  />
                  <span className="shelf-name">{status}</span>
                  <span className="shelf-count">
                    {data.library.filter((r) => r.status === status).length}
                  </span>
                </button>
              ))}
              {data.shelves.map((s) => (
                <button
                  key={s.id}
                  className="shelf-link"
                  onClick={() => {
                    navigate("shelves", s.id);
                  }}
                >
                  <i className="shelf-dot blue" />
                  <span className="shelf-name">{s.name}</span>
                  <span className="shelf-count">{s.count}</span>
                </button>
              ))}
            </nav>
          </div>
          <button
            className="profile-mini"
            onClick={() => (data.user ? navigate("profile") : setAuth(true))}
          >
            <Avatar
              name={username}
              src={
                data.user?.avatarVersion
                  ? `/api/readers/${data.user.id}/images/avatar?v=${data.user.avatarVersion}`
                  : undefined
              }
            />
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
            <a className="mobile-brand" href="#home" aria-label="Shelves home">
              <BrandMark />
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
              {data.user ? (
                <button
                  className="notification-bell"
                  onClick={() => navigate("notifications")}
                  aria-label={`Notifications, ${data.unreadNotifications} unread`}
                >
                  <Icon name="bell" />
                  {data.unreadNotifications > 0 ? (
                    <span className="notification-count">
                      {data.unreadNotifications > 99
                        ? "99+"
                        : data.unreadNotifications}
                    </span>
                  ) : null}
                </button>
              ) : null}
              <HeaderSearch />
              {data.user ? (
                <button
                  className="avatar avatar-you top-avatar"
                  onClick={() => navigate("profile")}
                  aria-label="Open profile"
                >
                  <Avatar
                    name={username}
                    src={
                      data.user.avatarVersion
                        ? `/api/readers/${data.user.id}/images/avatar?v=${data.user.avatarVersion}`
                        : undefined
                    }
                  />
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
          <nav className="mobile-secondary" aria-label="More navigation">
            <a href="#community">Reading circle</a>
            <a href="#journal">Reading journal</a>
            <a href="#lists">Book lists</a>
          </nav>
          {error ? (
            <div className="load-error" role="alert">
              <span>{error}</span>
              <button className="outline-btn" onClick={() => void refresh()}>
                Retry
              </button>
            </div>
          ) : null}
          <div
            className={`content-grid ${view === "terms" || view === "cookies" ? "information-grid" : ""} ${view === "author" || view === "shelves" || view === "discover" ? "collection-layout" : ""}`}
          >
            <section className="feed-column" aria-busy={loading} key={view}>
              {(view === "terms" || view === "cookies") && (
                <SiteInformation page={view} />
              )}
              {loading ? (
                <section className="view-panel loading-panel" role="status">
                  <span className="section-kicker">
                    OPENING YOUR READING NOOK
                  </span>
                  <BrandLoading label="Opening Shelves…" />
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
              {!loading && (view === "lists" || view === "list") ? (
                <Lists
                  key={listId || "lists"}
                  id={listId}
                  user={data.user}
                  onAuth={() => setAuth(true)}
                  onBook={openBookPage}
                />
              ) : null}
              {!loading && view === "moderation-accounts" ? (
                <AdminAccounts user={data.user} />
              ) : null}
              {!loading && view === "safety" ? (
                <SafetySettings user={data.user} />
              ) : null}
              {!loading && view === "moderation" ? (
                <AdminReports user={data.user} />
              ) : null}
              {!loading && view === "settings" ? (
                <AccountSettings
                  user={data.user}
                  onAuth={() => setAuth(true)}
                  onEnded={async () => {
                    generation.current++;
                    setData(empty);
                    setShelf("");
                    await refresh();
                  }}
                />
              ) : null}
              {!loading && view === "preferences" ? (
                <ReadingPreferences
                  user={data.user}
                  onAuth={() => setAuth(true)}
                  onSaved={refresh}
                />
              ) : null}
              {!loading && view === "notifications" ? (
                data.user ? (
                  <Notifications
                    key={data.user.id}
                    revision={revision}
                    onChanged={refresh}
                  />
                ) : (
                  <section className="view-panel empty-state">
                    <h2>Your circle is waiting.</h2>
                    <p>Sign in to see your private notifications.</p>
                    <button
                      className="primary-btn"
                      onClick={() => setAuth(true)}
                    >
                      Sign in to see notifications
                    </button>
                  </section>
                )
              ) : null}
              {!loading && view === "post" && postId ? (
                <PostPage
                  key={postId}
                  id={postId}
                  user={data.user}
                  revision={revision}
                  onLike={(p) =>
                    void mutate(
                      () =>
                        api(`/posts/${p.id}/like`, {
                          method: p.liked ? "DELETE" : "PUT",
                        }),
                      p.liked
                        ? "Appreciation removed."
                        : "Appreciation shared.",
                    )
                  }
                  onComment={(p) => {
                    if (requireUser())
                      setComposer({ kind: "comment", post: p });
                  }}
                  onDelete={(p) => setComposer({ kind: "delete", post: p })}
                />
              ) : null}
              {!loading && view === "reader" && readerId ? (
                <ReaderPage
                  key={readerId}
                  id={readerId}
                  user={data.user}
                  revision={revision}
                  busy={busy}
                  onFollow={(following) =>
                    void mutate(
                      () =>
                        api(`/readers/${readerId}/follow`, {
                          method: following ? "DELETE" : "PUT",
                        }),
                      following
                        ? "Reader unfollowed."
                        : "Added to your reading circle.",
                    )
                  }
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
                  onDelete={(p) => setComposer({ kind: "delete", post: p })}
                />
              ) : null}
              {!loading && view === "home" ? (
                <>
                  {data.user ? (
                    <>
                      <CurrentlyReading
                        records={data.library}
                        onSaved={saved}
                      />
                      {!data.preferencesCompleted ? (
                        <aside className="reading-preferences-reminder">
                          <p>Make your recommendations more personal.</p>
                          <a className="plain-link" href="#preferences">
                            Choose reading preferences ↗
                          </a>
                        </aside>
                      ) : null}
                    </>
                  ) : (
                    <section className="welcome-card">
                      <div className="welcome-copy">
                        <span className="eyebrow-pill">✦ YOUR DAILY PAGE</span>
                        <h2>
                          Stories are better
                          <br />
                          when <em>shared.</em>
                        </h2>
                        <p>
                          A little inspiration for your reading life, one page
                          at a time.
                        </p>
                        <button
                          className="primary-btn"
                          onClick={() => setAuth(true)}
                        >
                          Start your reading story <span>↗</span>
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
                  )}
                  <section className="compose-card">
                    <div className="compose-top">
                      <Avatar
                        name={username}
                        src={
                          data.user?.avatarVersion
                            ? `/api/readers/${data.user.id}/images/avatar?v=${data.user.avatarVersion}`
                            : undefined
                        }
                      />
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
                    <FeedMore feed={feedPage} />
                    {!visiblePosts.length &&
                    !feedPage.busy &&
                    !feedPage.error ? (
                      <section className="view-panel empty-state">
                        <span className="section-kicker">
                          GOOD CONVERSATIONS START SMALL
                        </span>
                        <h2>
                          {filter === "following"
                            ? data.stats?.following
                              ? "Your reading circle is quiet."
                              : "Build your reading circle."
                            : "The next story could be yours."}
                        </h2>
                        <p>
                          {filter === "following"
                            ? data.stats?.following
                              ? "New public reviews, posts and shared reading progress from your circle will appear here."
                              : "Follow other readers to see their public reviews, posts and shared reading progress here."
                            : "Share a thought about what you are reading, or find your next book."}
                        </p>
                        <button
                          className="primary-btn"
                          onClick={() =>
                            filter === "following"
                              ? navigate("readers")
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
                  {data.recommendations.length > 0 ? (
                    <section className="view-panel home-recommendations">
                      <div className="collection-heading">
                        <h2>Next on your shelf</h2>
                        <a className="plain-link" href="#discover">
                          Explore all picks ↗
                        </a>
                      </div>
                      <div className="book-grid collection-books">
                        {data.recommendations.slice(0, 3).map((b) => (
                          <BookCard
                            key={b.id}
                            book={b}
                            reason={b.reason}
                            onOpen={openBookPage}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}
                </>
              ) : null}
              {!loading && view === "readers" ? (
                <ReaderDirectory
                  user={data.user}
                  onAuth={() => setAuth(true)}
                  onChanged={refresh}
                />
              ) : null}
              {!loading && view === "author" ? (
                <AuthorPage onBook={openBookPage} />
              ) : null}
              {!loading && view === "catalog" ? (
                <Catalog onBook={openBookPage} />
              ) : null}
              {!loading && view === "discover" ? (
                <section className="view-panel discover-page">
                  <div className="collection-heading">
                    <h2>
                      {query.trim().length >= 2
                        ? "Search results"
                        : "Recommended for you"}
                    </h2>
                    <a className="plain-link" href="#catalog">
                      Browse catalogue by genre and year ↗
                    </a>
                  </div>
                  <p className="view-intro">
                    {query.trim().length >= 2
                      ? "Choose a book to see its details and editions."
                      : data.user
                        ? "Picks shaped by your reading. Each book includes why it was selected."
                        : "Start with the Shelves collection, or search for a title you know."}
                  </p>
                  <div className="discovery-toolbar">
                    <label className="discover-search">
                      Book title or author
                      <input
                        type="search"
                        value={query}
                        maxLength={120}
                        onChange={(e) => setQuery(e.target.value)}
                        onCompositionStart={() => setSearchComposing(true)}
                        onCompositionEnd={() => setSearchComposing(false)}
                        placeholder="Try Ursula K. Le Guin"
                      />
                      {query ? (
                        <button
                          type="button"
                          className="plain-link"
                          onClick={(e) => {
                            setQuery("");
                            e.currentTarget.parentElement
                              ?.querySelector("input")
                              ?.focus();
                          }}
                        >
                          Clear search
                        </button>
                      ) : null}
                    </label>
                    <div className="library-tools">
                      <LanguageSelect
                        value={searchLanguage}
                        onChange={setSearchLanguage}
                        label="Search language"
                      />
                    </div>
                  </div>
                  {searching ? (
                    <BrandLoading label="Looking through the catalogue…" />
                  ) : null}
                  <ErrorMessage message={searchError} />
                  {searchError ? (
                    <button
                      className="outline-btn"
                      onClick={() => setSearchRetry((n) => n + 1)}
                    >
                      Retry search
                    </button>
                  ) : null}
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
                  <div className="book-grid collection-books">
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
                          : "No strong matches in the current catalog. Try a book search or update your reading preferences."}
                      </p>
                    </div>
                  ) : null}
                </section>
              ) : null}
              {!loading && view === "shelves" ? (
                <section className="view-panel library-page">
                  <div className="collection-heading">
                    <h2>{shelfTitle}</h2>
                    {data.user ? (
                      <button
                        className="outline-btn"
                        onClick={() => setComposer({ kind: "shelf" })}
                      >
                        + New shelf
                      </button>
                    ) : null}
                  </div>
                  {data.user ? (
                    <>
                      <div className="library-tabs">
                        <button
                          className={`outline-btn ${!shelf ? "selected" : ""}`}
                          aria-pressed={!shelf}
                          onClick={() => navigate("shelves")}
                        >
                          All books
                        </button>
                        {statuses.map((s) => (
                          <button
                            key={s}
                            className={`outline-btn ${shelf === s ? "selected" : ""}`}
                            aria-pressed={shelf === s}
                            onClick={() => navigate("shelves", s)}
                          >
                            {s}
                          </button>
                        ))}
                        {data.shelves.map((s) => (
                          <button
                            className={`outline-btn ${shelf === s.id ? "selected" : ""}`}
                            aria-pressed={shelf === s.id}
                            key={s.id}
                            onClick={() => navigate("shelves", s.id)}
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                      {selectedShelf ? (
                        <div className="shelf-actions">
                          <button
                            className="plain-link"
                            onClick={() =>
                              setShelfAction({
                                shelf: selectedShelf,
                                deleting: false,
                              })
                            }
                          >
                            Rename shelf
                          </button>
                          <button
                            className="plain-link danger-button"
                            onClick={() =>
                              setShelfAction({
                                shelf: selectedShelf,
                                deleting: true,
                              })
                            }
                          >
                            Delete shelf
                          </button>
                        </div>
                      ) : null}
                      <div className="library-tools library-toolbar">
                        <label>
                          Search my library
                          <input
                            type="search"
                            value={libraryQuery}
                            maxLength={120}
                            onChange={(e) => setLibraryQuery(e.target.value)}
                            placeholder="Title or author"
                          />
                        </label>
                        {libraryQuery ? (
                          <button
                            className="plain-link"
                            onClick={(e) => {
                              setLibraryQuery("");
                              e.currentTarget.parentElement
                                ?.querySelector("input")
                                ?.focus();
                            }}
                          >
                            Clear library search
                          </button>
                        ) : null}
                        <label>
                          Sort books
                          <select
                            value={librarySort}
                            onChange={(e) => setLibrarySort(e.target.value)}
                          >
                            <option value="recent">Recently updated</option>
                            <option value="title">Title A–Z</option>
                            <option value="author">Author A–Z</option>
                            <option value="rating">Highest rated</option>
                          </select>
                        </label>
                      </div>
                      <p className="search-source">
                        {filteredLibrary.length}{" "}
                        {filteredLibrary.length === 1 ? "book" : "books"}
                      </p>
                      <div className="book-grid collection-books">
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
                          <p>
                            {libraryQuery
                              ? "No books match this search. Try another title or author."
                              : "No books here yet. Find one that calls to you."}
                          </p>
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
                <section className="view-panel community-garden">
                  <div className="community-intro">
                    <div>
                      <span className="section-kicker">FIND YOUR PEOPLE</span>
                      <h2>Your reading circle</h2>
                      <p className="view-intro">
                        Real readers, shared curiosity, and your next good
                        conversation.
                      </p>
                      <p className="view-intro">
                        Reader matches use public four- and five-star reviews.
                      </p>
                      <div className="account-actions">
                        {data.user ? (
                          <a
                            className="plain-link"
                            href={`#readers?scope=following&reader=${data.user.id}`}
                          >
                            Readers you follow
                          </a>
                        ) : null}
                        <a className="plain-link" href="#readers">
                          Search readers and explore connections ↗
                        </a>
                      </div>
                    </div>
                    <img
                      className="reading-garden-art"
                      src="/art/reading-garden.svg"
                      width="360"
                      height="280"
                      alt=""
                      aria-hidden="true"
                    />
                  </div>
                  <div className="community-directory-heading">
                    <h3>Readers to know</h3>
                    <a href="#lists" className="plain-link">
                      Explore community book lists ↗
                    </a>
                  </div>
                  {data.readers.map((r) => (
                    <div className="person-row community-row" key={r.id}>
                      <Avatar
                        name={r.displayName}
                        src={
                          r.avatarVersion
                            ? `/api/readers/${r.id}/images/avatar?v=${r.avatarVersion}`
                            : undefined
                        }
                      />
                      <div className="person-info">
                        <a className="reader-link" href={`#reader/${r.id}`}>
                          <strong>
                            <ReaderName
                              name={r.displayName}
                              verified={r.isAdmin}
                            />
                          </strong>
                        </a>
                        <small>@{r.username}</small>
                        <p>{r.bio || "A new chapter on Shelves."}</p>
                        {r.reason ? (
                          <small className="reader-match">{r.reason}</small>
                        ) : null}
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
                data.user ? (
                  <div className="profile-page">
                    <ProfileIdentity
                      reader={data.user}
                      followers={data.stats?.followers || 0}
                      following={data.stats?.following || 0}
                    />
                    <section className="view-panel profile-tools">
                      <div className="account-actions">
                        <button className="primary-btn" onClick={startPost}>
                          Write a post
                        </button>
                        <a
                          className="outline-btn"
                          href={`#reader/${data.user.id}`}
                        >
                          View my public profile ↗
                        </a>
                        <button
                          className="plain-link"
                          disabled={busy}
                          onClick={() => void signOut()}
                        >
                          Sign out
                        </button>
                      </div>
                      <p>
                        {finished} of {goal} books finished this year ·{" "}
                        {data.stats?.pages || 0} pages tracked
                      </p>
                      <progress
                        aria-label="Yearly reading goal"
                        value={finished}
                        max={goal}
                      />
                      <details className="profile-edit">
                        <summary>Edit profile and reading goal</summary>
                        <ProfileForm user={data.user} onSaved={saved} />
                      </details>
                    </section>
                    <ProfileManagement user={data.user} onSaved={saved} />
                    <CurrentlyReading records={data.library} onSaved={saved} />
                    <ReaderPage
                      key={data.user.id}
                      wallOnly
                      id={data.user.id}
                      user={data.user}
                      revision={revision}
                      busy={busy}
                      onFollow={() => {}}
                      onLike={(p) =>
                        void mutate(
                          () =>
                            api(`/posts/${p.id}/like`, {
                              method: p.liked ? "DELETE" : "PUT",
                            }),
                          "Appreciation updated.",
                        )
                      }
                      onComment={(p) =>
                        setComposer({ kind: "comment", post: p })
                      }
                      onDelete={(p) => setComposer({ kind: "delete", post: p })}
                    />
                  </div>
                ) : (
                  <section className="view-panel empty-state">
                    <h2>Your reading life belongs here.</h2>
                    <p>
                      Create an account to keep your library and goal together.
                    </p>
                    <button
                      className="primary-btn"
                      onClick={() => setAuth(true)}
                    >
                      Join Shelves ↗
                    </button>
                  </section>
                )
              ) : null}
            </section>
            <aside className="right-rail">
              {spotlight ? (
                <section className="rail-card book-pick-card">
                  <span className="section-kicker">A LITTLE INSPIRATION</span>
                  <h3>Today's book nook</h3>
                  <div className="pick-book">
                    <Cover book={spotlight} small />
                    <div className="pick-info">
                      <span className="tag tag-sage">{spotlight.genre}</span>
                      <h4>
                        <a
                          className="book-open"
                          href={`#book/${spotlight.id}`}
                          aria-label={`Read about ${spotlight.title}`}
                        >
                          {spotlight.title}
                        </a>
                      </h4>
                      <p>{spotlight.author}</p>
                    </div>
                  </div>
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
                    <Avatar
                      name={r.displayName}
                      src={
                        r.avatarVersion
                          ? `/api/readers/${r.id}/images/avatar?v=${r.avatarVersion}`
                          : undefined
                      }
                    />
                    <div className="person-info">
                      <a className="reader-link" href={`#reader/${r.id}`}>
                        <strong>
                          <ReaderName
                            name={r.displayName}
                            verified={r.isAdmin}
                          />
                        </strong>
                      </a>
                      <small>@{r.username}</small>
                      {r.reason ? (
                        <small className="reader-match">{r.reason}</small>
                      ) : null}
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
            </aside>
          </div>
          <SiteFooter />
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
      {shelfAction ? (
        <ShelfDialog
          shelf={shelfAction.shelf}
          deleting={shelfAction.deleting}
          onClose={() => setShelfAction(null)}
          onSaved={async () => {
            await saved();
            if (shelfAction.deleting) navigate("shelves");
          }}
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
