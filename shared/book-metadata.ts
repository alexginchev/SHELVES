export type BookMetadata = {
  format?: "ebook" | null;
  authors: string[];
  tags: string[];
  publisher: string | null;
  publishedDate: string | null;
  language: string | null;
  identifiers: { type: string; identifier: string }[];
  providerId: string;
};
