export type CookieChoice = "region" | "essential" | null;
const key = "shelvesCookieChoice";
export function readCookieChoice(): CookieChoice {
  try {
    const value = localStorage.getItem(key);
    return value === "region" || value === "essential" ? value : null;
  } catch {
    return null;
  }
}
export function saveCookieChoice(choice: Exclude<CookieChoice, null>) {
  try {
    localStorage.setItem(key, choice);
  } catch {
    /* Remember for this page load. */
  }
  window.dispatchEvent(
    new CustomEvent("shelves-cookie-choice", { detail: choice }),
  );
}
