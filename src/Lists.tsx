import { useEffect, useState } from "react";
import type { Book, BookList, User } from "../shared/types";
import { api, json } from "./api";
import {
  BookCard,
  Cover,
  Dialog,
  ErrorMessage,
  Form,
  Icon,
} from "./components";
import { ListBookPicker } from "./ListBookPicker";
import { PageNavigation, useNumberedPage } from "./NumberedPages";
import { ListDiscussion } from "./ListDiscussion";

export function Lists({
  id,
  user,
  onAuth,
  onBook,
}: {
  id: string | null;
  user: User | null;
  onAuth: () => void;
  onBook: (book: Book) => void;
}) {
  const [items, setItems] = useState<BookList[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [editing, setEditing] = useState<BookList | "new" | null>(null),
    [deleting, setDeleting] = useState(false),
    [busy, setBusy] = useState(false),
    [params, setParams] = useState(location.hash.split("?")[1] || ""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const update = () => setParams(location.hash.split("?")[1] || "");
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const filters = new URLSearchParams(params),
    mine = filters.get("scope") === "mine";
  const browsing = useNumberedPage<BookList>(
    `/lists?scope=${mine ? "mine" : "all"}&page=${filters.get("page") || "1"}`,
    revision,
    !id,
    user?.id,
  );
  function go(page: number, own = mine) {
    location.hash = `lists?scope=${own ? "mine" : "all"}&page=${page}`;
  }
  useEffect(() => {
    if (!id) {
      setLoading(false);
      setItems([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setItems([]);
    setNotice("");
    api<BookList>(`/lists/${id}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setItems([result]);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, user?.id, revision]);
  const current = id ? items[0] : null;
  async function remove() {
    if (!current || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/lists/${current.id}`, { method: "DELETE" });
      setDeleting(false);
      location.hash = "lists";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete list.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="view-panel list-page">
        <div className="visual-page-heading">
          <span className="page-emblem" aria-hidden="true">
            <Icon name="shelves" />
          </span>
          <div>
            <h2>
              {current?.title ||
                (id ? "A reader’s collection" : "Book collections")}
            </h2>
            <p className="view-intro">
              {current?.description ||
                (id
                  ? ""
                  : "Your collections and discoveries from other readers.")}
            </p>
          </div>
        </div>
        <div className="list-actions visual-toolbar">
          {id ? (
            <a
              className="visual-icon-action"
              href="#lists"
              aria-label="All book lists"
              title="All book lists"
            >
              <Icon name="back" />
            </a>
          ) : (
            <button
              className="primary-btn"
              onClick={() => (user ? setEditing("new") : onAuth())}
            >
              <Icon name="plus" /> Create a list
            </button>
          )}
          {!id && user ? (
            <button
              className="outline-btn icon-label"
              aria-pressed={mine}
              onClick={() => go(1, !mine)}
            >
              <Icon name={mine ? "community" : "profile"} />
              {mine ? "Show all lists" : "Show my lists"}
            </button>
          ) : null}
          {current ? (
            <span>
              {current.visibility === "private"
                ? "Private · Only you"
                : "Public"}{" "}
              · {current.books.length} books · {current.displayName}
            </span>
          ) : null}
          {current?.userId === user?.id && current ? (
            <>
              <button
                className="visual-icon-action"
                aria-label="Edit list"
                title="Edit list"
                onClick={() => setEditing(current)}
              >
                <Icon name="journal" />
              </button>
              <button
                className="visual-icon-action"
                aria-label="Delete list"
                title="Delete list"
                onClick={() => setDeleting(true)}
              >
                <Icon name="trash" />
              </button>
            </>
          ) : null}
          {current?.visibility === "public" ? (
            <button
              className="visual-icon-action"
              aria-label="Copy share link"
              title="Copy share link"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(location.href);
                  setNotice("List link copied.");
                } catch {
                  setNotice(
                    "Copy the link from your browser’s address bar to share this list.",
                  );
                }
              }}
            >
              <Icon name="share" />
            </button>
          ) : null}
        </div>
        {notice ? <p role="status">{notice}</p> : null}
        <ErrorMessage message={error} />
        {error && !deleting ? (
          <button
            className="outline-btn"
            onClick={() => setRevision(revision + 1)}
          >
            Try again
          </button>
        ) : null}
        {(id ? loading : browsing.busy) ? (
          <p role="status">Opening book lists…</p>
        ) : current ? (
          current.books.length ? (
            <div className="book-grid collection-books">
              {current.books.map((book) => (
                <BookCard key={book.id} book={book} onOpen={onBook} />
              ))}
            </div>
          ) : (
            <p className="empty-state">
              No books yet. This collection is waiting for its first story.
            </p>
          )
        ) : !id ? (
          <div className="list-collection">
            {browsing.data?.items.map((item) => (
              <article className="list-summary" key={item.id}>
                <div className="list-jackets" aria-hidden="true">
                  {item.books.length ? (
                    item.books
                      .slice(0, 3)
                      .map((book) => <Cover key={book.id} book={book} small />)
                  ) : (
                    <img
                      className="list-art"
                      src="/art/reading-garden.svg"
                      alt=""
                      width="180"
                      height="140"
                    />
                  )}
                </div>
                <div className="list-summary-copy">
                  <span className="section-kicker">
                    <Icon
                      name={
                        item.visibility === "private" ? "lock" : "community"
                      }
                    />{" "}
                    {item.visibility} · {item.books.length} books
                  </span>
                  <h3>
                    <a href={`#list/${item.id}`}>{item.title}</a>
                  </h3>
                  {item.description ? <p>{item.description}</p> : null}
                  <small>Collected by {item.displayName}</small>
                </div>
              </article>
            ))}
            {browsing.data?.total === 0 ? (
              <div className="visual-empty">
                <img
                  src="/art/reading-garden.svg"
                  alt=""
                  width="180"
                  height="140"
                />
                <h3>Your next collection starts here</h3>
                <p>Use Create a list to gather your first books.</p>
              </div>
            ) : null}
          </div>
        ) : null}
        {!id && (
          <>
            <ErrorMessage message={browsing.error} />
            {browsing.error && (
              <button className="outline-btn" onClick={browsing.retry}>
                Try again
              </button>
            )}
            {browsing.data && (
              <PageNavigation
                {...browsing.data}
                busy={browsing.busy}
                onPage={go}
              />
            )}
          </>
        )}
      </section>
      {current && !loading ? (
        <ListDiscussion
          key={`${current.id}-${current.visibility}-${user?.id || "guest"}`}
          list={current}
          user={user}
          onAuth={onAuth}
        />
      ) : null}
      {editing ? (
        <ListEditor
          list={editing === "new" ? null : editing}

          onClose={() => setEditing(null)}
          onSaved={(listId) => {
            setEditing(null);
            setRevision(revision + 1);
            location.hash = `list/${listId}`;
          }}
        />
      ) : null}
      {deleting && current ? (
        <Dialog
          title="Delete this list?"
          onClose={() => {
            if (!busy) setDeleting(false);
          }}
        >
          <h2>Delete this list?</h2>
          <p>
            “{current.title}” will be permanently removed. Books in your
            personal shelves will stay there.
          </p>
          <ErrorMessage message={error} />
          <div className="list-actions">
            <button
              className="outline-btn"
              autoFocus
              disabled={busy}
              onClick={() => setDeleting(false)}
            >
              Keep list
            </button>
            <button
              className="primary-btn"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

export function ListEditor({
  list,
  initialBook,
  onClose,
  onSaved,
}: {
  list: BookList | null;
  initialBook?: Book;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [books, setBooks] = useState<Book[]>(
      list?.books || (initialBook ? [initialBook] : []),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [fieldsDirty, setFieldsDirty] = useState(false);
  const dirty =
    fieldsDirty ||
    JSON.stringify(books.map((b) => b.id)) !==
      JSON.stringify((list?.books || []).map((b) => b.id));
  function move(index: number, offset: number) {
    const next = [...books];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setBooks(next);
  }
  return (
    <Dialog
      title={list ? "Edit book list" : "Create a book list"}
      dirty={!busy && dirty}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <h2>{list ? "Shape your collection." : "Start a collection."}</h2>
      <Form
        onChange={(e) => {
          if (
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement ||
            e.target instanceof HTMLSelectElement
          ) {
            if (e.target.name) setFieldsDirty(true);
          }
        }}
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const values = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            const result = await api<{ id: string }>(
              list ? `/lists/${list.id}` : "/lists",
              json(list ? "PUT" : "POST", {
                title: values.get("title"),
                description: values.get("description"),
                visibility: values.get("visibility"),
                bookIds: books.map((b) => b.id),
              }),
            );
            onSaved(result.id);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save list.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="list-fields">
          <label>
            List title
            <input
              name="title"
              required
              maxLength={100}
              defaultValue={list?.title || ""}
            />
          </label>
          <label>
            Description
            <textarea
              className="resize-none"
              name="description"
              maxLength={1000}
              rows={3}
              defaultValue={list?.description || ""}
            />
          </label>
          <label>
            Who can see this list?
            <select
              name="visibility"
              defaultValue={list?.visibility || "private"}
            >
              <option value="private">Private — only me</option>
              <option value="public">
                Public — anyone with access to Shelves
              </option>
            </select>
          </label>
          <p>
            Public lists can be viewed without signing in. Your private reading
            notes stay private.
          </p>
          <h3>Books in order ({books.length}/50)</h3>
          <ol className="list-editor-books">
            {books.map((book, index) => (
              <li key={book.id}>
                <span>
                  {book.title}
                  <small>{book.author}</small>
                </span>
                <div className="list-actions">
                  <button
                    type="button"
                    className="outline-btn"
                    disabled={index === 0}
                    aria-label={`Move ${book.title} up`}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="outline-btn"
                    disabled={index === books.length - 1}
                    aria-label={`Move ${book.title} down`}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="plain-link"
                    aria-label={`Remove ${book.title}`}
                    onClick={() =>
                      setBooks(books.filter((b) => b.id !== book.id))
                    }
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ol>
          {!books.length ? (
            <p>Add books below, or save an empty collection for later.</p>
          ) : null}
          <ListBookPicker
            books={books}
            onAdd={(book) =>
              setBooks((old) =>
                old.length >= 50 || old.some((b) => b.id === book.id)
                  ? old
                  : [...old, book],
              )
            }
          />
          <ErrorMessage message={error} />
          <button className="primary-btn" type="submit">
            {busy ? "Saving…" : "Save list"}
          </button>
        </fieldset>
      </Form>
    </Dialog>
  );
}
