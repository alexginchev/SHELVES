import { openDatabase } from "./db.ts";
import { sqliteStore, type Store } from "./store.ts";
import { openPostgres } from "./postgres.ts";
import { seedBooks } from "./catalog.ts";
export async function seedCatalog(db: Store) {
  for (const b of seedBooks) {
    await db.run(
      "INSERT INTO books VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING",
      b.id,
      b.title,
      b.author,
      b.genre,
      b.pages,
      b.description,
      b.cover,
      b.color,
      b.year,
    );
    await db.run(
      "UPDATE books SET cover=? WHERE id=? AND cover IS NULL",
      b.cover,
      b.id,
    );
  }
}
export async function openRuntimeDatabase() {
  const engine = process.env.DATABASE_ENGINE || "sqlite";
  if (engine === "sqlite")
    return sqliteStore(
      openDatabase(process.env.DATABASE_PATH || "./data/shelves.db"),
    );
  if (engine !== "postgres")
    throw new Error("DATABASE_ENGINE must be sqlite or postgres.");
  const db = await openPostgres();
  try {
    await seedCatalog(db);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
