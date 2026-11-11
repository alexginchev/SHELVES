import { DatabaseSync, backup } from "node:sqlite";
import { createHash } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { writeFileSync } from "node:fs";
import type { Store, Value } from "./store.ts";
export const dataTables = [
  "users",
  "sessions",
  "books",
  "reading",
  "shelves",
  "shelf_books",
  "recommendation_feedback",
  "posts",
  "post_likes",
  "comments",
  "follows",
  "notifications",
  "lists",
  "list_books",
  "reading_preferences",
  "book_metadata",
  "book_authors",
  "list_comments",
  "profile_images",
  "reader_controls",
  "reports",
  "account_suspensions",
  "moderation_actions",
  "book_search_cache",
] as const;
const timeColumns = new Set([
  "created_at",
  "updated_at",
  "finished_at",
  "edited_at",
  "read_at",
]);
type Row = Record<string, Value>;
function canonical(rows: Row[]) {
  return rows
    .map((row) =>
      Object.fromEntries(
        Object.entries(row)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => [
            key,
            timeColumns.has(key) && typeof value === "string"
              ? new Date(
                  value.includes("T") ? value : value.replace(" ", "T") + "Z",
                ).toISOString()
              : value,
          ]),
      ),
    )
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
function hash(dump: Record<string, Row[]>) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        Object.fromEntries(
          dataTables
            .filter(
              (table) =>
                ![
                  "notifications",
                  "lists",
                  "list_books",
                  "reading_preferences",
                  "book_metadata",
                  "book_authors",
                  "list_comments",
                  "profile_images",
                  "reader_controls",
                  "reports",
                  "account_suspensions",
                  "moderation_actions",
                  "book_search_cache",
                ].includes(table) || dump[table].length,
            )
            .map((table) => [table, canonical(dump[table])]),
        ),
      ),
    )
    .digest("hex");
}
export async function migrateSQLite(sourcePath: string, target: Store) {
  const sourceFile = resolve(sourcePath),
    backupFile = join(
      dirname(sourceFile),
      `shelves-before-postgres-${Date.now()}.db`,
    );
  const source = new DatabaseSync(sourceFile, { readOnly: true });
  try {
    await backup(source, backupFile);
  } finally {
    source.close();
  }
  const snapshot = new DatabaseSync(backupFile, { readOnly: true });
  const dump: Record<string, Row[]> = {};
  try {
    for (const table of dataTables)
      dump[table] =
        [
          "notifications",
          "lists",
          "list_books",
          "reading_preferences",
          "book_metadata",
          "book_authors",
          "list_comments",
          "profile_images",
          "reader_controls",
          "reports",
          "account_suspensions",
          "moderation_actions",
          "book_search_cache",
        ].includes(table) &&
        !snapshot
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
          )
          .get(table)
          ? []
          : (snapshot.prepare(`SELECT * FROM "${table}"`).all() as Row[]);
  } finally {
    snapshot.close();
  }
  const sourceHash = hash(dump),
    counts = Object.fromEntries(
      dataTables.map((table) => [table, dump[table].length]),
    );
  const status = await target.transaction(async (tx) => {
    await tx.get(
      "SELECT pg_advisory_xact_lock(hashtext(?))",
      "shelves:sqlite-import",
    );
    if (
      await tx.get(
        "SELECT source_hash FROM sqlite_imports WHERE source_hash=?",
        sourceHash,
      )
    )
      return "already-imported";
    for (const table of dataTables)
      if (
        (await tx.get<{ n: number }>(`SELECT count(*) AS n FROM "${table}"`))!
          .n !== 0
      )
        throw new Error(
          "Cloud database already contains data. Import stopped without replacing records.",
        );
    for (const table of dataTables) {
      for (const row of dump[table]) {
        const columns = Object.keys(row);
        if (columns.some((name) => !/^[a-z_]+$/.test(name)))
          throw new Error("Unexpected source column.");
        await tx.run(
          `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
          ...columns.map((c) => row[c]),
        );
      }
    }
    const check: Record<string, Row[]> = {};
    for (const table of dataTables) {
      check[table] = await tx.all<Row>(`SELECT * FROM "${table}"`);
      if (check[table].length !== counts[table])
        throw new Error(
          "Migration row-count verification failed. All imported records will be rolled back.",
        );
    }
    if (hash(check) !== sourceHash)
      throw new Error(
        "Migration content verification failed. All imported records will be rolled back.",
      );
    await tx.run(
      "INSERT INTO sqlite_imports (source_hash,counts) VALUES (?,?)",
      sourceHash,
      JSON.stringify(counts),
    );
    return "imported";
  });
  const receipt = {
    status,
    sourceHash,
    counts,
    backupFile,
    verifiedAt: new Date().toISOString(),
  };
  writeFileSync(
    join(dirname(sourceFile), "postgres-migration-receipt.json"),
    JSON.stringify(receipt, null, 2),
  );
  return receipt;
}
