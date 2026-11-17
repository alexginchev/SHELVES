import { readFileSync, readdirSync } from "node:fs";
import { supabasePool } from "./supabase-config.ts";
import { postgresStore, type Store } from "./store.ts";
export const schemaName = (
  value = process.env.DATABASE_SCHEMA || "shelves",
) => {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value))
    throw new Error("Invalid database schema name.");
  return value;
};
export async function openPostgres(schema = schemaName()): Promise<Store> {
  const pool = supabasePool(schemaName(schema)),
    db = postgresStore(pool);
  try {
    await db.transaction(async (tx) => {
      await tx.get(
        "SELECT pg_advisory_xact_lock(hashtext(?))",
        `shelves-schema:${schema}`,
      );
      await tx.exec(
        `CREATE SCHEMA IF NOT EXISTS "${schema}"; SET LOCAL search_path TO "${schema}",pg_catalog;`,
      );
      const ownedTables = new Set([
        "schema_migrations",
        "sqlite_imports",
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
      ]);
      const existing = await tx.all<{ name: string }>(
        "SELECT tablename AS name FROM pg_tables WHERE schemaname=?",
        schema,
      );
      if (existing.some((t) => !ownedTables.has(t.name)))
        throw new Error(
          "The selected schema contains unrelated tables. Choose a dedicated Shelves schema.",
        );
      await tx.exec(
        "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)",
      );
      const path = new URL("./postgres-migrations/", import.meta.url);
      for (const name of readdirSync(path)
        .filter((n) => n.endsWith(".sql"))
        .sort())
        if (
          !(await tx.get(
            "SELECT name FROM schema_migrations WHERE name=?",
            name,
          ))
        ) {
          await tx.exec(readFileSync(new URL(name, path), "utf8"));
          await tx.run("INSERT INTO schema_migrations VALUES (?)", name);
        }
      await tx.exec(
        `REVOKE ALL ON SCHEMA "${schema}" FROM PUBLIC,anon,authenticated; REVOKE ALL ON ALL TABLES IN SCHEMA "${schema}" FROM PUBLIC,anon,authenticated; ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated;`,
      );
      const tables = await tx.all<{ name: string }>(
        "SELECT tablename AS name FROM pg_tables WHERE schemaname=?",
        schema,
      );
      for (const table of tables)
        await tx.exec(
          `ALTER TABLE "${schema}"."${table.name}" ENABLE ROW LEVEL SECURITY`,
        );
    });
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
