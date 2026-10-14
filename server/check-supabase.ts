// Read-only readiness check. Never prints key or database connection string values.
export {};
import { supabasePool } from "./supabase-config.ts";
const url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error(
    "Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in .env.supabase.",
  );
  process.exitCode = 1;
} else {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co"))
    throw new Error("Use the HTTPS Supabase project URL.");
  const response = await fetch(new URL("/auth/v1/settings", url), {
    headers: { apikey: key },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    console.error(
      `Supabase rejected the readiness check (${response.status}). Check the project URL and publishable key.`,
    );
    process.exitCode = 1;
  } else {
    console.log("Supabase project and publishable key verified.");
    if (process.env.SUPABASE_DATABASE_URL) {
      const pool = supabasePool();
      try {
        await pool.query("SELECT 1");
        console.log(
          "Supabase PostgreSQL connection verified. No schema migration has been applied.",
        );
      } catch (error) {
        console.error(
          `Database connection failed (${typeof error === "object" && error && "code" in error ? String(error.code) : "connection error"}). Check the URI and database password.`,
        );
        process.exitCode = 1;
      } finally {
        await pool.end();
      }
    } else
      console.log(
        "Database connection string still needed for hosted data migration.",
      );
  }
}
