import type { Store } from "../server/store.ts";
export async function seedListFixture(db: Store, password = "unused") {
  for (const id of ["list-owner", "list-visitor", "list-hidden"])
    await db.run(
      "INSERT INTO users(id,email,username,display_name,password_hash) VALUES(?,?,?,?,?)",
      id,
      id + "@example.test",
      id.replaceAll("-", "_"),
      id,
      password,
    );
  for (let i = 0; i < 125; i++) {
    const id = "collection-" + String(i).padStart(3, "0");
    await db.run(
      "INSERT INTO lists(id,user_id,title,description,visibility,updated_at) VALUES(?,?,?,?,?,?)",
      id,
      i < 25 ? "list-owner" : "list-visitor",
      "Collection " + String(i).padStart(3, "0"),
      "A fixture collection",
      i < 25 ? "private" : "public",
      "2026-01-01 00:00:00.123456",
    );
    await db.run(
      "INSERT INTO books(id,title,author,genre,description,color) VALUES(?,?,?,?,?,?)",
      "picker-" + i,
      "Catalogue story " + String(i).padStart(3, "0"),
      "Fixture Writer",
      "Fiction",
      "Fixture book",
      "sage",
    );
  }
  await db.run(
    "INSERT INTO lists(id,user_id,title,description,visibility) VALUES(?,?,?,?,?)",
    "hidden-collection",
    "list-hidden",
    "Hidden collection",
    "",
    "public",
  );
  await db.run(
    "INSERT INTO reader_controls VALUES(?,?,?)",
    "list-owner",
    "list-hidden",
    "block",
  );
  await db.run(
    "INSERT INTO posts(id,user_id,body,kind) VALUES(?,?,?,?)",
    "history-post",
    "list-visitor",
    "A long conversation",
    "thought",
  );
  for (let i = 0; i < 125; i++)
    await db.run(
      "INSERT INTO comments(id,user_id,post_id,body,created_at) VALUES(?,?,?,?,?)",
      "note-" + String(i).padStart(3, "0"),
      "list-visitor",
      "history-post",
      "History note " + String(i).padStart(3, "0"),
      "2026-01-01 00:00:00.123456",
    );
  await db.run(
    "INSERT INTO comments(id,user_id,post_id,body,created_at) VALUES(?,?,?,?,?)",
    "hidden-note",
    "list-hidden",
    "history-post",
    "Hidden note",
    "2026-02-01 00:00:00",
  );
}
