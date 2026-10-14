import { Pool } from "pg";
import { readFileSync } from "node:fs";
export function supabasePool() {
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
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
    uri.searchParams.delete(key);
  return new Pool({
    connectionString: uri.toString(),
    max: 5,
    connectionTimeoutMillis: 10000,
    statement_timeout: 15000,
    ssl: {
      rejectUnauthorized: true,
      ...(process.env.SUPABASE_CA_CERT
        ? { ca: readFileSync(process.env.SUPABASE_CA_CERT, "utf8") }
        : {}),
    },
  });
}
