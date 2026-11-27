import { useEffect, useState } from "react";
import { bookLanguages, languageName } from "../shared/languages";
import { api, json } from "./api";
import { automaticLanguageLabel } from "./book-language";

export function BookLanguageSettings({
  value,
  signedIn,
  onSaved,
}: {
  value: string;
  signedIn: boolean;
  onSaved: () => Promise<void>;
}) {
  const [language, setLanguage] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => setLanguage(value), [value]);
  async function save() {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      if (signedIn)
        await api("/settings/book-language", json("PUT", { language }));
      localStorage.setItem("bookLanguage", language);
      await onSaved();
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save your language.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="view-panel book-language-settings">
      <span className="section-kicker">YOUR READING LANGUAGE</span>
      <h2>Books in your language</h2>
      <p>
        Choose the language for book recommendations. Automatic uses your
        browser’s region as a hint. When there are no matching books, Shelves
        shows English editions.
      </p>
      <label htmlFor="preferred-book-language">Preferred book language</label>
      <div className="book-language-controls">
        <select
          id="preferred-book-language"
          value={language}
          onChange={(event) => {
            setLanguage(event.target.value);
            setSaved(false);
          }}
        >
          <option value="">{automaticLanguageLabel()}</option>
          {bookLanguages.map((code) => (
            <option key={code} value={code}>
              {languageName(code)}
            </option>
          ))}
        </select>
        <button
          className="primary-btn"
          type="button"
          disabled={busy || language === value}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save language"}
        </button>
      </div>
      {saved ? <p role="status">Book language saved.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
