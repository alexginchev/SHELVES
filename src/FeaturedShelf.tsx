import { useEffect, useMemo, useRef, useState } from "react";
import type { Book, Recommendation } from "../shared/types";
import { Icon } from "./components";
import documentHtml from "./featured-shelf.html?raw";

export type Theme = "light" | "dark";

function shelfDocument(picks: Recommendation[]) {
  const doc = new DOMParser().parseFromString(documentHtml, "text/html");
  // The original timeline opens slot 2 on entry and when the mouse leaves.
  const slots = [
    ["2", 0],
    ["0", 1],
    ["1", 2],
    ["side", 3],
  ] as const;
  for (const [slot, rank] of slots) {
    const book = picks[rank];
    const hitbox = doc.querySelector<HTMLElement>(
      `.books__hitbox[data-book-index="${slot}"], .side-book[data-book-index="${slot}"]`,
    )!;
    const item = hitbox.closest<HTMLElement>(".books__item") ?? hitbox;
    const details = doc.querySelector<HTMLElement>(
      `.book-description[data-book-index="${slot}"]`,
    )!;
    if (!book) {
      item.hidden = true;
      details.hidden = true;
      continue;
    }

    hitbox.dataset.bookTitle = book.title;
    hitbox.dataset.bookId = book.id;
    details.dataset.bookId = book.id;
    details.querySelector("h3")!.textContent = book.title;
    details.querySelector(".author")!.textContent = `by ${book.author}`;
    const description = book.description.trim();
    const summary =
      description.length > 300
        ? `${description.slice(0, 298).replace(/\s+\S*$/, "")}…`
        : description;
    details.querySelector("p")!.textContent = summary || book.reason;

    const spineLabel = item.querySelector(".side-book__title");
    if (spineLabel) spineLabel.textContent = book.title;
    const image = item.querySelector("img");
    if (image) {
      if (book.cover && /^(?:\/(?!\/)|https:\/\/)/i.test(book.cover))
        image.src = book.cover;
      image.alt = `${book.title} cover`;
      const fallback = doc.createElement("span");
      fallback.className = "shelf-jacket-fallback";
      fallback.textContent = book.title;
      fallback.setAttribute("aria-hidden", "true");
      image.before(fallback);
    }
  }
  doc.querySelector(".book-title-text")!.textContent = picks[0].title;
  return "<!doctype html>" + doc.documentElement.outerHTML;
}

export function FeaturedShelf({
  recommendations,
  theme,
  onTheme,
  onOpen,
}: {
  recommendations: Recommendation[];
  theme: Theme;
  onTheme: (theme: Theme) => void;
  onOpen: (book: Book) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const picks = useMemo(() => recommendations.slice(0, 4), [recommendations]);
  const html = useMemo(
    () => (picks.length ? shelfDocument(picks) : ""),
    [picks],
  );
  const selected = picks.find((book) => book.id === selectedId) ?? picks[0];

  function syncFrameTheme() {
    frame.current?.contentWindow?.postMessage(
      { type: "shelves-app-theme", theme },
      window.location.origin,
    );
  }

  useEffect(() => {
    function syncShelf(event: MessageEvent) {
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== window.location.origin
      )
        return;
      if (event.data?.type === "featured-shelf-theme") {
        onTheme(event.data.theme === "light" ? "light" : "dark");
      }
      if (event.data?.type === "featured-shelf-selection") {
        setSelectedId(event.data.id);
      }
      if (event.data?.type === "featured-shelf-open") {
        const book = picks.find((pick) => pick.id === event.data.id);
        if (book) onOpen(book);
      }
      if (
        event.data?.type === "featured-shelf-size" &&
        Number.isInteger(event.data.height)
      ) {
        const height = Math.min(1200, Math.max(300, event.data.height));
        frame.current?.style.setProperty(
          "--shelf-content-height",
          `${height}px`,
        );
      }
    }
    window.addEventListener("message", syncShelf);
    return () => window.removeEventListener("message", syncShelf);
  }, [onOpen, onTheme, picks]);

  useEffect(syncFrameTheme, [theme]);

  return (
    <section className="featured-shelf" aria-label="Recommended books">
      {selected ? (
        <iframe
          ref={frame}
          title="Interactive featured book collection"
          srcDoc={html}
          onLoad={syncFrameTheme}
        />
      ) : (
        <p className="featured-shelf-empty">
          No matching recommendations right now.
        </p>
      )}
      <div className="featured-shelf-footer">
        {selected ? <p>{selected.reason}</p> : null}
        <div className="featured-shelf-actions">
          {selected ? (
            <a
              className="primary-btn"
              href={`#book/${selected.id}`}
              aria-label={`View ${selected.title}`}
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.ctrlKey ||
                  event.metaKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                onOpen(selected);
              }}
            >
              View book <Icon name="arrowUpRight" />
            </a>
          ) : null}
          <a className="outline-btn" href="#discover">
            Discover books
          </a>
        </div>
      </div>
    </section>
  );
}
