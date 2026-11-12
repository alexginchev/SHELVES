import { useState } from "react";
import type { Reading } from "../shared/types";
import { api, json } from "./api";
import { Cover, Dialog, ErrorMessage, Form } from "./components";
export function CurrentlyReading({
  records,
  onSaved,
}: {
  records: Reading[];
  onSaved: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<Reading | null>(null);
  const books = records.filter((r) => r.status === "Currently reading");
  return (
    <section className="view-panel current-reading">
      <div className="collection-heading">
        <h2>Currently reading</h2>
        <a className="plain-link" href="#shelves">
          Open my shelves ↗
        </a>
      </div>
      <p className="reading-privacy">
        Your place in each book. Progress stays private unless you share it.
      </p>
      {books.length ? (
        books.map((record) => (
          <div className="current-reading-book" key={record.bookId}>
            <Cover book={record.book} small />
            <div>
              <a className="reader-link" href={`#book/${record.bookId}`}>
                <h3>{record.book.title}</h3>
              </a>
              <p>{record.book.author}</p>
              <p>
                Page {record.page}
                {record.book.pages ? ` of ${record.book.pages}` : ""}
              </p>
              {record.book.pages ? (
                <progress
                  aria-label={`Progress in ${record.book.title}`}
                  value={record.page}
                  max={record.book.pages}
                />
              ) : null}
              <button
                className="outline-btn"
                onClick={() => setSelected(record)}
              >
                Update progress
              </button>
            </div>
          </div>
        ))
      ) : (
        <div className="reading-start">
          <h3>What are you reading?</h3>
          <p>
            Open a book and choose Currently reading to track your place here.
          </p>
          <div className="account-actions">
            <a className="primary-btn" href="#discover">
              Find a book
            </a>
            <a className="plain-link" href="#shelves">
              Choose from my shelves
            </a>
          </div>
        </div>
      )}
      {selected ? (
        <ProgressDialog
          record={selected}
          onClose={() => setSelected(null)}
          onSaved={onSaved}
        />
      ) : null}
    </section>
  );
}
function ProgressDialog({
  record,
  onClose,
  onSaved,
}: {
  record: Reading;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [share, setShare] = useState(false);
  return (
    <Dialog
      title="Update reading progress"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <h2>Another page turned.</h2>
      <p>{record.book.title}</p>
      <Form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const data = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            await api(
              `/library/${record.bookId}/progress`,
              json("POST", {
                page: Number(data.get("page")),
                share,
                note: String(data.get("note") || ""),
              }),
            );
            await onSaved();
            onClose();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Could not save progress.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Current page
          <input
            type="number"
            name="page"
            required
            min={0}
            max={record.book.pages || 50000}
            defaultValue={record.page}
          />
        </label>
        <label className="shelf-check">
          <input
            type="checkbox"
            checked={share}
            onChange={(e) => setShare(e.target.checked)}
          />
          Share this update on my wall
        </label>
        {share ? (
          <label>
            Add a public note (optional)
            <textarea className="resize-none" name="note" maxLength={600} />
          </label>
        ) : (
          <p className="local-note">
            Your progress stays private unless you choose to share it.
          </p>
        )}
        <ErrorMessage message={error} />
        <button className="primary-btn" disabled={busy}>
          {busy ? "Saving…" : "Save progress"}
        </button>
      </Form>
    </Dialog>
  );
}
