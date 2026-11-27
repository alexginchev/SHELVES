import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./database.ts";
import { recommendations } from "../server/recommendations.ts";
import {
  recommendationSubjects,
  refreshRecommendationPool,
} from "../server/recommendation-pool.ts";

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
