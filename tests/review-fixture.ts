import type { Store } from "../server/store.ts";
export async function seedReviewFixture(db: Store, passwordHash = "unused") {
  const book = (await db.get<{ id: string }>(
    "SELECT id FROM books ORDER BY id LIMIT 1",
  ))!.id;
  await db.transaction(async (tx) => {
    for (let i = 0; i < 65; i++) {
      const id = "reviewer-" + String(i).padStart(3, "0");
      await tx.run(
        "INSERT INTO users(id,email,username,display_name,password_hash) VALUES(?,?,?,?,?)",
        id,
        id + "@example.test",
        "reviewer_" + i,
        "Review reader " + i,
        passwordHash,
      );
      await tx.run(
        "INSERT INTO posts(id,user_id,book_id,body,kind,rating,contains_spoilers,created_at) VALUES(?,?,?,?,?,?,?,?)",
        id,
        id,
        book,
        "Book review " + i,
        "review",
        4,
        i === 64 ? 1 : 0,
        "2026-01-01T00:00:00.000Z",
      );
      if (i > 0 && i < 5)
        await tx.run(
          "INSERT INTO post_likes(user_id,post_id) VALUES(?,?)",
          "reviewer-000",
          id,
        );
      if (i > 0 && i % 2 === 0)
        await tx.run(
          "INSERT INTO follows(user_id,followed_id) VALUES(?,?)",
          "reviewer-000",
          id,
        );
    }
  });
  return book;
}
