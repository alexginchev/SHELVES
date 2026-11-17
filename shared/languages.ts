export const bookLanguages = [
  "en",
  "bg",
  "de",
  "fr",
  "es",
  "it",
  "pt",
  "nl",
  "pl",
  "ro",
  "el",
  "tr",
  "uk",
  "ru",
  "ar",
  "he",
  "hi",
  "zh",
  "ja",
  "ko",
] as const;
const names = new Intl.DisplayNames(["en"], { type: "language" });
export function languageName(code: string | null | undefined) {
  if (!code) return "Language not supplied";
  try {
    return names.of(code) || code;
  } catch {
    return code;
  }
}
