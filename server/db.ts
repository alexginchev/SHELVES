import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Book } from "../shared/types.ts";
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
        one<{ n: number }>(db, "SELECT count(*) AS n FROM users")!.n > 0
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
  const seeds: Book[] = [
    {
      id: "seed-garden",
      title: "The Secret Garden",
      author: "Frances Hodgson Burnett",
      genre: "Classic",
      pages: 288,
      description:
        "A lonely girl discovers a hidden garden and the friendships that bring it back to life.",
      cover: null,
      color: "sage",
      year: 1911,
    },
    {
      id: "seed-creatures",
      title: "Remarkably Bright Creatures",
      author: "Shelby Van Pelt",
      genre: "Fiction",
      pages: 368,
      description:
        "A widow, a young man, and a perceptive octopus find unexpected connections in a coastal town.",
      cover: null,
      color: "mist",
      year: 2022,
    },
    {
      id: "seed-overstory",
      title: "The Overstory",
      author: "Richard Powers",
      genre: "Literary",
      pages: 512,
      description:
        "Interwoven lives reveal the extraordinary world of trees and the people moved to protect it.",
      cover: null,
      color: "sage",
      year: 2018,
    },
    {
      id: "seed-sweetgrass",
      title: "Braiding Sweetgrass",
      author: "Robin Wall Kimmerer",
      genre: "Nature",
      pages: 408,
      description:
        "A botanist brings Indigenous knowledge and scientific observation together in reflections on the living world.",
      cover: null,
      color: "lavender",
      year: 2013,
    },
    {
      id: "seed-smallthings",
      title: "Small Things Like These",
      author: "Claire Keegan",
      genre: "Literary",
      pages: 128,
      description:
        "A coal merchant in a small Irish town faces a choice between silence and compassion.",
      cover: null,
      color: "coral",
      year: 2021,
    },
    {
      id: "seed-piranesi",
      title: "Piranesi",
      author: "Susanna Clarke",
      genre: "Fantasy",
      pages: 272,
      description:
        "In a house of endless halls, a solitary explorer begins to question everything he knows.",
      cover: null,
      color: "mist",
      year: 2020,
    },
  ];
  const insert = db.prepare(
    "INSERT OR IGNORE INTO books VALUES (?,?,?,?,?,?,?,?,?)",
  );
  seeds.forEach((b) =>
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
  return db;
}
export function all<T>(
  db: DatabaseSync,
  sql: string,
  ...values: SQLInputValue[]
): T[] {
  return db.prepare(sql).all(...values) as unknown as T[];
}
export function one<T>(
  db: DatabaseSync,
  sql: string,
  ...values: SQLInputValue[]
): T | undefined {
  return db.prepare(sql).get(...values) as unknown as T | undefined;
}
export function transaction<T>(db: DatabaseSync, run: () => T): T {
  db.exec("BEGIN");
  try {
    const result = run();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
