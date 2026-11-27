import { useEffect, useState } from "react";
import {
  readCookieChoice,
  saveCookieChoice,
  type CookieChoice,
} from "./cookie-choice";

function useChoice() {
  const [choice, setChoice] = useState<CookieChoice>(readCookieChoice);
  useEffect(() => {
    const update = (event: Event) =>
      setChoice((event as CustomEvent<CookieChoice>).detail);
    window.addEventListener("shelves-cookie-choice", update);
    return () => window.removeEventListener("shelves-cookie-choice", update);
  }, []);
  return {
    choice,
    choose: (next: "region" | "essential") => {
      saveCookieChoice(next);
      setChoice(next);
    },
  };
}
export function CookieConsent() {
  const { choice, choose } = useChoice();
  if (choice) return null;
  return (
    <aside
      className="cookie-consent"
      role="region"
      aria-label="Cookie and region choices"
    >
      <div className="cookie-art" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="cookie-consent-copy">
        <span className="section-kicker">A NOTE FROM SHELVES</span>
        <h2>A little local color?</h2>
        <p>
          We can use your browser’s approximate region to suggest books in a
          local language. If there are no matches, we show English books. No
          precise location permission is needed.
        </p>
        <p className="cookie-consent-small">
          A sign-in cookie keeps accounts working. We do not use advertising or
          analytics cookies.
        </p>
      </div>
      <div className="cookie-consent-actions">
        <button
          type="button"
          className="primary-btn"
          onClick={() => choose("region")}
        >
          Use my region <span aria-hidden="true">↗</span>
        </button>
        <button
          type="button"
          className="outline-btn"
          onClick={() => choose("essential")}
        >
          English by default
        </button>
        <a href="#cookies">How Shelves uses storage</a>
      </div>
    </aside>
  );
}
export function CookieChoices() {
  const { choice, choose } = useChoice();
  return (
    <section
      className="cookie-choice-panel"
      aria-labelledby="cookie-choice-heading"
    >
      <h3 id="cookie-choice-heading">Your region choice</h3>
      <p>
        {choice === "region"
          ? "Approximate region is on for book recommendations."
          : choice === "essential"
            ? "English is the default recommendation language."
            : "Choose how Shelves picks your default book language."}
      </p>
      <div className="cookie-choice-actions">
        <button
          type="button"
          className={choice === "region" ? "primary-btn" : "outline-btn"}
          aria-pressed={choice === "region"}
          onClick={() => choose("region")}
        >
          Use my region
        </button>
        <button
          type="button"
          className={choice === "essential" ? "primary-btn" : "outline-btn"}
          aria-pressed={choice === "essential"}
          onClick={() => choose("essential")}
        >
          English by default
        </button>
      </div>
    </section>
  );
}
