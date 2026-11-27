import type { Book } from "./types.ts";

const clean = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const maas = /\bmaas\b|маас/i;
const acotar: [number, RegExp][] = [
  [1, /^(?:a court of thorns and roses|двор от рози и бодли)(?=$|[^\p{L}])/iu],
  [2, /^(?:a court of mist and fury|двор от мъгла и ярост)(?=$|[^\p{L}])/iu],
  [3, /^(?:a court of wings and ruin|двор от крила и разруха)(?=$|[^\p{L}])/iu],
  [
    4,
    /^(?:a court of frost and starlight|двор от скреж и звездна светлина)(?=$|[^\p{L}])/iu,
  ],
  [5, /^(?:a court of silver flames|двор от сребърни пламъци)(?=$|[^\p{L}])/iu],
];
export const acotarOrder = [
  "A Court of Thorns and Roses",
  "A Court of Mist and Fury",
  "A Court of Wings and Ruin",
  "A Court of Frost and Starlight",
  "A Court of Silver Flames",
];
export function seriesPosition(book: Pick<Book, "title" | "author">) {
  if (maas.test(book.author)) {
    const match = acotar.find(([, pattern]) => pattern.test(book.title));
    if (match) return { series: "acotar", position: match[0] };
    // Do not surface unverified "A Court of ..." derivatives as series reads.
    if (/^a court of /i.test(book.title))
      return { series: "acotar", position: 0 };
  }
  // Only use explicit numbering; inferring order from a shared author is unsafe.
  const numbered = /^(.*?)\s+(?:book|volume|#)\s*(\d{1,2})(?:\b|$)/i.exec(
    book.title,
  );
  return numbered
    ? {
        series: clean(numbered[1]) + "\0" + clean(book.author),
        position: Number(numbered[2]),
      }
    : null;
}
export function workIdentity(book: Pick<Book, "title" | "author">) {
  const series = seriesPosition(book);
  if (series?.series === "acotar" && series.position > 0)
    return `acotar:${series.position}`;
  return `${clean(book.title)}\0${clean(book.author)}`;
}
