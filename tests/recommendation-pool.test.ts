import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./database.ts";
import { recommendations } from "../server/recommendations.ts";
import { library, saveReading, stats } from "../server/services.ts";
import { workIdentity } from "../shared/book-identity.ts";
import {
  recommendationSubjects,
  refreshRecommendationPool,
  recommendationsWithRefresh,
} from "../server/recommendation-pool.ts";

test("book language selects matching editions and falls back to English", async () => {
  const db = await testDatabase();
  try {
    const english = await recommendationsWithRefresh(db, "", "en");
    const fallback = await recommendationsWithRefresh(db, "", "bg");
    assert(english.length > 0);
    assert.deepEqual(fallback, english);
    await db.run(
      "INSERT INTO books VALUES (?,?,?,?,?,?,?,?,?)",
      "gb_bg_novel",
      "The Blue Orchard",
      "N. Writer",
      "Fiction",
      280,
      "A family returns to an old orchard and discovers the letters hidden in its walls across many generations.",
      "https://books.google.com/books/content?id=bg_novel",
      "sage",
      2024,
    );
    await db.run(
      "INSERT INTO book_metadata VALUES (?,?)",
      "gb_bg_novel",
      JSON.stringify({
        language: "bg",
        tags: ["Fiction"],
        identifiers: [{ type: "ISBN_13", identifier: "9780000000130" }],
        publisher: "Story Press",
      }),
    );
    const bulgarian = await recommendationsWithRefresh(db, "", "bg");
    assert.deepEqual(
      bulgarian.map((book) => book.id),
      ["gb_bg_novel"],
    );
  } finally {
    await db.close();
  }
});

test("translated editions share a reading state and series picks follow order", async () => {
  const db = await testDatabase();
  try {
    await db.run(
      "INSERT INTO users (id,email,username,display_name,password_hash) VALUES (?,?,?,?,?)",
      "series-reader",
      "series@example.test",
      "series_reader",
      "Reader",
      "unused",
    );
    const entries = [
      ["seed-acotar-bg", "Двор от рози и бодли", "Сара Дж. Маас"],
      ["seed-acotar-en", "A Court of Thorns and Roses", "Sarah J. Maas"],
      ["seed-acotar-two", "A Court of Mist and Fury", "Sarah J. Maas"],
      ["seed-acotar-five", "A Court of Silver Flames", "Sarah J. Maas"],
    ];
    for (const [id, title, author] of entries)
      await db.run(
        "INSERT INTO books VALUES (?,?,?,?,?,?,?,?,?)",
        id,
        title,
        author,
        "Fantasy",
        300,
        "A complete fantasy story with a rich world and characters facing peril across the realm.",
        "https://books.google.com/books/content?id=series",
        "sage",
        2020,
      );
    const input = {
      status: "Finished" as const,
      page: 300,
      rating: 5,
      review: "",
      shelfIds: [],
    };
    await saveReading(db, "series-reader", "seed-acotar-bg", input);
    assert.equal(
      workIdentity({ title: entries[0][1], author: entries[0][2] }),
      workIdentity({ title: entries[1][1], author: entries[1][2] }),
    );
    const picks = await recommendations(db, "series-reader");
    assert(
      !picks.some((book) =>
        ["seed-acotar-en", "seed-acotar-five"].includes(book.id),
      ),
    );
    assert(picks.some((book) => book.id === "seed-acotar-two"));
    await saveReading(db, "series-reader", "seed-acotar-en", input);
    assert.equal((await library(db, "series-reader")).length, 1);
    assert.equal((await stats(db, "series-reader")).finished, 1);
    // Existing accounts may already have conflicting edition rows. A later
    // want-to-read entry must not make a finished work look unread again.
    await db.run(
      "INSERT INTO reading (user_id,book_id,status,page,rating,review) VALUES (?,?,?,?,?,?)",
      "series-reader",
      "seed-acotar-bg",
      "Want to read",
      0,
      0,
      "",
    );
    await db.run(
      "UPDATE reading SET updated_at=? WHERE user_id=? AND book_id=?",
      "2099-01-01 00:00:00",
      "series-reader",
      "seed-acotar-bg",
    );
    assert.equal((await library(db, "series-reader"))[0].status, "Finished");
    assert.equal((await stats(db, "series-reader")).finished, 1);
  } finally {
    await db.close();
  }
});

