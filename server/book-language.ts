import { z } from "zod";
import type { Store } from "./store.ts";
export const languageSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?:[a-z]{2,3})?$/)
  .default("");
export function languageExpression(db: Store) {
  const value =
    db.kind === "postgres"
      ? "details::jsonb->>'language'"
      : "json_extract(details,'$.language')";
  return `(SELECT lower(${value}) FROM book_metadata WHERE book_id=books.id)`;
}
