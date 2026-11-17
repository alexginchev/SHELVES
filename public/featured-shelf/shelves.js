const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
function respectMotion() {
  if (window.gsap)
    window.gsap.globalTimeline.timeScale(reducedMotion.matches ? 1000 : 1);
}
respectMotion();
reducedMotion.addEventListener("change", respectMotion);

document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("theme-toggle");
  const preview = document.querySelector(".shelf-container");
  const books = preview.querySelectorAll(".books__hitbox, .side-book");
  const parentOrigin = new URL(document.baseURI).origin;

  function publishTheme() {
    const dark = document.body.classList.contains("dark-mode");
    toggle.setAttribute("aria-pressed", String(!dark));
    window.parent.postMessage(
      { type: "featured-shelf-theme", theme: dark ? "dark" : "light" },
      parentOrigin,
    );
  }

  function enableKeyboard(element, label, activate) {
    element.tabIndex = 0;
    element.setAttribute("role", "button");
    element.setAttribute("aria-label", label);
    element.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      activate();
    });
  }

  enableKeyboard(toggle, "Light theme", () => toggle.click());
  toggle.addEventListener("click", publishTheme);
  publishTheme();
  window.addEventListener("message", (event) => {
    if (
      event.source !== window.parent ||
      event.origin !== parentOrigin ||
      event.data?.type !== "shelves-app-theme"
    )
      return;
    const dark = document.body.classList.contains("dark-mode");
    if (dark !== (event.data.theme === "dark")) toggle.click();
  });

  for (const book of books) {
    if (book.closest("[hidden]")) continue;
    const openBook = () => {
      window.parent.postMessage(
        { type: "featured-shelf-open", id: book.dataset.bookId },
        parentOrigin,
      );
    };
    enableKeyboard(book, book.dataset.bookTitle, openBook);
    book.addEventListener("focus", () =>
      book.dispatchEvent(new MouseEvent("mouseenter")),
    );
    book.addEventListener("click", openBook);
  }
  preview.addEventListener(
    "mouseleave",
    (event) => {
      event.stopImmediatePropagation();
    },
    { capture: true },
  );
  const titleOverlay = document.querySelector(".book-title-overlay");
  const titleText = titleOverlay.querySelector(".book-title-text");
  const ledge = preview.querySelector(".shelf");
  const measure = document.createElement("canvas").getContext("2d");
  titleOverlay.setAttribute("aria-hidden", "true");

  function fitTitle() {
    const height = ledge.getBoundingClientRect().bottom + 34;
    titleOverlay.style.setProperty("--shelf-title-height", `${height}px`);
    if (!measure) return;
    const title = titleText.textContent.trim().toUpperCase();
    if (!title) return;
    const width = titleOverlay.clientWidth * 0.84;
    measure.font = '800 100px "Cabinet Grotesk"';
    const longest = Math.max(
      ...title.split(/\s+/).map((word) => measure.measureText(word).width),
    );
    const full = measure.measureText(title).width;
    const size = Math.min(
      height * 0.67,
      (width * 100) / longest,
      (width * 175) / full,
    );
    titleText.style.setProperty("--shelf-title-size", `${Math.floor(size)}px`);
    const drawnHeight = titleText.getBoundingClientRect().height;
    if (drawnHeight > height * 0.9) {
      titleText.style.setProperty(
        "--shelf-title-size",
        `${Math.floor((size * height * 0.9) / drawnHeight)}px`,
      );
    }
  }

  new MutationObserver(fitTitle).observe(titleText, { childList: true });
  void document.fonts.ready.then(fitTitle);
  window.addEventListener("resize", fitTitle);

  const details = preview.querySelector(".book-descriptions");
  function publishSelection() {
    const id = details.querySelector(".book-description.active")?.dataset
      .bookId;
    if (id)
      window.parent.postMessage(
        { type: "featured-shelf-selection", id },
        parentOrigin,
      );
  }
  publishSelection();
  new MutationObserver(publishSelection).observe(details, {
    attributes: true,
    attributeFilter: ["class"],
    subtree: true,
  });
  for (const image of preview.querySelectorAll(".books__image img[src]")) {
    if (image.complete && !image.naturalWidth) image.removeAttribute("src");
    else
      image.addEventListener("error", () => image.removeAttribute("src"), {
        once: true,
      });
  }

  const observer = new ResizeObserver(() => {
    fitTitle();
    const mobile = window.matchMedia("(max-width: 700px)").matches;
    window.parent.postMessage(
      {
        type: "featured-shelf-size",
        height:
          Math.ceil(preview.getBoundingClientRect().height) + (mobile ? 0 : 48),
      },
      parentOrigin,
    );
  });
  observer.observe(preview);
});
