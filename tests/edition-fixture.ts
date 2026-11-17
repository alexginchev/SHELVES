export const editionVolumes = Array.from({ length: 16 }, (_, i) => ({
  id: "edition_" + i,
  volumeInfo: {
    title: i === 15 ? "Edition story study guide" : "Edition story",
    authors: [i === 14 ? "Other Writer" : "Edition Writer"],
    language: i === 13 ? "bg" : "en",
    publisher: "Paper House " + i,
    publishedDate: String(2000 + i),
    pageCount: 200 + i,
    categories: ["Fiction"],
    description:
      "An imaginative novel about friendship, belonging, and the books we share.",
    industryIdentifiers: [
      { type: "ISBN_13", identifier: "978000000" + String(i).padStart(4, "0") },
    ],
  },
  saleInfo: { isEbook: i === 13 },
}));
