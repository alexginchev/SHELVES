import { Pool, types } from "pg";
import { readFileSync } from "node:fs";
export function supabasePool(schema?: string) {
  const project = process.env.SUPABASE_URL,
    connection = process.env.SUPABASE_DATABASE_URL;
  if (!project || !connection)
    throw new Error("Supabase project URL and database URI are required.");
  const ref = new URL(project).hostname.split(".")[0];
  let uri: URL;
  try {
    uri = new URL(connection);
  } catch {
    throw new Error("Database URI is invalid. Check the local setup file.");
  }
  if (
    !["postgres:", "postgresql:"].includes(uri.protocol) ||
    !(
      uri.hostname === `db.${ref}.supabase.co` ||
      (uri.hostname.endsWith(".pooler.supabase.com") &&
        decodeURIComponent(uri.username) === `postgres.${ref}`)
    )
  )
    throw new Error(
      "Database URI must belong to the configured Supabase project.",
    );
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "options"])
    uri.searchParams.delete(key);
  const pool = new Pool({
    connectionString: uri.toString(),
    max: 5,
    options: `-c timezone=UTC${schema ? ` -c search_path=${schema},pg_catalog` : ""}`,
    types: {
      getTypeParser: (oid: number, format?: "text" | "binary") =>
        oid === 20 || oid === 1700
          ? (value: string) => Number(value)
          : types.getTypeParser(oid, format),
    },
    connectionTimeoutMillis: 10000,
    statement_timeout: 15000,
    ssl: {
      rejectUnauthorized: true,
      ...(process.env.SUPABASE_CA_CERT
        ? { ca: readFileSync(process.env.SUPABASE_CA_CERT, "utf8") }
        : {}),
    },
  });
  pool.on("error", (error) =>
    console.error("PostgreSQL idle connection failed", {
      code: "code" in error ? error.code : "unknown",
    }),
  );
  return pool;
}
