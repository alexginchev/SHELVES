import { seedListFixture } from "./list-fixture.ts";
import { editionVolumes } from "./edition-fixture.ts";
import { seedReviewFixture } from "./review-fixture.ts";
import { searchGoogleBooks } from "../server/google-books.ts";
// Isolated in-memory fixture; never connects to the application's database.
import express from "express";
import { resolve } from "node:path";
import { openDatabase } from "../server/db.ts";
import { sqliteStore } from "../server/store.ts";
import { hashPassword } from "../server/auth.ts";
import { createApp } from "../server/app.ts";
const db = sqliteStore(openDatabase(":memory:"));
process.env.SHELVES_ADMIN_IDS = "browser-admin";
await db.run(
  "INSERT INTO users (id,email,username,display_name,password_hash) VALUES (?,?,?,?,?)",
  "browser-admin",
  "admin@example.test",
  "test_admin",
  "Community administrator",
  await hashPassword("test-password-long"),
);
if (process.env.INBOX_FIXTURE === "1") {
  for (const name of ["inbox_owner", "inbox_actor"])
    await db.run(
      "INSERT INTO users(id,email,username,display_name,password_hash) VALUES(?,?,?,?,?)",
      name,
      name + "@example.test",
      name,
      name,
      await hashPassword("test-password-long"),
    );
  for (let i = 0; i < 125; i++)
    await db.run(
      "INSERT INTO notifications(id,recipient_id,actor_id,kind,event_key,created_at,read_at) VALUES(?,?,?,?,?,?,?)",
      "notice-" + String(i).padStart(3, "0"),
      "inbox_owner",
      "inbox_actor",
      "follow",
      "fixture-" + i,
      "2026-01-01 00:00:00",
      i < 5 || i === 124 ? null : "2026-02-01 00:00:00",
    );
}
if (process.env.EDITION_FIXTURE === "1") {
  process.env.GOOGLE_BOOKS_API_KEY = "fixture-only";
  globalThis.fetch = async (input) =>
    new Response(
      JSON.stringify({
        totalItems: editionVolumes.length,
        items: editionVolumes
          .filter(
            (v) =>
              !new URL(String(input)).searchParams.get("langRestrict") ||
              v.volumeInfo.language ===
                new URL(String(input)).searchParams.get("langRestrict"),
          )
          .slice(
            Number(new URL(String(input)).searchParams.get("startIndex") || 0),
            Number(new URL(String(input)).searchParams.get("startIndex") || 0) +
              10,
          ),
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  await searchGoogleBooks(db, "Edition story");
  await searchGoogleBooks(db, "Edition story", "", { startIndex: 10 });
}
if (process.env.REVIEWS_FIXTURE === "1")
  await seedReviewFixture(db, await hashPassword("test-password-long"));
if (process.env.LISTS_FIXTURE === "1")
  await seedListFixture(db, await hashPassword("test-password-long"));
const app = createApp(db);
if (process.env.BOOK_SPEED_FIXTURE === "1")
  await db.run(
    "INSERT INTO books(id,title,author,genre,pages,description,cover,color,year) VALUES(?,?,?,?,?,?,?,?,?)",
    "gb_speed",
    "A fast opening book",
    "Fixture Author",
    "Fiction",
    null,
    "No description supplied for this edition.",
    null,
    "sage",
    null,
  );
app.use(express.static(resolve("dist")));
app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
const server = app.listen(3102, "127.0.0.1", () =>
  console.log("Safety fixture ready"),
);
process.on("SIGTERM", () =>
  server.close(async () => {
    await db.close();
    process.exit(0);
  }),
);
