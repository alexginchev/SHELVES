import { readingGenres } from "../shared/genres";
import { useEffect, useState } from "react";
import type { ReadingPreferences as Preferences, User } from "../shared/types";
import { api, json } from "./api";
import { ErrorMessage, Form } from "./components";

export function ReadingPreferences({
  user,
  onAuth,
  onSaved,
}: {
  user: User | null;
  onAuth: () => void;
  onSaved: () => Promise<void>;
}) {
  const [genres, setGenres] = useState<string[]>([]),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    setLoaded(false);
    setNotice("");
    setError("");
    setGenres([]);
    if (!user) return;
    const controller = new AbortController();
    api<Preferences>("/preferences", { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          setGenres(data.genres);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [user?.id, retry]);
  async function save(selected: string[]) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/preferences", json("PUT", { genres: selected }));
      setGenres(selected);
      await onSaved();
      setNotice(
        selected.length
          ? "Your reading preferences are saved. Discover has fresh suggestions for you."
          : "Preferences saved without favorite genres. Your reading activity will still shape suggestions.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save preferences.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="view-panel reading-preferences">
      <span className="section-kicker">MAKE THIS NOOK YOURS</span>
      <h2>What do you love to read?</h2>
      <p>
        Choose up to five favorite genres to guide your recommendations. These
        choices are private, and you can change them any time.
      </p>
      <ErrorMessage message={error} />
      {!user ? (
        <button className="primary-btn" onClick={onAuth}>
          Sign in to choose preferences
        </button>
      ) : !loaded ? (
        error ? (
          <button className="outline-btn" onClick={() => setRetry(retry + 1)}>
            Try again
          </button>
        ) : (
          <p role="status">Loading your preferences…</p>
        )
      ) : (
        <Form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save(genres);
          }}
        >
          <fieldset className="genre-options" disabled={busy}>
            <legend>Favorite genres ({genres.length}/5)</legend>
            {readingGenres.map((genre) => (
              <label key={genre}>
                <input
                  type="checkbox"
                  checked={genres.includes(genre)}
                  disabled={!genres.includes(genre) && genres.length >= 5}
                  onChange={(e) => {
                    setNotice("");
                    setGenres(
                      e.target.checked
                        ? [...genres, genre]
                        : genres.filter((g) => g !== genre),
                    );
                  }}
                />
                {genre}
              </label>
            ))}
          </fieldset>
          <p>
            Recommendations come from the current book catalogue. Ratings, saved
            books and dismissed suggestions also shape what appears.
          </p>
          <div className="account-actions">
            <button className="primary-btn" disabled={busy}>
              {busy ? "Saving…" : "Save preferences"}
            </button>
            <button
              className="plain-link"
              type="button"
              disabled={busy}
              onClick={() => void save([])}
            >
              Continue without favorite genres
            </button>
          </div>
          {notice ? <p role="status">{notice}</p> : null}
          <a className="plain-link" href="#discover">
            Explore recommendations ↗
          </a>
        </Form>
      )}
    </section>
  );
}