test("recommendations expand from credible novels and reuse the shared refresh", async () => {
  const db = await testDatabase();
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GOOGLE_BOOKS_API_KEY;
  let calls = 0;
  try {
    process.env.GOOGLE_BOOKS_API_KEY = "test-key";
    await db.run(
      "INSERT INTO users (id,email,username,display_name,password_hash) VALUES (?,?,?,?,?)",
      "pool-reader",
      "pool@example.test",
      "pool_reader",
      "Pool Reader",
      "unused",
    );
    await db.run(
      "INSERT INTO reading_preferences (user_id,genres) VALUES (?,?)",
      "pool-reader",
      JSON.stringify(["Fantasy"]),
    );
    assert.equal(
      (await recommendationSubjects(db, "pool-reader"))[0],
      "Fantasy",
    );
    await db.run(
      "UPDATE reading_preferences SET genres=? WHERE user_id=?",
      JSON.stringify(["Literary", "Fiction"]),
      "pool-reader",
    );
    const relatedSubjects = await recommendationSubjects(db, "pool-reader");
    assert.equal(
      relatedSubjects.filter((genre) =>
        ["Literary", "Classic", "Fiction"].includes(genre),
      ).length,
      1,
      "equivalent provider subjects are fetched once",
    );
    await db.run(
      "UPDATE reading_preferences SET genres=? WHERE user_id=?",
      JSON.stringify(["Fantasy"]),
      "pool-reader",
    );
    globalThis.fetch = async (input) => {
      calls++;
      const query = new URL(String(input)).searchParams.get("q");
      if (query !== "subject:Fantasy")
        return new Response(JSON.stringify({ totalItems: 0, items: [] }));
      const details = {
        authors: ["M. Vale"],
        categories: ["Fiction / Fantasy"],
        description:
          "A magical city hides its old maps until a young traveler discovers the paths that disappeared from every atlas.",
        pageCount: 310,
        publisher: "Story Press",
        language: "en",
        imageLinks: {
          thumbnail: "https://books.google.com/books/content?id=lantern",
        },
        industryIdentifiers: [{ type: "ISBN_13", identifier: "9780000000123" }],
      };
      return new Response(
        JSON.stringify({
          totalItems: 3,
          items: [
            {
              id: "pool_lantern",
              volumeInfo: { ...details, title: "The Lantern of Winter" },
            },
            {
              id: "pool_bundle",
              volumeInfo: {
                ...details,
                title: "The Lantern of Winter Boxed Set",
              },
            },
            {
              id: "pool_guide",
              volumeInfo: {
                ...details,
                title: "Study Guide to The Lantern of Winter",
              },
            },
          ],
        }),
      );
    };
    await refreshRecommendationPool(db, "pool-reader");
    const firstCalls = calls;
    assert(firstCalls >= 1 && firstCalls <= 3);
    await refreshRecommendationPool(db, "pool-reader");
    assert.equal(
      calls,
      firstCalls,
      "daily marker prevents repeat provider requests",
    );
    const picks = await recommendations(db, "pool-reader");
    assert(picks.some((book) => book.title === "The Lantern of Winter"));
    assert(!picks.some((book) => /Boxed Set|Study Guide/.test(book.title)));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GOOGLE_BOOKS_API_KEY;
    else process.env.GOOGLE_BOOKS_API_KEY = originalKey;
    await db.close();
  }
});

test("catalogue rate limits back off without breaking saved recommendations", async () => {
  const db = await testDatabase();
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GOOGLE_BOOKS_API_KEY;
  let calls = 0;
  try {
    process.env.GOOGLE_BOOKS_API_KEY = "test-key";
    globalThis.fetch = async () => {
      calls++;
      return new Response("", { status: 429 });
    };
    await refreshRecommendationPool(db);
    const firstCalls = calls;
    assert(firstCalls > 0);
    await refreshRecommendationPool(db);
    assert.equal(calls, firstCalls, "rate limit uses a backoff marker");
    assert((await recommendations(db)).length > 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GOOGLE_BOOKS_API_KEY;
    else process.env.GOOGLE_BOOKS_API_KEY = originalKey;
    await db.close();
  }
});
