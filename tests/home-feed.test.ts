import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./database.ts";
import { seedReviewFixture } from "./review-fixture.ts";
import { createHomeFeed } from "../server/home-feed.ts";

test("home ranking preserves pages and privacy while favoring public affinity and follows", async () => {
  const db = await testDatabase();
  try {
    await seedReviewFixture(db);
    const home = createHomeFeed(db);
    const first = await home("reviewer-000");
    assert.equal(first.items.length, 20);
    assert.equal(first.items[0].feedReason, "From your circle");
    assert(first.nextCursor);
    await assert.rejects(home("reviewer-001", first.nextCursor), /expired/);
    await assert.rejects(home(undefined, first.nextCursor), /expired/);
    const expected = await home("reviewer-000", first.nextCursor);
    const hidden = expected.items[0];
    await db.run(
      "INSERT INTO reader_controls VALUES(?,?,?)",
      "reviewer-000",
      hidden.userId,
      "mute",
    );
    await db.run(
      "INSERT INTO post_likes(user_id,post_id) VALUES(?,?)",
      "reviewer-001",
      expected.items[1].id,
    );
    const all = [...first.items];
    let cursor: string | null = first.nextCursor;
    while (cursor) {
      const page = await home("reviewer-000", cursor);
      assert(!page.items.some((p) => p.userId === hidden.userId));
      all.push(...page.items);
      cursor = page.nextCursor;
    }
    assert.equal(new Set(all.map((p) => p.id)).size, all.length);
    assert.equal(all.length, 64);
    assert(all.some((p) => p.feedReason === "Based on your public reviews"));
    const guest = await home();
    assert(!guest.items.some((p) => /circle|reviews/.test(p.feedReason)));
    // Private library changes never alter the public-signal rank order.
    const before = (await home("reviewer-001")).items.map((p) => p.id);
    await db.run("DELETE FROM reading WHERE user_id=?", "reviewer-001");
    const book = (await db.get<{ id: string }>("SELECT id FROM books LIMIT 1"))!
      .id;
    await db.run(
      "INSERT INTO reading(user_id,book_id,status,page,rating,review) VALUES(?,?,?,0,5,?)",
      "reviewer-001",
      book,
      "Finished",
      "Private taste",
    );
    assert.deepEqual(
      (await home("reviewer-001")).items.map((p) => p.id),
      before,
    );
  } finally {
    await db.close();
  }
});
