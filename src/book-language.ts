import { bookLanguages, languageName } from "../shared/languages";

// Time zone is an approximate location hint and needs no location permission.
const localLanguages: Record<string, string> = {
  Sofia: "bg",
  Berlin: "de",
  Paris: "fr",
  Madrid: "es",
  Rome: "it",
  Lisbon: "pt",
  Amsterdam: "nl",
  Warsaw: "pl",
  Bucharest: "ro",
  Athens: "el",
  Istanbul: "tr",
  Kyiv: "uk",
  Moscow: "ru",
  Tokyo: "ja",
  Seoul: "ko",
  Shanghai: "zh",
  Kolkata: "hi",
};
export function automaticBookLanguage() {
  const zone =
    Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").at(-1) || "";
  const located = localLanguages[zone];
  const browser = (navigator.languages?.[0] || navigator.language || "en")
    .split("-")[0]
    .toLowerCase();
  return (
    bookLanguages.find((code) => code === located) ||
    bookLanguages.find((code) => code === browser) ||
    "en"
  );
}
export function automaticLanguageLabel() {
  return `Automatic (${languageName(automaticBookLanguage())})`;
}
