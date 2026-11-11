import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { once } from "node:events";
import { openDatabase, one } from "../server/db.ts";
import { openPostgres } from "../server/postgres.ts";
import { migrateSQLite } from "../server/migration.ts";
import { hashPassword } from "../server/auth.ts";
import { createApp } from "../server/app.ts";
import { testDatabase } from "./database.ts";
test("transactions roll back and concurrent operations stay isolated", async () => {
  const db = await testDatabase();
  try {
    await db.run(
      "INSERT INTO users (id,email,username,display_name,password_hash) VALUES (?,?,?,?,?)",
      "tx-user",
      "tx@example.test",
      "txuser",
      "A Reader",
      "test-only",
    );
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.run(
          "INSERT INTO shelves VALUES (?,?,?)",
          randomUUID(),
          "tx-user",
          "Rolled back",
        );
        throw new Error("expected rollback");
      }),
    );
    assert.equal(
      (await one<{ n: number }>(db, "SELECT count(*) AS n FROM shelves"))!.n,
      0,
    );
    const first = db.transaction(async (tx) => {
      await tx.run(
        "INSERT INTO shelves VALUES (?,?,?)",
        randomUUID(),
        "tx-user",
        "Kept",
      );
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    const second = db.get<{ n: number }>("SELECT count(*) AS n FROM shelves");
    await first;
    await second;
    assert.equal(
      (await one<{ n: number }>(db, "SELECT count(*) AS n FROM shelves"))!.n,
      1,
    );
  } finally {
    await db.close();
  }
});
test(
  "SQLite migration preserves accounts, sessions and all reading/social data",
  { skip: process.env.TEST_DATABASE !== "postgres" },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "shelves-import-")),
      file = join(dir, "source.db"),
      schema = `shelves_test_${randomUUID().replaceAll("-", "")}`;
    const source = openDatabase(file),
      db = await openPostgres(schema);
    const password = "migration-only-test-password",
      token = "migration-only-session-token",
      userId = randomUUID(),
      otherId = randomUUID(),
      shelfId = randomUUID(),
      postId = randomUUID();
    const server = createApp(db).listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address === "object");
    try {
      const passwordHash = await hashPassword(password);
      source
        .prepare(
          "INSERT INTO users (id,email,username,display_name,password_hash) VALUES (?,?,?,?,?)",
        )
        .run(
          userId,
          "legacy@example.test",
          "legacy",
          "Legacy Reader",
          passwordHash,
        );
      source
        .prepare(
          "INSERT INTO users (id,email,username,display_name,password_hash) VALUES (?,?,?,?,?)",
        )
        .run(
          otherId,
          "friend@example.test",
          "friend",
          "Other Reader",
          passwordHash,
        );
      source
        .prepare("INSERT INTO sessions VALUES (?,?,?)")
        .run(
          createHash("sha256").update(token).digest("hex"),
          userId,
          Date.now() + 86400000,
        );
      source
        .prepare(
          "INSERT INTO reading (user_id,book_id,status,page,rating,review) VALUES (?,?,?,?,?,?)",
        )
        .run(
          userId,
          "seed-garden",
          "Currently reading",
          45,
          4,
          "Private migration note",
        );
      source
        .prepare("INSERT INTO shelves VALUES (?,?,?)")
        .run(shelfId, userId, "Old favorites");
      source
        .prepare("INSERT INTO shelf_books VALUES (?,?)")
        .run(shelfId, "seed-garden");
      source
        .prepare("INSERT INTO recommendation_feedback VALUES (?,?)")
        .run(userId, "seed-piranesi");
      source
        .prepare(
          "INSERT INTO posts (id,user_id,body,kind,book_id,rating,contains_spoilers) VALUES (?,?,?,?,?,?,?)",
        )
        .run(
          postId,
          userId,
          "A public migration review",
          "review",
          "seed-garden",
          4,
          1,
        );
      source
        .prepare("INSERT INTO post_likes VALUES (?,?)")
        .run(otherId, postId);
      source
        .prepare(
          "INSERT INTO comments (id,user_id,post_id,body) VALUES (?,?,?,?)",
        )
        .run(randomUUID(), otherId, postId, "A migrated note");
      source.prepare("INSERT INTO follows VALUES (?,?)").run(userId, otherId);
      source
        .prepare(
          "INSERT INTO notifications (id,recipient_id,actor_id,kind,event_key,post_id,read_at) VALUES (?,?,?,'like',?,?,?)",
        )
        .run(
          randomUUID(),
          userId,
          otherId,
          `like:${otherId}:${postId}`,
          postId,
          "2026-10-14 10:00:00",
        );
      const listId = randomUUID();
      source
        .prepare(
          "INSERT INTO lists (id,user_id,title,visibility) VALUES (?,?,?,'private')",
        )
        .run(listId, userId, "Legacy collection");
      source
        .prepare("INSERT INTO list_books VALUES (?,?,?)")
        .run(listId, "seed-garden", 0);
      source
        .prepare("INSERT INTO reading_preferences VALUES (?,?)")
        .run(userId, JSON.stringify(["Fantasy"]));
      source
        .prepare("INSERT INTO list_comments VALUES (?,?,?,?,?)")
        .run(
          randomUUID(),
          listId,
          otherId,
          "Preserved collection comment",
          "2026-10-18T12:00:00.000Z",
        );
      source
        .prepare("INSERT INTO profile_images VALUES (?,?,?,?)")
        .run(userId, "avatar", "test-base64-image", "test-image-version");
      source
        .prepare("INSERT INTO reader_controls VALUES (?,?,?)")
        .run(otherId, userId, "mute");
      source
        .prepare(
          "INSERT INTO reports (id,reporter_id,target_kind,target_id,reason,details,created_at) VALUES (?,?,?,?,?,?,?)",
        )
        .run(
          "migration-report",
          userId,
          "reader",
          otherId,
          "Other",
          "Migration report",
          "2026-10-21T10:00:00.000Z",
        );
      source
        .prepare("INSERT INTO account_suspensions VALUES (?,?,?,?)")
        .run(
          otherId,
          "Suspended for migration test",
          "2026-10-21T11:00:00.000Z",
          userId,
        );
      source
        .prepare("INSERT INTO moderation_actions VALUES (?,?,?,?,?,?,?,?)")
        .run(
          "migration-action",
          otherId,
          userId,
          "friend",
          "legacy",
          "suspend",
          "Suspended for migration test",
          "2026-10-21T11:00:00.000Z",
        );
      source
        .prepare("INSERT INTO book_search_cache VALUES (?,?,?)")
        .run("migration cache", "[]", Date.now());
      const receipt = await migrateSQLite(file, db);
      assert.equal(receipt.status, "imported");
      assert(existsSync(receipt.backupFile));
      assert.equal(receipt.counts.users, 2);
      assert.equal(receipt.counts.books, 6);
      assert.equal(receipt.counts.notifications, 1);
      assert.equal(receipt.counts.lists, 1);
      assert.equal(receipt.counts.list_comments, 1);
      assert.equal(receipt.counts.profile_images, 1);
      assert.equal(receipt.counts.reader_controls, 1);
      assert.equal(receipt.counts.reports, 1);
      assert.equal(receipt.counts.account_suspensions, 1);
      assert.equal(receipt.counts.moderation_actions, 1);
      assert.equal(receipt.counts.book_search_cache, 1);
      assert.equal(receipt.counts.reading_preferences, 1);
      assert.equal(
        (await db.get<{ genres: string }>(
          "SELECT genres FROM reading_preferences WHERE user_id=?",
          userId,
        ))!.genres,
        JSON.stringify(["Fantasy"]),
      );
      assert.equal(receipt.counts.list_books, 1);
      assert.equal(
        (await db.get<{ visibility: string }>(
          "SELECT visibility FROM lists WHERE id=?",
          listId,
        ))!.visibility,
        "private",
      );
      assert.equal(
        (await db.get<{ read_at: string }>(
          "SELECT read_at FROM notifications",
        ))!.read_at,
        "2026-10-14T10:00:00.000Z",
      );
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shelves-Request": "1",
          },
          body: JSON.stringify({ email: "legacy@example.test", password }),
        },
      );
      assert.equal(response.status, 200);
      assert.equal(
        ((await response.json()) as { user: { id: string } }).user.id,
        userId,
      );
      const resumed = await fetch(
        `http://127.0.0.1:${address.port}/api/auth/me`,
        { headers: { cookie: `shelves_session=${token}` } },
      );
      assert.equal(
        ((await resumed.json()) as { user: { id: string } }).user.id,
        userId,
      );
      assert.equal(
        (await db.get<{ review: string }>(
          "SELECT review FROM reading WHERE user_id=?",
          userId,
        ))!.review,
        "Private migration note",
      );
      await db.run(
        "UPDATE users SET bio=? WHERE id=?",
        "A new cloud edit",
        userId,
      );
      assert.equal((await migrateSQLite(file, db)).status, "already-imported");
      assert.equal(
        (await db.get<{ bio: string }>(
          "SELECT bio FROM users WHERE id=?",
          userId,
        ))!.bio,
        "A new cloud edit",
      );
      source.prepare("UPDATE reading SET page=46 WHERE user_id=?").run(userId);
      await assert.rejects(migrateSQLite(file, db), /already contains data/);
      assert.equal(
        (await db.get<{ page: number }>(
          "SELECT page FROM reading WHERE user_id=?",
          userId,
        ))!.page,
        45,
      );
      const tables = await db.all<{ secure: boolean }>(
        "SELECT relrowsecurity AS secure FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=? AND c.relkind=?",
        schema,
        "r",
      );
      assert(tables.length >= 13 && tables.every((t) => t.secure));
      for (const role of ["anon", "authenticated"])
        await assert.rejects(
          db.transaction(async (tx) => {
            await tx.exec(`SET LOCAL ROLE ${role}`);
            await tx.get(`SELECT password_hash FROM "${schema}".users LIMIT 1`);
          }),
          (e: unknown) =>
            !!e && typeof e === "object" && "code" in e && e.code === "42501",
        );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      source.close();
      if (!/^shelves_test_[a-f0-9]{32}$/.test(schema))
        throw new Error("Unexpected test schema");
      try {
        await db.exec(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await db.close();
      }
      if (!resolve(dir).startsWith(resolve(tmpdir()) + sep))
        throw new Error("Unexpected test directory");
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
