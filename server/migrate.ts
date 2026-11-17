import { openPostgres } from "./postgres.ts";
import { migrateSQLite } from "./migration.ts";
const db = await openPostgres();
try {
  const receipt = await migrateSQLite(
    process.env.DATABASE_PATH || "./data/shelves.db",
    db,
  );
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  console.error(
    "Migration stopped. The local database is kept and cloud imports are transactional.",
  );
  console.error(
    error instanceof Error &&
      [
        "Cloud database already contains data. Import stopped without replacing records.",
        "Migration content verification failed. All imported records will be rolled back.",
      ].includes(error.message)
      ? error.message
      : "Check database access, source schema, and the migration tests.",
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
