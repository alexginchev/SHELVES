import { useState } from "react";
import type { Book, BookList } from "../shared/types";
import { api, json } from "./api";
import { Dialog, ErrorMessage } from "./components";
import { ListEditor } from "./Lists";
import { PageNavigation, useNumberedPage } from "./NumberedPages";

export function AddToList({
  book,
  onClose,
}: {
  book: Book;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1),
    [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const [saved, setSaved] = useState<{ id: string; title: string } | null>(
    null,
  );
  const result = useNumberedPage<BookList>(`/lists?scope=mine&page=${page}`);
  if (creating)
    return (
      <ListEditor
        list={null}
        initialBook={book}
        onClose={() => setCreating(false)}
        onSaved={(id) => {
          setCreating(false);
          setSaved({ id, title: "your new list" });
        }}
      />
    );
  return (
    <Dialog
      title="Add to a list"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <h2>Add to a list</h2>
      <p>{book.title}</p>
      {saved ? (
        <>
          <p role="status">Saved to {saved.title}.</p>
          <a
            className="plain-link"
            href={`#list/${saved.id}`}
            onClick={onClose}
          >
            Open list
          </a>
        </>
      ) : (
        <>
          <button
            className="outline-btn"
            disabled={!!busy}
            onClick={() => setCreating(true)}
          >
            Create a new list
          </button>
          <ErrorMessage message={error || result.error} />
          {result.error && (
            <button className="outline-btn" onClick={result.retry}>
              Try again
            </button>
          )}
          {result.busy ? (
            <p role="status">Opening your lists…</p>
          ) : (
            <div className="list-picker">
              {result.data?.items.map((list) => {
                const included = list.books.some((b) => b.id === book.id);
                return (
                  <div key={list.id}>
                    <span>
                      {list.title}
                      <small>
                        {list.visibility} · {list.books.length}/50 books
                      </small>
                    </span>
                    <button
                      className="outline-btn"
                      disabled={!!busy || included || list.books.length >= 50}
                      onClick={async () => {
                        if (busy) return;
                        setBusy(list.id);
                        setError("");
                        try {
                          await api(
                            `/lists/${list.id}/books`,
                            json("POST", { bookId: book.id }),
                          );
                          setSaved({ id: list.id, title: list.title });
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Could not add this book. Try again.",
                          );
                        } finally {
                          setBusy("");
                        }
                      }}
                    >
                      {busy === list.id
                        ? "Adding…"
                        : included
                          ? "Already added"
                          : list.books.length >= 50
                            ? "List full"
                            : "Add to list"}
                    </button>
                  </div>
                );
              })}
              {result.data?.total === 0 && (
                <p>No lists yet. Create one to collect your books.</p>
              )}
            </div>
          )}
          {result.data && (
            <PageNavigation
              {...result.data}
              busy={!!busy || result.busy}
              onPage={setPage}
            />
          )}
        </>
      )}
    </Dialog>
  );
}
