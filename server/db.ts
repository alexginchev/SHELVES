import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Store } from "./store.ts";
import { seedBooks } from "./catalog.ts";
export function openDatabase(filename: string) {
  if (filename !== ":memory:")
    mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)",
  );
  const path = new URL("./migrations/", import.meta.url);
  for (const name of readdirSync(path)
    .filter((s) => s.endsWith(".sql"))
    .sort()) {
    if (
      !db.prepare("SELECT name FROM schema_migrations WHERE name=?").get(name)
    ) {
      // Preserve existing account data before a new migration changes its schema.
      if (
        filename !== ":memory:" &&
        db.prepare("SELECT name FROM schema_migrations LIMIT 1").get() &&
        Number(
          (db.prepare("SELECT count(*) AS n FROM users").get() as { n: number })
            .n,
        ) > 0
      ) {
        const backupPath = resolve(
          `${filename}.before-${name}-${Date.now()}.bak`,
        );
        db.prepare("VACUUM INTO ?").run(backupPath);
      }
      db.exec("BEGIN");
      try {
        db.exec(readFileSync(new URL(name, path), "utf8"));
        db.prepare("INSERT INTO schema_migrations VALUES (?)").run(name);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
  }
  const insert = db.prepare(
    "INSERT OR IGNORE INTO books VALUES (?,?,?,?,?,?,?,?,?)",
  );
  seedBooks.forEach((b) =>
    insert.run(
      b.id,
      b.title,
      b.author,
      b.genre,
      b.pages,
      b.description,
      b.cover,
      b.color,
      b.year,
    ),
  );
  for (const b of seedBooks)
    db.prepare("UPDATE books SET cover=? WHERE id=? AND cover IS NULL").run(
      b.cover,
      b.id,
    );
  return db;
}
export async function all<T>(
  db: Store,
  sql: string,
  ...values: SQLInputValue[]
): Promise<T[]> {
  return db.all<T>(sql, ...values);
}
export async function one<T>(
  db: Store,
  sql: string,
  ...values: SQLInputValue[]
): Promise<T | undefined> {
  return db.get<T>(sql, ...values);
}
export async function transaction<T>(
  db: Store,
  run: (tx: Store) => Promise<T>,
): Promise<T> {
  return db.transaction(run);
}
