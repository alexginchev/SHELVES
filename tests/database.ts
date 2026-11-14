import { randomUUID } from "node:crypto";
import { openDatabase } from "../server/db.ts";
import { sqliteStore, type Store } from "../server/store.ts";
import { openPostgres } from "../server/postgres.ts";
import { seedCatalog } from "../server/runtime-db.ts";
export async function testDatabase(): Promise<Store> {
  if (process.env.TEST_DATABASE !== "postgres")
    return sqliteStore(openDatabase(":memory:"));
  const schema = `shelves_test_${randomUUID().replaceAll("-", "")}`;
  const db = await openPostgres(schema);
  await seedCatalog(db);
  const close = db.close.bind(db);
  return {
    ...db,
    async close() {
      if (!/^shelves_test_[a-f0-9]{32}$/.test(schema))
        throw new Error("Unexpected test schema.");
      try {
        await db.exec(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await close();
      }
    },
  };
}
