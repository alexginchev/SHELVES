import { seedListFixture } from "./list-fixture.ts";
import { hashPassword } from "../server/auth.ts";
import { readerSuggestions } from "../server/services.ts";
import { seedReviewFixture } from "./review-fixture.ts";
import { bookReviewPage } from "../server/book-reviews.ts";
import { editionVolumes } from "./edition-fixture.ts";
import { recommendationQuality, rankSearch } from "../server/book-quality.ts";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.ts";
import { openDatabase, one } from "../server/db.ts";
import { sqliteStore } from "../server/store.ts";
import { testDatabase } from "./database.ts";
import {
  refreshGoogleBook,
  normalizeGoogleVolume,
  searchGoogleBooks,
  getBookByISBN,
  googleBooksSearchUrl,
  GOOGLE_BOOK_FIELDS,
  bookMetadata,
} from "../server/google-books.ts";
import {
  recommendations,
  saveReading,
  searchBooks,
  bookSummary,
  publicReviews,
} from "../server/services.ts";
import type {
  Book,
  User,
  Reading,
  Shelf,
  Post,
  Reader,
  ReaderProfile,
  NotificationInbox,
} from "../shared/types.ts";
test("book review pages preserve history, sorting, scope and social safety", async () => {
  const db = await testDatabase();
  const server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  try {
    const book = await seedReviewFixture(db);
    const first = await bookReviewPage(db, book, "reviewer-000", {});
    assert.equal(first.items.length, 20);
    assert.equal(first.items[0].id, "reviewer-064");
    assert.equal(
      first.mine?.id,
      "reviewer-000",
      "own review survives outside the first page",
    );
    const seen = [...first.items];
    let cursor = first.nextCursor;
    while (cursor) {
      const page = await bookReviewPage(db, book, "reviewer-000", {
        before: cursor,
      });
      seen.push(...page.items);
      cursor = page.nextCursor;
    }
    assert.equal(seen.length, 65);
    assert.equal(new Set(seen.map((p) => p.id)).size, 65);
    const popular = await bookReviewPage(db, book, undefined, {
      sort: "appreciated",
    });
    assert.equal(popular.items[0].id, "reviewer-004");
    const ranked = [...popular.items];
    cursor = popular.nextCursor;
    while (cursor) {
      const page = await bookReviewPage(db, book, undefined, {
        sort: "appreciated",
        before: cursor,
      });
      ranked.push(...page.items);
      cursor = page.nextCursor;
    }
    assert.equal(new Set(ranked.map((p) => p.id)).size, 65);
    assert.equal(ranked.length, 65);
    await db.run(
      "INSERT INTO reader_controls VALUES(?,?,?)",
      "reviewer-000",
      "reviewer-064",
      "mute",
    );
    await db.run(
      "INSERT INTO reader_controls VALUES(?,?,?)",
      "reviewer-062",
      "reviewer-000",
      "block",
    );
    const followed = await bookReviewPage(db, book, "reviewer-000", {
      filter: "following",
    });
    assert.equal(
      followed.items.length,
      20,
      "filter and exclusions precede limit",
    );
    assert.equal(followed.items[0].id, "reviewer-060");
    assert(
      !followed.items.some((p) =>
        ["reviewer-000", "reviewer-062", "reviewer-064"].includes(p.id),
      ),
    );
    assert.equal(followed.mine?.id, "reviewer-000");
    const tail = await bookReviewPage(db, book, "reviewer-000", {
      filter: "following",
      before: followed.nextCursor,
    });
    assert.equal(tail.items.length, 10);
    await db.run(
      "INSERT INTO account_suspensions(user_id,reason,created_at,actor_id) VALUES(?,?,?,?)",
      "reviewer-060",
      "Test suspension",
      "2026-01-01T00:00:00.000Z",
      "reviewer-000",
    );
    assert.equal(
      (await bookReviewPage(db, book, "reviewer-000", { filter: "following" }))
        .items[0].id,
      "reviewer-058",
    );
    assert(
      !(await bookReviewPage(db, book, undefined, {})).items.some(
        (p) => p.id === "reviewer-060",
      ),
    );
    await db.run(
      "UPDATE posts SET created_at=? WHERE id=?",
      "2026-02-01T00:00:00.000Z",
      "reviewer-000",
    );
    const second = await bookReviewPage(db, book, undefined, {
      before: first.nextCursor,
    });
    assert.equal(
      second.items[0].id,
      "reviewer-044",
      "new activity does not shift recent cursor boundary",
    );
    await db.run("DELETE FROM posts WHERE id=?", "reviewer-045");
    assert.equal(
      (await bookReviewPage(db, book, undefined, { before: first.nextCursor }))
        .items[0].id,
      "reviewer-044",
      "deleted anchor remains usable",
    );
    await db.run(
      "INSERT INTO post_likes(user_id,post_id) VALUES(?,?)",
      "reviewer-001",
      "reviewer-000",
    );
    assert.equal(
      (await bookReviewPage(db, book, undefined, { sort: "appreciated" }))
        .items[0].id,
      "reviewer-000",
      "refresh reflects changed ranks",
    );
    const base = `http://127.0.0.1:${address.port}/api/books/${book}/reviews`;
    assert.equal((await fetch(base)).status, 200);
    for (const query of [
      "?sort=invalid",
      "?before=bad",
      "?sort=appreciated&before=" + first.nextCursor,
    ])
      assert.equal((await fetch(base + query)).status, 400);
    assert.equal((await fetch(base + "?filter=following")).status, 401);
    await assert.rejects(
      bookReviewPage(db, "missing-book", undefined, {
        before: first.nextCursor,
      }),
      /Invalid review cursor/,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  }
});
test("accounts, private library ownership, social flows, validation, CSRF and logout", async () => {
  const db = await testDatabase();
  const server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
  ) {
    return fetch(`${base}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Shelves-Request": "1",
        ...(cookie ? { cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  const registration = {
    email: "reader@example.test",
    username: "reader",
    displayName: "Test Reader",
    password: "a-long-test-password",
  };
  try {
    assert.equal((await request("/library")).status, 401);
    assert.equal(
      (
        await request("/auth/register", "POST", {
          ...registration,
          password: "short",
        })
      ).status,
      400,
    );
    const registered = await request("/auth/register", "POST", registration);
    assert.equal(registered.status, 201);
    const first = (await registered.json()) as {
      user: User;
    };
    const cookie = registered.headers.get("set-cookie")!.split(";")[0];
    assert(registered.headers.get("set-cookie")!.includes("HttpOnly"));
    assert(registered.headers.get("set-cookie")!.includes("SameSite=Lax"));
    const stored = (await one<{
      hash: string;
    }>(
      db,
      "SELECT password_hash AS hash FROM users WHERE id=?",
      first.user.id,
    ))!;
    assert(!stored.hash.includes(registration.password));
    assert(stored.hash.includes(":"));
    assert.equal(
      (await request("/auth/register", "POST", registration)).status,
      409,
    );
    assert.equal(
      (
        await request("/auth/login", "POST", {
          email: registration.email,
          password: "wrong-password-here",
        })
      ).status,
      401,
    );
    const login = await request("/auth/login", "POST", {
      email: registration.email,
      password: registration.password,
    });
    assert.equal(login.status, 200);
    const secondRegistration = await request("/auth/register", "POST", {
      ...registration,
      email: "second@example.test",
      username: "second",
    });
    assert.equal(secondRegistration.status, 201);
    const second = (await secondRegistration.json()) as {
      user: User;
    };
    const otherCookie = secondRegistration.headers
      .get("set-cookie")!
      .split(";")[0];
    const newShelf = await request(
      "/shelves",
      "POST",
      { name: "Favorites" },
      cookie,
    );
    assert.equal(newShelf.status, 201);
    const { shelf } = (await newShelf.json()) as {
      shelf: Shelf;
    };
    assert.equal(
      (await request("/shelves", "POST", { name: "favorites" }, cookie)).status,
      409,
    );
    const update = {
      status: "Finished",
      page: 10,
      rating: 5,
      review: "Private reading note <script>literal text</script>",
      shelfIds: [shelf.id],
    };
    assert.equal(
      (await request("/library/seed-overstory", "PUT", update, cookie)).status,
      200,
    );
    const records = (await (
      await request("/library", "GET", undefined, cookie)
    ).json()) as {
      items: Reading[];
    };
    assert.equal(records.items[0].page, 512);
    assert(records.items[0].finishedAt);
    assert.equal(records.items[0].review, update.review);
    const otherSnapshot = (await (
      await request("/snapshot", "GET", undefined, otherCookie)
    ).json()) as {
      library: Reading[];
      stats: unknown;
    };
    assert.deepEqual(otherSnapshot.library, []);
    assert(!JSON.stringify(otherSnapshot).includes("Private reading note"));
    const guestSnapshot = (await (await request("/snapshot")).json()) as {
      library: Reading[];
      stats: unknown;
    };
    assert.deepEqual(guestSnapshot.library, []);
    assert.equal(guestSnapshot.stats, null);
    const otherLibrary = (await (
      await request("/library", "GET", undefined, otherCookie)
    ).json()) as {
      items: Reading[];
    };
    assert.deepEqual(otherLibrary.items, []);
    assert.equal(
      (
        await request(
          "/library/seed-garden",
          "PUT",
          { ...update, shelfIds: [shelf.id] },
          otherCookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          "/library/seed-garden",
          "PUT",
          { ...update, page: 900, shelfIds: [] },
          cookie,
        )
      ).status,
      400,
    );
    assert(
      !(await recommendations(db, first.user.id)).some(
        (b) => b.id === "seed-overstory",
      ),
    );
    assert.equal(
      (await recommendations(db, first.user.id))[0].id,
      "seed-smallthings",
    );
    assert.equal(
      (
        await request(
          "/recommendations/seed-piranesi/dismiss",
          "PUT",
          undefined,
          cookie,
        )
      ).status,
      204,
    );
    assert(
      !(await recommendations(db, first.user.id)).some(
        (b) => b.id === "seed-piranesi",
      ),
    );
    const postResponse = await request(
      "/posts",
      "POST",
      { body: "A public reading thought", kind: "thought" },
      cookie,
    );
    assert.equal(postResponse.status, 201);
    const postId = (
      (await postResponse.json()) as {
        id: string;
      }
    ).id;
    assert.equal(
      (await request(`/posts/${postId}`, "DELETE", undefined, otherCookie))
        .status,
      404,
    );
    assert.equal(
      (await request(`/posts/${postId}/like`, "PUT", undefined, otherCookie))
        .status,
      204,
    );
    assert.equal(
      (await request(`/posts/${postId}/like`, "PUT", undefined, otherCookie))
        .status,
      204,
    );
    assert.equal(
      (
        await request(
          `/posts/${postId}/comments`,
          "POST",
          { body: "A kind note" },
          otherCookie,
        )
      ).status,
      201,
    );
    const publicFeed = (await (await request("/feed")).json()) as {
      items: Post[];
    };
    assert.equal(publicFeed.items[0].likes, 1);
    assert.equal(publicFeed.items[0].comments[0].body, "A kind note");
    assert(!JSON.stringify(publicFeed).includes("Private reading note"));
    assert.equal(
      (
        await request(
          `/readers/${first.user.id}/follow`,
          "PUT",
          undefined,
          otherCookie,
        )
      ).status,
      204,
    );
    const readers = (await (
      await request("/readers", "GET", undefined, otherCookie)
    ).json()) as {
      items: Reader[];
    };
    assert(readers.items.find((r) => r.id === first.user.id)?.following);
    assert(!JSON.stringify(readers).includes("email"));
    assert.equal((await request("/notifications")).status, 401);
    const getInbox = async (session = cookie) =>
      (await (
        await request("/notifications", "GET", undefined, session)
      ).json()) as NotificationInbox;
    let inbox = await getInbox();
    assert.equal(inbox.unread, 3);
    assert.deepEqual(inbox.items.map((n) => n.kind).sort(), [
      "comment",
      "follow",
      "like",
    ]);
    assert.equal((await getInbox(otherCookie)).items.length, 0);
    assert(!JSON.stringify(inbox).includes("Private reading note"));
    assert(inbox.items.every((n) => !Object.hasOwn(n, "body")));
    await request(
      `/readers/${first.user.id}/follow`,
      "PUT",
      undefined,
      otherCookie,
    );
    await request(`/posts/${postId}/like`, "PUT", undefined, cookie);
    assert.equal(
      (await getInbox()).items.length,
      3,
      "retry and self-like must not create notifications",
    );
    assert.equal(
      (
        await request(
          `/notifications/${inbox.items[0].id}/read`,
          "PATCH",
          undefined,
          otherCookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          `/notifications/${inbox.items[0].id}/read`,
          "PATCH",
          undefined,
          cookie,
        )
      ).status,
      204,
    );
    assert.equal((await getInbox()).unread, 2);
    await request("/notifications/read-all", "POST", undefined, otherCookie);
    assert.equal((await getInbox()).unread, 2);
    await request("/notifications/read-all", "POST", undefined, cookie);
    assert.equal((await getInbox()).unread, 0);
    await request(`/posts/${postId}/like`, "DELETE", undefined, otherCookie);
    assert.equal((await getInbox()).items.length, 2);
    assert.equal((await request(`/posts/${postId}`)).status, 200);
    const publicProfile = (await (
      await request(`/readers/${first.user.id}`)
    ).json()) as ReaderProfile;
    assert.equal(publicProfile.reader.username, registration.username);
    assert.equal(publicProfile.followers, 1);
    assert.equal(publicProfile.followingCount, 0);
    assert.equal(publicProfile.posts[0].id, postId);
    assert.equal(publicProfile.reader.following, false);
    assert(!JSON.stringify(publicProfile).includes("Private reading note"));
    assert(!JSON.stringify(publicProfile).includes("Favorites"));
    for (const privateKey of [
      "email",
      "password_hash",
      "goal",
      "library",
      "shelves",
      "stats",
    ])
      assert(!Object.hasOwn(publicProfile.reader, privateKey), privateKey);
    assert.equal(
      (
        (await (
          await request(
            `/readers/${first.user.id}`,
            "GET",
            undefined,
            otherCookie,
          )
        ).json()) as ReaderProfile
      ).reader.following,
      true,
    );
    assert.equal((await request("/readers/missing")).status, 404);
    assert.equal(
      (
        await request(
          `/shelves/${shelf.id}`,
          "PATCH",
          { name: "Stolen" },
          otherCookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (await request(`/shelves/${shelf.id}`, "DELETE", undefined, otherCookie))
        .status,
      404,
    );
    assert.equal(
      (await request(`/shelves/${shelf.id}`, "PATCH", { name: " " }, cookie))
        .status,
      400,
    );
    assert.equal(
      (
        await request(
          `/shelves/${shelf.id}`,
          "PATCH",
          { name: "Most loved" },
          cookie,
        )
      ).status,
      200,
    );
    const duplicateShelf = (await (
      await request("/shelves", "POST", { name: "Rainy days" }, cookie)
    ).json()) as { shelf: Shelf };
    assert.equal(
      (
        await request(
          `/shelves/${shelf.id}`,
          "PATCH",
          { name: "RAINY DAYS" },
          cookie,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await request(
          `/shelves/${shelf.id}`,
          "PATCH",
          { name: "Most loved" },
          cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request(`/shelves/${shelf.id}`, "DELETE", undefined, cookie))
        .status,
      204,
    );
    const retained = (
      (await (await request("/library", "GET", undefined, cookie)).json()) as {
        items: Reading[];
      }
    ).items[0];
    assert.equal(retained.review, update.review);
    assert.equal(retained.rating, 5);
    assert.equal(retained.page, 512);
    assert.deepEqual(retained.shelfIds, []);
    assert.equal(
      (
        await request(
          `/shelves/${duplicateShelf.shelf.id}`,
          "DELETE",
          undefined,
          cookie,
        )
      ).status,
      204,
    );
    assert.equal(
      (
        await request(
          `/readers/${second.user.id}/follow`,
          "PUT",
          undefined,
          otherCookie,
        )
      ).status,
      400,
    );
    const following = (await (
      await request("/feed?following=true", "GET", undefined, otherCookie)
    ).json()) as {
      items: Post[];
    };
    assert.equal(following.items.length, 1);
    assert.equal(
      (
        await fetch(`${base}/api/posts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie },
          body: JSON.stringify({ body: "forged", kind: "thought" }),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${base}/api/posts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shelves-Request": "1",
            Origin: "https://foreign.example",
            cookie,
          },
          body: JSON.stringify({ body: "forged", kind: "thought" }),
        })
      ).status,
      403,
    );
    assert.equal(
      (await request(`/posts/${postId}`, "DELETE", undefined, cookie)).status,
      204,
    );
    inbox = await getInbox();
    assert.equal(
      inbox.items.length,
      1,
      "post deletion removes related notifications",
    );
    assert.equal(inbox.items[0].kind, "follow");
    await request(
      `/readers/${first.user.id}/follow`,
      "DELETE",
      undefined,
      otherCookie,
    );
    assert.equal((await getInbox()).items.length, 0);
    assert.equal((await request(`/posts/${postId}`)).status, 404);
    assert.equal(
      (await one<{
        n: number;
      }>(db, "SELECT count(*) AS n FROM comments"))!.n,
      0,
    );
    assert.equal(
      (await request("/library/seed-overstory", "DELETE", undefined, cookie))
        .status,
      204,
    );
    assert.equal(
      (await one<{
        n: number;
      }>(db, "SELECT count(*) AS n FROM shelf_books"))!.n,
      0,
    );
    assert.equal(
      (await request("/auth/logout", "POST", undefined, cookie)).status,
      204,
    );
    assert.equal(
      (await request("/library", "GET", undefined, cookie)).status,
      401,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  }
});
test("public reviews are separate, editable, owner-scoped and aggregated", async () => {
  const db = await testDatabase(),
    server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  assert(addr && typeof addr === "object");
  const base = `http://127.0.0.1:${addr.port}/api`;
  async function req(
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
  ) {
    return fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Shelves-Request": "1",
        cookie,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  try {
    const register = async (name: string) => {
      const r = await req("/auth/register", "POST", {
        email: `${name}@example.test`,
        username: name,
        displayName: name,
        password: "test-password-long",
      });
      assert.equal(r.status, 201);
      return {
        cookie: r.headers.get("set-cookie")!.split(";")[0],
        user: (
          (await r.json()) as {
            user: User;
          }
        ).user,
      };
    };
    const a = await register("alice"),
      b = await register("brian");
    assert.equal(
      (
        await req("/books/seed-garden/review", "PUT", {
          body: "No account",
          rating: 5,
          containsSpoilers: false,
        })
      ).status,
      401,
    );
    await req(
      "/library/seed-garden",
      "PUT",
      {
        status: "Finished",
        page: 288,
        rating: 5,
        review: "Private words stay private",
        shelfIds: [],
      },
      a.cookie,
    );
    assert.deepEqual(
      { ...(await bookSummary(db, "seed-garden")) },
      {
        averageRating: null,
        reviewCount: 0,
      },
    );
    const review = {
      body: "Public words contain a plot detail",
      rating: 5,
      containsSpoilers: true,
    };
    const published = await req(
      "/books/seed-garden/review",
      "PUT",
      review,
      a.cookie,
    );
    assert.equal(published.status, 200);
    const firstId = (
      (await published.json()) as {
        id: string;
      }
    ).id;
    assert.equal(
      (
        await req(
          "/books/seed-garden/review",
          "PUT",
          { ...review, rating: 9 },
          a.cookie,
        )
      ).status,
      400,
    );
    const updated = await req(
      "/books/seed-garden/review",
      "PUT",
      { ...review, rating: 3 },
      a.cookie,
    );
    assert.equal(
      (
        (await updated.json()) as {
          id: string;
        }
      ).id,
      firstId,
    );
    assert.deepEqual(
      { ...(await bookSummary(db, "seed-garden")) },
      {
        averageRating: 3,
        reviewCount: 1,
      },
    );
    await req(
      "/books/seed-garden/review",
      "PUT",
      { body: "A second opinion", rating: 5, containsSpoilers: false },
      b.cookie,
    );
    assert.deepEqual(
      { ...(await bookSummary(db, "seed-garden")) },
      {
        averageRating: 4,
        reviewCount: 2,
      },
    );
    const guest = (await (await req("/books/seed-garden/reviews")).json()) as {
      items: Post[];
      mine: Post | null;
    };
    assert.equal(guest.mine, null);
    assert.equal(guest.items.length, 2);
    assert(!JSON.stringify(guest).includes("Private words"));
    const own = await publicReviews(db, "seed-garden", a.user.id);
    assert.equal(own.mine?.id, firstId);
    assert(own.mine?.containsSpoilers);
    assert(own.mine?.editedAt);
    assert.equal(
      (await publicReviews(db, "seed-garden", b.user.id)).mine?.userId,
      b.user.id,
    );
    assert.equal(
      (await req(`/posts/${firstId}`, "DELETE", undefined, b.cookie)).status,
      404,
    );
    assert.equal(
      (
        await req(
          "/posts",
          "POST",
          { body: "Invalid generic review", kind: "review" },
          a.cookie,
        )
      ).status,
      400,
    );
    await req(`/posts/${firstId}/like`, "PUT", undefined, b.cookie);
    await req(
      `/posts/${firstId}/comments`,
      "POST",
      { body: "A public reply" },
      b.cookie,
    );
    assert.equal(
      (await req(`/posts/${firstId}`, "DELETE", undefined, a.cookie)).status,
      204,
    );
    assert.deepEqual(
      { ...(await bookSummary(db, "seed-garden")) },
      {
        averageRating: 5,
        reviewCount: 1,
      },
    );
    assert.equal(
      (await one<{
        n: number;
      }>(db, "SELECT count(*) AS n FROM comments WHERE post_id=?", firstId))!.n,
      0,
    );
    const privateAfter = (await (
      await req("/library", "GET", undefined, a.cookie)
    ).json()) as {
      items: Reading[];
    };
    assert.equal(privateAfter.items[0].review, "Private words stay private");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  }
});
test("database migrations and reading records survive reopening", async () => {
  const dir = mkdtempSync(join(tmpdir(), "shelves-test-")),
    file = join(dir, "test.db");
  let db = sqliteStore(openDatabase(file));
  try {
    await db.run(
      "INSERT INTO users (id,email,username,display_name,password_hash) VALUES (?,?,?,?,?)",
      "u",
      "u@example.test",
      "u",
      "Reader",
      "placeholder",
    );
    await saveReading(db, "u", "seed-garden", {
      status: "Currently reading",
      page: 45,
      rating: 4,
      review: "Kept between launches",
      shelfIds: [],
    });
    await db.close();
    db = sqliteStore(openDatabase(file));
    assert.equal(
      (await one<{
        review: string;
      }>(db, "SELECT review FROM reading WHERE user_id=?", "u"))!.review,
      "Kept between launches",
    );
    assert.equal(
      (await one<{
        n: number;
      }>(db, "SELECT count(*) AS n FROM books"))!.n,
      6,
    );
  } finally {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("real catalog response normalization, fixed URLs, and cached fallback", async () => {
  const db = await testDatabase(),
    originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert(String(url).startsWith("https://openlibrary.org/search.json?"));
      return new Response(
        JSON.stringify({
          docs: [
            {
              key: "/works/OL123W",
              title: "A Real Book",
              author_name: ["An Author"],
              cover_i: 123,
              first_publish_year: 2000,
              subject: ["Fantasy"],
              number_of_pages_median: 200,
            },
            { key: "https://evil.example", title: "Invalid key" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const result = await searchBooks(db, "fixture query");
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].id, "OL123W");
    assert.equal(
      result.items[0].cover,
      "https://covers.openlibrary.org/b/id/123-M.jpg",
    );
    assert.equal(
      (await one<{
        title: string;
      }>(db, "SELECT title FROM books WHERE id=?", "OL123W"))!.title,
      "A Real Book",
    );
    globalThis.fetch = async () => {
      throw new Error("network unavailable");
    };
    const fallback = await searchBooks(db, "Secret Garden");
    assert.equal(fallback.source, "Saved catalog");
    assert(fallback.warning);
    assert.equal(fallback.items[0].title, "The Secret Garden");
  } finally {
    globalThis.fetch = originalFetch;
    await db.close();
  }
});

test("curated lists enforce privacy, ownership, order and atomic validation", async () => {
  const db = await testDatabase();
  const server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  async function call(
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
  ) {
    return fetch(
      `http://127.0.0.1:${address && typeof address === "object" ? address.port : 0}/api${path}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Shelves-Request": "1",
          cookie,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
  }
  try {
    const cookies: string[] = [];
    for (const username of ["collector", "visitor"]) {
      const response = await call("/auth/register", "POST", {
        username,
        email: `${username}@example.test`,
        password: "a-secure-list-password",
        displayName: username,
      });
      assert.equal(response.status, 201);
      cookies.push(response.headers.get("set-cookie")!.split(";")[0]);
    }
    const draft = {
      title: "Autumn stories",
      description: "Books for quiet evenings.",
      visibility: "private",
      bookIds: ["seed-garden", "seed-overstory"],
    };
    assert.equal((await call("/lists", "POST", draft)).status, 401);
    const created = await call("/lists", "POST", draft, cookies[0]);
    assert.equal(created.status, 201);
    const { id } = (await created.json()) as { id: string };
    const path = `/lists/${id}`;
    for (const cookie of ["", cookies[1]]) {
      assert.equal((await call(path, "GET", undefined, cookie)).status, 404);
      assert.deepEqual(
        (await (await call("/lists", "GET", undefined, cookie)).json()).items,
        [],
      );
      assert.equal(
        (await call(path, "PUT", draft, cookie)).status,
        cookie ? 404 : 401,
      );
      assert.equal(
        (await call(path, "DELETE", undefined, cookie)).status,
        cookie ? 404 : 401,
      );
    }
    for (const bookIds of [["missing"], ["seed-garden", "seed-garden"]])
      assert.equal(
        (
          await call(
            path,
            "PUT",
            { ...draft, title: "Invalid replacement", bookIds },
            cookies[0],
          )
        ).status,
        400,
      );
    const unchanged = (await (
      await call(path, "GET", undefined, cookies[0])
    ).json()) as { title: string; books: { id: string }[] };
    assert.equal(unchanged.title, draft.title);
    assert.deepEqual(
      unchanged.books.map((b) => b.id),
      draft.bookIds,
    );
    const reversed = [...draft.bookIds].reverse();
    assert.equal(
      (
        await call(
          path,
          "PUT",
          { ...draft, visibility: "public", bookIds: reversed },
          cookies[0],
        )
      ).status,
      200,
    );
    const published = (await (await call(path)).json()) as {
      books: { id: string }[];
    };
    assert.deepEqual(
      published.books.map((b) => b.id),
      reversed,
    );
    const discussion = `${path}/comments`;
    const ownerComment = {
      id: randomUUID(),
      body: "Which book should we read first?",
    };
    assert.equal((await call(discussion, "POST", ownerComment)).status, 401);
    for (const body of ["", " ", "x".repeat(1001)])
      assert.equal(
        (await call(discussion, "POST", { id: randomUUID(), body }, cookies[0]))
          .status,
        400,
      );
    assert.equal(
      (await call(discussion, "POST", ownerComment, cookies[0])).status,
      201,
    );
    assert.equal(
      (await call(discussion, "POST", ownerComment, cookies[0])).status,
      201,
    );
    assert.equal((await (await call(discussion)).json()).total, 1);
    assert.equal(
      (
        await call(
          discussion,
          "POST",
          { ...ownerComment, body: "Changed" },
          cookies[0],
        )
      ).status,
      409,
    );
    const otherComment = { id: randomUUID(), body: "The Secret Garden!" };
    assert.equal(
      (await call(discussion, "POST", otherComment, cookies[1])).status,
      201,
    );
    assert.equal(
      (
        await call(
          `${discussion}/${ownerComment.id}`,
          "DELETE",
          undefined,
          cookies[1],
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await call(
          `${discussion}/${otherComment.id}`,
          "DELETE",
          undefined,
          cookies[0],
        )
      ).status,
      204,
    );
    const mine = { id: randomUUID(), body: "My own comment" };
    await call(discussion, "POST", mine, cookies[1]);
    assert.equal(
      (await call(`${discussion}/${mine.id}`, "DELETE", undefined, cookies[1]))
        .status,
      204,
    );
    const ownerId = (
      await (await call(path, "GET", undefined, cookies[0])).json()
    ).userId;
    for (let i = 0; i < 21; i++)
      await db.run(
        "INSERT INTO list_comments VALUES (?,?,?,?,?)",
        randomUUID(),
        id,
        ownerId,
        `Comment ${i}`,
        new Date(1700000000000 + i).toISOString(),
      );
    const firstPage = await (await call(discussion)).json();
    const lastPage = await (await call(`${discussion}?page=999`)).json();
    assert.equal(firstPage.items.length, 20);
    assert.equal(lastPage.items.length, 2);
    assert.equal(lastPage.page, 2);
    assert.equal(
      new Set([...firstPage.items, ...lastPage.items].map((c) => c.id)).size,
      22,
    );
    assert.deepEqual(Object.keys(firstPage.items[0]).sort(), [
      "body",
      "createdAt",
      "displayName",
      "id",
      "userId",
    ]);
    assert.equal((await call(`${discussion}?page=0`)).status, 400);
    assert.equal(
      (await call(path, "PUT", { ...draft, bookIds: [] }, cookies[0])).status,
      200,
    );
    assert.equal((await call(path)).status, 404);
    assert.equal((await call(discussion)).status, 404);
    assert.equal(
      (await call(discussion, "GET", undefined, cookies[1])).status,
      404,
    );
    assert.equal(
      (
        await call(
          discussion,
          "POST",
          { id: randomUUID(), body: "Hidden" },
          cookies[1],
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await call(
          discussion,
          "POST",
          { id: randomUUID(), body: "Private" },
          cookies[0],
        )
      ).status,
      403,
    );
    assert.equal(
      (await (await call(discussion, "GET", undefined, cookies[0])).json())
        .total,
      22,
    );
    assert.equal(
      (await call(path, "DELETE", undefined, cookies[0])).status,
      204,
    );
    assert.equal((await call(path, "GET", undefined, cookies[0])).status, 404);
    assert.equal(
      (await db.get<{ n: number }>("SELECT count(*) AS n FROM list_comments"))!
        .n,
      0,
    );
    assert.equal(
      (await db.get<{ n: number }>("SELECT count(*) AS n FROM list_books"))!.n,
      0,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  }
});

test("account settings require reauthentication, revoke sessions and delete only the owner", async () => {
  const db = await testDatabase();
  const server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const request = async (
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
  ) =>
    fetch(`http://127.0.0.1:${address.port}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Shelves-Request": "1",
        cookie,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const cookieOf = (response: Response) =>
    response.headers.get("set-cookie")!.split(";")[0];
  const original = "original-password-123",
    replacement = "replacement-password-456";
  try {
    const created = await request("/auth/register", "POST", {
      email: "account@example.test",
      username: "account",
      displayName: "Account Reader",
      password: original,
    });
    const cookie = cookieOf(created),
      ownerId = ((await created.json()) as { user: User }).user.id;
    const secondCookie = cookieOf(
      await request("/auth/login", "POST", {
        email: "account@example.test",
        password: original,
      }),
    );
    const other = await request("/auth/register", "POST", {
      email: "otheraccount@example.test",
      username: "otheraccount",
      displayName: "Other Reader",
      password: original,
    });
    const otherCookie = cookieOf(other),
      otherId = ((await other.json()) as { user: User }).user.id;
    assert.equal((await request("/account")).status, 401);
    assert.deepEqual(
      await (await request("/account", "GET", undefined, cookie)).json(),
      { email: "account@example.test", activeSessions: 2 },
    );
    assert.equal(
      (
        await request(
          "/account/password",
          "POST",
          { currentPassword: "wrong", newPassword: replacement },
          cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/account/password",
          "POST",
          { currentPassword: original, newPassword: "short" },
          cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/account/password",
          "POST",
          { currentPassword: original, newPassword: replacement },
          cookie,
        )
      ).status,
      204,
    );
    for (const old of [cookie, secondCookie])
      assert.equal(
        (await request("/account", "GET", undefined, old)).status,
        401,
      );
    assert.equal(
      (
        await request("/auth/login", "POST", {
          email: "account@example.test",
          password: original,
        })
      ).status,
      401,
    );
    const fresh = cookieOf(
      await request("/auth/login", "POST", {
        email: "account@example.test",
        password: replacement,
      }),
    );
    const fresh2 = cookieOf(
      await request("/auth/login", "POST", {
        email: "account@example.test",
        password: replacement,
      }),
    );
    assert.equal(
      (
        await request(
          "/account/sign-out-all",
          "POST",
          { password: "wrong" },
          fresh,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/account/sign-out-all",
          "POST",
          { password: replacement },
          fresh,
        )
      ).status,
      204,
    );
    for (const old of [fresh, fresh2])
      assert.equal(
        (await request("/account", "GET", undefined, old)).status,
        401,
      );
    assert.equal(
      (await request("/account", "GET", undefined, otherCookie)).status,
      200,
    );
    const deleting = cookieOf(
      await request("/auth/login", "POST", {
        email: "account@example.test",
        password: replacement,
      }),
    );
    await db.run(
      "INSERT INTO shelves VALUES (?,?,?)",
      "account-shelf",
      ownerId,
      "Private shelf",
    );
    await db.run(
      "INSERT INTO shelf_books VALUES (?,?)",
      "account-shelf",
      "seed-garden",
    );
    await db.run(
      "INSERT INTO reading (user_id,book_id,status) VALUES (?,?,'Want to read')",
      ownerId,
      "seed-garden",
    );
    await db.run(
      "INSERT INTO lists (id,user_id,title) VALUES (?,?,?)",
      "account-list",
      ownerId,
      "Private collection",
    );
    await db.run(
      "INSERT INTO list_books VALUES (?,?,?)",
      "account-list",
      "seed-garden",
      0,
    );
    await db.run(
      "INSERT INTO posts (id,user_id,body,kind) VALUES (?,?,?,'thought')",
      "account-post",
      ownerId,
      "My post",
    );
    await db.run(
      "INSERT INTO comments (id,user_id,post_id,body) VALUES (?,?,?,?)",
      "account-comment",
      otherId,
      "account-post",
      "A reply",
    );
    await db.run("INSERT INTO follows VALUES (?,?)", otherId, ownerId);
    assert.equal(
      (
        await request(
          "/account",
          "DELETE",
          { password: "wrong", confirmation: "DELETE" },
          deleting,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/account",
          "DELETE",
          { password: replacement, confirmation: "NO" },
          deleting,
        )
      ).status,
      400,
    );
    assert.equal(
      (await request("/account", "GET", undefined, deleting)).status,
      200,
    );
    assert.equal(
      (
        await request(
          "/account",
          "DELETE",
          { password: replacement, confirmation: "DELETE" },
          deleting,
        )
      ).status,
      204,
    );
    assert.equal(
      (await request("/account", "GET", undefined, deleting)).status,
      401,
    );
    for (const table of [
      "reading",
      "shelves",
      "shelf_books",
      "lists",
      "list_books",
      "posts",
      "comments",
      "follows",
    ])
      assert.equal(
        (await db.get<{ n: number }>(`SELECT count(*) AS n FROM ${table}`))!.n,
        0,
        table,
      );
    assert.equal(
      (await request("/account", "GET", undefined, otherCookie)).status,
      200,
    );
    assert.equal(
      (await db.get<{ n: number }>("SELECT count(*) AS n FROM books"))!.n,
      6,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  }
});

test("private reading preferences persist and influence recommendations", async () => {
  const db = await testDatabase(),
    server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const call = (path: string, method = "GET", body?: unknown, cookie = "") =>
    fetch(`http://127.0.0.1:${address.port}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Shelves-Request": "1",
        cookie,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    const cookies: string[] = [];
    let userId = "";
    for (const username of ["tasteone", "tastetwo"]) {
      const r = await call("/auth/register", "POST", {
        username,
        email: `${username}@example.test`,
        displayName: username,
        password: "a-secure-preference-password",
      });
      cookies.push(r.headers.get("set-cookie")!.split(";")[0]);
      const data = (await r.json()) as { user: User };
      if (!userId) userId = data.user.id;
    }
    assert.equal((await call("/preferences")).status, 401);
    assert.equal(
      (await call("/preferences", "PUT", { genres: ["Fantasy"] })).status,
      401,
    );
    assert.deepEqual(
      await (await call("/preferences", "GET", undefined, cookies[0])).json(),
      { genres: [], completed: false },
    );
    for (const genres of [
      ["invalid"],
      ["Fantasy", "Fantasy"],
      ["Classic", "Literary", "Fantasy", "Fiction", "Nature", "Poetry"],
    ])
      assert.equal(
        (await call("/preferences", "PUT", { genres }, cookies[0])).status,
        400,
      );
    assert.equal(
      (await call("/preferences", "PUT", { genres: ["Fantasy"] }, cookies[0]))
        .status,
      200,
    );
    assert.deepEqual(
      await (await call("/preferences", "GET", undefined, cookies[0])).json(),
      { genres: ["Fantasy"], completed: true },
    );
    assert.deepEqual(
      await (await call("/preferences", "GET", undefined, cookies[1])).json(),
      { genres: [], completed: false },
    );
    const suggestions = await recommendations(db, userId);
    assert.equal(suggestions[0].genre, "Fantasy");
    assert.equal(suggestions[0].reason, "Because you chose fantasy");
    await db.run(
      "INSERT INTO recommendation_feedback VALUES (?,?)",
      userId,
      suggestions[0].id,
    );
    assert(
      !(await recommendations(db, userId)).some(
        (b) => b.id === suggestions[0].id,
      ),
    );
    const profile = await (await call(`/readers/${userId}`)).json();
    assert(!JSON.stringify(profile).includes('"genres"'));
    await call("/preferences", "PUT", { genres: [] }, cookies[0]);
    assert.deepEqual(
      await (await call("/preferences", "GET", undefined, cookies[0])).json(),
      { genres: [], completed: true },
    );
    assert(
      !(await recommendations(db, userId)).some((b) =>
        b.reason.startsWith("Because you chose"),
      ),
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  }
});

test("catalogue filters, literal search, sorting and bounded pagination", async () => {
  const db = await testDatabase(),
    server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const get = (query: string) =>
    fetch(`http://127.0.0.1:${address.port}/api/books/catalog?${query}`);
  try {
    for (let i = 0; i < 25; i++)
      await db.run(
        "INSERT INTO books (id,title,author,genre,year) VALUES (?,?,?,?,?)",
        `catalog-${i}`,
        `Catalogue ${String(i).padStart(2, "0")}`,
        "Test Writer",
        "Mystery",
        2000 + i,
      );
    const first = (await (await get("genre=Mystery")).json()) as {
      total: number;
      pages: number;
      items: { id: string }[];
    };
    assert.equal(first.total, 25);
    assert.equal(first.pages, 3);
    assert.equal(first.items.length, 12);
    const second = (await (await get("genre=Mystery&page=2")).json()) as {
      items: { id: string }[];
    };
    assert.equal(second.items.length, 12);
    assert(!second.items.some((b) => first.items.some((a) => a.id === b.id)));
    const last = (await (await get("genre=Mystery&page=999")).json()) as {
      page: number;
      items: { id: string }[];
    };
    assert.equal(last.page, 3);
    assert.equal(last.items.length, 1);
    const years = (await (
      await get("genre=Mystery&from=2010&to=2015&sort=newest")
    ).json()) as { total: number; items: { year: number }[] };
    assert.equal(years.total, 6);
    assert.deepEqual(
      years.items.map((b) => b.year),
      [2015, 2014, 2013, 2012, 2011, 2010],
    );
    assert.equal(
      ((await (await get("q=Test%20Writer")).json()) as { total: number })
        .total,
      25,
    );
    assert.equal(
      ((await (await get("q=%25")).json()) as { total: number }).total,
      0,
    );
    for (const query of [
      "page=0",
      "sort=invalid",
      "from=2020&to=1900",
      "from=nope",
    ])
      assert.equal((await get(query)).status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  }
});

test("Google Books editions, author filters and public reader directory", async () => {
  const db = await testDatabase();
  const originalFetch = globalThis.fetch,
    originalKey = process.env.GOOGLE_BOOKS_API_KEY;
  const volume = (id: string, language = "en") => ({
    id,
    volumeInfo: {
      title: "Edition Test",
      authors: ["Test Author", "Co Author"],
      categories: ["Fiction / Fantasy"],
      description: "<p>A <b>story</b> &amp; a journey.</p>",
      publisher: "Test Press",
      publishedDate: "2024-03-01",
      language,
      pageCount: 123,
      imageLinks: {
        thumbnail: "http://books.google.com/books/content?id=" + id,
      },
      industryIdentifiers: [{ type: "ISBN_13", identifier: "9780000000001" }],
    },
  });
  const normalized = normalizeGoogleVolume(volume("edition_a"))!;
  assert.equal(normalized.book.description, "A story & a journey.");
  assert.equal(normalized.book.genre, "Fantasy");
  assert.match(normalized.book.cover!, /^https:/);
  assert.equal(
    normalizeGoogleVolume({ id: "../../bad", volumeInfo: { title: "bad" } }),
    null,
  );
  assert.equal(
    normalizeGoogleVolume({
      ...volume("unsafe"),
      volumeInfo: {
        ...volume("unsafe").volumeInfo,
        imageLinks: { thumbnail: "https://evil.test/cover" },
      },
    })!.book.cover,
    null,
  );
  process.env.GOOGLE_BOOKS_API_KEY = "test-key-never-return";
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith("https://www.googleapis.com/")) {
      calls++;
      assert.equal(
        new Headers(init?.headers).get("X-Goog-Api-Key"),
        "test-key-never-return",
      );
      return new Response(
        JSON.stringify({
          totalItems: 2,
          items: [volume("edition_a"), volume("edition_b", "bg")],
        }),
        { status: 200 },
      );
    }
    return originalFetch(input, init);
  };
  const server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const get = (path: string) =>
    originalFetch(`http://127.0.0.1:${address.port}/api${path}`);
  try {
    const [results, duplicate] = await Promise.all([
      searchGoogleBooks(db, "unique-edition-test"),
      searchGoogleBooks(db, "unique-edition-test"),
    ]);
    assert.deepEqual(results, duplicate);
    assert.equal(calls, 1, "Concurrent searches share one upstream request");
    assert.deepEqual(
      await searchGoogleBooks({ ...db }, "unique-edition-test"),
      results,
    );
    assert.equal(calls, 1, "A new store wrapper reads the database cache");
    assert.equal(results.items.length, 2);
    assert.equal((await bookMetadata(db, "gb_edition_b"))!.language, "bg");
    await searchGoogleBooks(db, "unique-edition-test");
    assert.equal(calls, 1);
    const detail = await (await get("/books/gb_edition_a")).json();
    assert.deepEqual(detail.metadata.authors, ["Test Author", "Co Author"]);
    assert(!JSON.stringify(detail).includes("test-key-never-return"));
    const catalog = await (
      await get("/books/catalog?author=Co%20Author&from=2024&genre=Fantasy")
    ).json();
    assert.equal(catalog.total, 2);
    assert.equal(
      (await (await get("/books/catalog?author=Other")).json()).total,
      0,
    );
    for (const [id, name] of [
      ["dir-a", "Alpha Reader"],
      ["dir-b", "Beta Reader"],
    ])
      await db.run(
        "INSERT INTO users (id,email,username,display_name,password_hash) VALUES (?,?,?,?,?)",
        id,
        id + "@example.test",
        id,
        name,
        "unused",
      );
    await db.run(
      "INSERT INTO follows (user_id,followed_id) VALUES (?,?)",
      "dir-a",
      "dir-b",
    );
    const followers = await (
      await get("/readers/directory?scope=followers&reader=dir-b")
    ).json();
    assert.equal(followers.items[0].id, "dir-a");
    assert.deepEqual(Object.keys(followers.items[0]).sort(), [
      "bio",
      "displayName",
      "following",
      "id",
      "username",
    ]);
    assert.equal(
      (
        await (
          await get("/readers/directory?scope=following&reader=dir-a")
        ).json()
      ).items[0].id,
      "dir-b",
    );
    assert.equal(
      (await (await get("/readers/directory?q=%25")).json()).total,
      0,
    );
    assert.equal((await get("/readers/directory?scope=followers")).status, 400);
    assert.equal(
      (await get("/readers/directory?scope=followers&reader=missing")).status,
      404,
    );
    let retryCalls = 0;
    globalThis.fetch = async (input, init) => {
      if (!String(input).startsWith("https://www.googleapis.com/"))
        return originalFetch(input, init);
      retryCalls++;
      return retryCalls < 3
        ? new Response("{}", { status: 503 })
        : new Response(
            JSON.stringify({ totalItems: 1, items: [volume("retry_edition")] }),
          );
    };
    assert.equal(
      (await searchGoogleBooks(db, "transient-retry-test")).items.length,
      1,
    );
    assert.equal(retryCalls, 3);
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 360000;
      globalThis.fetch = async () => new Response("{}", { status: 503 });
      const previous = await searchGoogleBooks(db, "transient-retry-test");
      assert.equal(previous.source, "Saved Google Books results");
      assert.equal(previous.items[0].id, "gb_retry_edition");
      assert(previous.warning);
    } finally {
      Date.now = realNow;
    }
    globalThis.fetch = async (input, init) =>
      String(input).startsWith("https://www.googleapis.com/")
        ? new Response("{}", { status: 503 })
        : originalFetch(input, init);
    assert.equal(
      (await searchGoogleBooks(db, "Edition Test")).source,
      "Saved catalog",
    );
    await assert.rejects(
      searchGoogleBooks(db, "no-saved-result"),
      /temporarily unavailable/,
    );
    for (const [status, message] of [
      [403, /API configuration/],
      [429, /request limit/],
    ] as const) {
      globalThis.fetch = async (input, init) =>
        String(input).startsWith("https://www.googleapis.com/")
          ? new Response("private upstream details", { status })
          : originalFetch(input, init);
      await assert.rejects(
        searchGoogleBooks(db, "uncached-error-" + status),
        message,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GOOGLE_BOOKS_API_KEY;
    else process.env.GOOGLE_BOOKS_API_KEY = originalKey;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  }
});

test("recommendations use public social signals, respect privacy and diversify editions", async () => {
  const db = await testDatabase();
  try {
    for (const user of ["rec-viewer", "rec-friend", "rec-other", "rec-third"])
      await db.run(
        "INSERT INTO users (id,email,username,display_name,password_hash) VALUES (?,?,?,?,?)",
        user,
        `${user}@example.test`,
        user,
        user,
        "unused",
      );
    const rows = Array.from({ length: 510 }, (_, i) => [
      `candidate-${i}`,
      `A candidate ${String(i).padStart(3, "0")}`,
      `Writer ${i}`,
      "Fiction",
      100,
      "A complete story with fully described characters, setting and a thoughtful narrative.",
      null,
      "sage",
      2000,
    ]);
    rows.push([
      "social-target",
      "Z special story",
      "Social Author",
      "History",
      200,
      "A complete story with fully described characters, setting and a thoughtful narrative.",
      null,
      "sage",
      2020,
    ]);
    rows.push([
      "social-edition",
      "Z special story",
      "Social Author",
      "History",
      250,
      "Another complete edition of this fully described story and its thoughtful narrative.",
      null,
      "sage",
      2024,
    ]);
    rows.push([
      "social-second",
      "Z second story",
      "Social Author",
      "History",
      200,
      "A complete story with fully described characters, setting and a thoughtful narrative.",
      null,
      "sage",
      2022,
    ]);
    rows.push([
      "social-third",
      "Z third story",
      "Social Author",
      "History",
      200,
      "A complete story with fully described characters, setting and a thoughtful narrative.",
      null,
      "sage",
      2023,
    ]);
    await db.run(
      `INSERT INTO books VALUES ${rows.map(() => "(?,?,?,?,?,?,?,?,?)").join(",")}`,
      ...rows.flat(),
    );
    const original = await recommendations(db, "rec-viewer");
    assert(
      original.length > 0 && original.every((b) => b.id.startsWith("seed-")),
      "Cold start uses curated books, not unrelated imported filler",
    );
    // Someone else's private five-star reading must not change recommendations.
    await db.run(
      "INSERT INTO reading (user_id,book_id,status,rating,review) VALUES (?,?,?,?,?)",
      "rec-friend",
      "social-target",
      "Finished",
      5,
      "Private review never exposed",
    );
    await db.run(
      "INSERT INTO follows VALUES (?,?)",
      "rec-viewer",
      "rec-friend",
    );
    assert.deepEqual(await recommendations(db, "rec-viewer"), original);
    const review = async (
      id: string,
      user: string,
      book: string,
      rating: number,
    ) =>
      db.run(
        "INSERT INTO posts (id,user_id,body,kind,book_id,rating) VALUES (?,?,?,?,?,?)",
        id,
        user,
        "Public review",
        "review",
        book,
        rating,
      );
    await review("rec-public", "rec-friend", "social-target", 5);
    const social = await recommendations(db, "rec-viewer");
    assert.equal(social[0].id, "social-target");
    assert.equal(social[0].reason, "Rated highly by a reader you follow");
    assert(!social.some((b) => b.id === "social-edition"));
    assert(
      !(await recommendations(db)).some((b) => b.reason.includes("you follow")),
    );
    assert(!JSON.stringify(social).includes("Private review"));
    await db.run("UPDATE posts SET rating=2 WHERE id=?", "rec-public");
    assert(
      !(await recommendations(db, "rec-viewer")).some((b) =>
        b.reason.includes("you follow"),
      ),
    );
    await db.run("UPDATE posts SET rating=5 WHERE id=?", "rec-public");
    await review("rec-second", "rec-friend", "social-second", 5);
    await review("rec-third", "rec-friend", "social-third", 5);
    assert.equal(
      (await recommendations(db, "rec-viewer")).filter(
        (b) => b.author === "Social Author",
      ).length,
      2,
    );
    await db.run(
      "INSERT INTO recommendation_feedback VALUES (?,?)",
      "rec-viewer",
      "social-target",
    );
    assert(
      !(await recommendations(db, "rec-viewer")).some(
        (b) => b.title === "Z special story",
      ),
    );
    await db.run(
      "DELETE FROM recommendation_feedback WHERE user_id=?",
      "rec-viewer",
    );
    await db.run(
      "INSERT INTO reading (user_id,book_id,status) VALUES (?,?,?)",
      "rec-viewer",
      "social-edition",
      "Want to read",
    );
    assert(
      !(await recommendations(db, "rec-viewer")).some(
        (b) => b.title === "Z special story",
      ),
    );
    await db.run("DELETE FROM follows WHERE user_id=?", "rec-viewer");
    assert(
      !(await recommendations(db, "rec-viewer")).some((b) =>
        b.reason.includes("you follow"),
      ),
    );
    await review("rec-other-review", "rec-other", "social-target", 5);
    await review("rec-third-review", "rec-third", "social-target", 4);
    const publicPicks = await recommendations(db);
    assert.equal(publicPicks[0].id, "social-target");
    assert.equal(
      publicPicks[0].reason,
      "Rated highly in public community reviews",
    );
    assert.deepEqual(await recommendations(db), publicPicks);
    await db.run("DELETE FROM posts WHERE book_id=?", "social-target");
    assert(
      !(await recommendations(db)).some(
        (b) => b.reason === "Rated highly in public community reviews",
      ),
    );
  } finally {
    await db.close();
  }
});

test("profile image validation and private versus shared reading progress", async () => {
  const db = await testDatabase(),
    server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api`;
  const call = (path: string, method = "GET", body?: unknown, cookie = "") =>
    fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Shelves-Request": "1",
        cookie,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    const response = await call("/auth/register", "POST", {
      username: "image_reader",
      email: "image@example.test",
      displayName: "Image Reader",
      password: "test-password-1234",
    });
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    const user = (await response.json()).user;
    const png = await sharp({
      create: { width: 640, height: 480, channels: 3, background: "#8d9f87" },
    })
      .png()
      .toBuffer();
    const upload = (
      slot: string,
      bytes: Buffer,
      session = cookie,
      type = "image/png",
    ) =>
      fetch(`${base}/me/images/${slot}`, {
        method: "PUT",
        headers: {
          "Content-Type": type,
          "X-Shelves-Request": "1",
          cookie: session,
        },
        body: new Uint8Array(bytes),
      });
    assert.equal((await upload("avatar", png, "")).status, 401);
    assert.equal(
      (await upload("avatar", Buffer.from("not an image"))).status,
      400,
    );
    assert.equal(
      (
        await upload(
          "avatar",
          Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"></svg>',
          ),
        )
      ).status,
      400,
    );
    assert.equal(
      (await upload("avatar", Buffer.alloc(5 * 1024 * 1024 + 1))).status,
      413,
    );
    for (const slot of ["avatar", "banner"]) {
      assert.equal((await upload(slot, png)).status, 200);
      const image = await fetch(`${base}/readers/${user.id}/images/${slot}`);
      assert.equal(image.headers.get("content-type"), "image/jpeg");
      const meta = await sharp(
        Buffer.from(await image.arrayBuffer()),
      ).metadata();
      assert.equal(meta.width, slot === "avatar" ? 384 : 1600);
      assert(!meta.exif);
    }
    const profile = await (await call(`/readers/${user.id}`)).json();
    assert.equal(profile.reader.isAdmin, false);
    const previousAdmins = process.env.SHELVES_ADMIN_IDS;
    try {
      process.env.SHELVES_ADMIN_IDS = user.id;
      assert.equal(
        (await (await call(`/readers/${user.id}`)).json()).reader.isAdmin,
        true,
      );
      assert.equal(
        (await (await call("/auth/me", "GET", undefined, cookie)).json()).user
          .isAdmin,
        true,
      );
      process.env.SHELVES_ADMIN_IDS = "";
      assert.equal(
        (
          await call(
            "/me",
            "PATCH",
            { displayName: "Reader", bio: "", goal: 30, isAdmin: true },
            cookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (await (await call(`/readers/${user.id}`)).json()).reader.isAdmin,
        false,
      );
    } finally {
      if (previousAdmins === undefined) delete process.env.SHELVES_ADMIN_IDS;
      else process.env.SHELVES_ADMIN_IDS = previousAdmins;
    }
    assert(profile.reader.avatarVersion);
    assert(profile.reader.bannerVersion);
    assert(!JSON.stringify(profile).includes('"image":'));
    const me = await (await call("/auth/me", "GET", undefined, cookie)).json();
    assert(me.user.avatarVersion);
    await call("/me/images/avatar", "DELETE", undefined, cookie);
    assert.equal(
      (await fetch(`${base}/readers/${user.id}/images/avatar`)).status,
      404,
    );
    await db.run(
      "INSERT INTO reading (user_id,book_id,status,page,rating,review) VALUES (?,?,?,0,4,?)",
      user.id,
      "seed-overstory",
      "Currently reading",
      "Private notes",
    );
    const progress = "/library/seed-overstory/progress";
    assert.equal((await call(progress, "POST", { page: 20 })).status, 401);
    assert.equal(
      (await call(progress, "POST", { page: 99999 }, cookie)).status,
      400,
    );
    assert.equal(
      (await call(progress, "POST", { page: 20 }, cookie)).status,
      204,
    );
    assert.equal(
      (await db.get<{ n: number }>("SELECT count(*) AS n FROM posts"))!.n,
      0,
    );
    assert.equal(
      (
        await call(
          progress,
          "POST",
          { page: 40, share: true, note: "A chapter worth sharing." },
          cookie,
        )
      ).status,
      204,
    );
    const post = await db.get<{ body: string; kind: string; book_id: string }>(
      "SELECT body,kind,book_id FROM posts WHERE user_id=?",
      user.id,
    );
    assert.equal(post!.kind, "progress");
    assert.match(post!.body, /page 40/);
    assert(!post!.body.includes("Private notes"));
    assert.equal(post!.book_id, "seed-overstory");
    const reading = await db.get<{
      page: number;
      review: string;
      rating: number;
    }>("SELECT page,review,rating FROM reading WHERE user_id=?", user.id);
    assert.equal(reading!.review, "Private notes");
    assert.equal(reading!.rating, 4);
    assert.equal(
      (await call("/library/seed-garden/progress", "POST", { page: 2 }, cookie))
        .status,
      404,
    );
    await db.run("DELETE FROM users WHERE id=?", user.id);
    assert.equal(
      (await db.get<{ n: number }>("SELECT count(*) AS n FROM profile_images"))!
        .n,
      0,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  }
});

test("reader controls and reports enforce privacy, interaction boundaries and administrator review", async () => {
  const db = await testDatabase(),
    server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api`,
    oldAdmins = process.env.SHELVES_ADMIN_IDS;
  async function call(
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
  ) {
    return fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Shelves-Request": "1",
        cookie,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  try {
    const accounts = [];
    for (const name of ["safety_a", "safety_b", "safety_admin"]) {
      const response = await call("/auth/register", "POST", {
        username: name,
        email: name + "@example.test",
        displayName: name,
        password: "safe-test-password",
      });
      assert.equal(response.status, 201);
      const payload = await response.json();
      accounts.push({
        id: payload.user.id,
        cookie: response.headers.get("set-cookie")!.split(";")[0],
      });
    }
    const [a, b, admin] = accounts;
    process.env.SHELVES_ADMIN_IDS = admin.id;
    const post = await (
      await call(
        "/posts",
        "POST",
        { body: "Reported test content", kind: "thought" },
        b.cookie,
      )
    ).json();
    const postA = await (
      await call(
        "/posts",
        "POST",
        { body: "Another reader", kind: "thought" },
        a.cookie,
      )
    ).json();
    await call(
      `/posts/${postA.id}/comments`,
      "POST",
      { body: "Comment from B" },
      b.cookie,
    );
    assert.equal(
      (await call(`/readers/${b.id}/controls/mute`, "PUT", undefined, a.cookie))
        .status,
      204,
    );
    let feed = await (await call("/feed", "GET", undefined, a.cookie)).json();
    assert(!feed.items.some((p: Post) => p.userId === b.id));
    assert.equal(
      feed.items.find((p: Post) => p.id === postA.id).comments.length,
      0,
    );
    assert.equal(
      (await call(`/posts/${post.id}/like`, "PUT", undefined, a.cookie)).status,
      204,
      "mute allows interaction",
    );
    await call(`/readers/${b.id}/controls/mute`, "DELETE", undefined, a.cookie);
    await call(`/readers/${b.id}/follow`, "PUT", undefined, a.cookie);
    await call(`/readers/${a.id}/follow`, "PUT", undefined, b.cookie);
    assert.equal(
      (
        await call(
          `/readers/${b.id}/controls/block`,
          "PUT",
          undefined,
          a.cookie,
        )
      ).status,
      204,
    );
    assert.equal(
      (await db.get<{ n: number }>("SELECT count(*) AS n FROM follows"))!.n,
      0,
    );
    for (const [viewer, target, targetPost] of [
      [a, b, post],
      [b, a, postA],
    ]) {
      assert.equal(
        (
          await call(
            `/readers/${target.id}/follow`,
            "PUT",
            undefined,
            viewer.cookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await call(
            `/posts/${targetPost.id}/like`,
            "PUT",
            undefined,
            viewer.cookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await call(
            `/posts/${targetPost.id}/comments`,
            "POST",
            { body: "Should be blocked" },
            viewer.cookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (await call(`/posts/${targetPost.id}`, "GET", undefined, viewer.cookie))
          .status,
        404,
      );
      const directory = await (
        await call("/readers/directory", "GET", undefined, viewer.cookie)
      ).json();
      assert(!directory.items.some((r: Reader) => r.id === target.id));
    }
    assert.equal(
      (
        await call(
          `/readers/${a.id}/controls/block`,
          "PUT",
          undefined,
          a.cookie,
        )
      ).status,
      400,
    );
    assert.equal((await call("/me/reader-controls")).status, 401);
    const controls = await (
      await call("/me/reader-controls", "GET", undefined, b.cookie)
    ).json();
    assert.equal(controls.items.length, 0, "do not expose who blocked viewer");
    await call(
      `/readers/${b.id}/controls/block`,
      "DELETE",
      undefined,
      a.cookie,
    );
    assert.equal(
      (
        await call(
          `/posts/${post.id}/comments`,
          "POST",
          { body: "Allowed again" },
          a.cookie,
        )
      ).status,
      201,
    );
    const report = {
      kind: "post",
      targetId: post.id,
      reason: "Spam",
      details: "Please review",
    };
    assert.equal((await call("/reports", "POST", report)).status, 401);
    assert.equal(
      (await call("/reports", "POST", report, b.cookie)).status,
      400,
    );
    assert.equal(
      (await call("/reports", "POST", report, a.cookie)).status,
      201,
    );
    assert.equal(
      (await call("/reports", "POST", report, a.cookie)).status,
      201,
    );
    assert.equal(
      (await db.get<{ n: number }>("SELECT count(*) AS n FROM reports"))!.n,
      1,
      "duplicate report is idempotent",
    );
    assert.equal(
      (await call("/admin/reports", "GET", undefined, b.cookie)).status,
      403,
    );
    assert.equal((await call("/admin/reports")).status, 401);
    const queue = await (
      await call("/admin/reports", "GET", undefined, admin.cookie)
    ).json();
    assert.equal(queue.items.length, 1);
    assert.equal(queue.items[0].content, "Reported test content");
    const resolve = `/admin/reports/${queue.items[0].id}/resolve`;
    assert.equal(
      (await call(resolve, "POST", { action: "remove" }, a.cookie)).status,
      403,
    );
    assert.equal(
      (await call(resolve, "POST", { action: "remove" }, admin.cookie)).status,
      204,
    );
    assert.equal(
      (await call(resolve, "POST", { action: "dismiss" }, admin.cookie)).status,
      409,
    );
    assert.equal((await call(`/posts/${post.id}`)).status, 404);
    const removed = await (
      await call(
        "/admin/reports?status=removed",
        "GET",
        undefined,
        admin.cookie,
      )
    ).json();
    assert.equal(removed.total, 1);
    await call(
      "/reports",
      "POST",
      {
        kind: "reader",
        targetId: b.id,
        reason: "Other",
        details: "Profile review",
      },
      a.cookie,
    );
    const profileQueue = await (
      await call("/admin/reports", "GET", undefined, admin.cookie)
    ).json();
    assert.equal(
      (
        await call(
          `/admin/reports/${profileQueue.items[0].id}/resolve`,
          "POST",
          { action: "remove" },
          admin.cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          `/admin/reports/${profileQueue.items[0].id}/resolve`,
          "POST",
          { action: "dismiss" },
          admin.cookie,
        )
      ).status,
      204,
    );
    const list = await (
      await call(
        "/lists",
        "POST",
        {
          title: "Safety list",
          description: "Test",
          visibility: "public",
          bookIds: [],
        },
        b.cookie,
      )
    ).json();
    const listId = list.id;
    const commentId = randomUUID();
    assert.equal(
      (
        await call(
          `/lists/${listId}/comments`,
          "POST",
          { id: commentId, body: "List comment to review" },
          b.cookie,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await call(
          "/reports",
          "POST",
          { kind: "list_comment", targetId: commentId, reason: "Spam" },
          a.cookie,
        )
      ).status,
      201,
    );
    const listQueue = await (
      await call("/admin/reports", "GET", undefined, admin.cookie)
    ).json();
    const listReport = listQueue.items.find(
      (r: { kind: string }) => r.kind === "list_comment",
    );
    assert.equal(listReport.content, "List comment to review");
    assert.equal(
      (
        await call(
          `/admin/reports/${listReport.id}/resolve`,
          "POST",
          { action: "remove" },
          admin.cookie,
        )
      ).status,
      204,
    );
    assert.equal(
      (await (await call(`/lists/${listId}/comments`)).json()).total,
      0,
    );
    const privateComment = randomUUID();
    await call(
      `/lists/${listId}/comments`,
      "POST",
      { id: privateComment, body: "Private later" },
      b.cookie,
    );
    await call(
      `/lists/${listId}`,
      "PUT",
      {
        title: "Safety list",
        description: "Test",
        visibility: "private",
        bookIds: [],
      },
      b.cookie,
    );
    assert.equal(
      (
        await call(
          "/reports",
          "POST",
          { kind: "list_comment", targetId: privateComment, reason: "Spam" },
          a.cookie,
        )
      ).status,
      404,
    );

    const statusPath = `/admin/accounts/${b.id}/status`;
    const draft = {
      action: "suspend",
      reason: "Repeated harassment under review",
    };
    assert.equal((await call(statusPath, "POST", draft, a.cookie)).status, 403);
    assert.equal(
      (
        await call(
          `/admin/accounts/${admin.id}/status`,
          "POST",
          draft,
          admin.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          statusPath,
          "POST",
          { ...draft, reason: "short" },
          admin.cookie,
        )
      ).status,
      400,
    );
    const visiblePost = await (
      await call(
        "/posts",
        "POST",
        { body: "Suspension visibility test", kind: "thought" },
        b.cookie,
      )
    ).json();
    assert.equal(
      (await call(statusPath, "POST", draft, admin.cookie)).status,
      204,
    );
    assert.equal(
      (await call(statusPath, "POST", draft, admin.cookie)).status,
      409,
    );
    assert.equal(
      (
        await call(
          "/posts",
          "POST",
          { body: "Cannot publish", kind: "thought" },
          b.cookie,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await call("/auth/login", "POST", {
          email: "safety_b@example.test",
          password: "safe-test-password",
        })
      ).status,
      403,
    );
    assert.equal((await call(`/posts/${visiblePost.id}`)).status, 404);
    assert.equal(
      (
        await call(
          `/admin/accounts/${b.id}/history`,
          "GET",
          undefined,
          a.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          statusPath,
          "POST",
          { action: "restore", reason: "Review completed and access restored" },
          admin.cookie,
        )
      ).status,
      204,
    );
    assert.equal(
      (
        await call("/auth/login", "POST", {
          email: "safety_b@example.test",
          password: "safe-test-password",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call(
          "/posts",
          "POST",
          { body: "Old session stays revoked", kind: "thought" },
          b.cookie,
        )
      ).status,
      401,
    );
    assert.equal((await call(`/posts/${visiblePost.id}`)).status, 200);
    const history = await (
      await call(
        `/admin/accounts/${b.id}/history`,
        "GET",
        undefined,
        admin.cookie,
      )
    ).json();
    assert.equal(history.items.length, 2);
    assert.deepEqual(
      new Set(history.items.map((h: { action: string }) => h.action)),
      new Set(["suspend", "restore"]),
    );
  } finally {
    if (oldAdmins === undefined) delete process.env.SHELVES_ADMIN_IDS;
    else process.env.SHELVES_ADMIN_IDS = oldAdmins;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  }
});

test("recommendations require thematic relevance and credible imported editions", async () => {
  const db = await testDatabase(),
    oldKey = process.env.GOOGLE_BOOKS_API_KEY,
    originalFetch = globalThis.fetch;
  try {
    process.env.GOOGLE_BOOKS_API_KEY = "test-only";
    const volumes = [
      {
        id: "quality_novel",
        volumeInfo: {
          title: "A Forest of Stars",
          authors: ["L. Writer"],
          categories: ["Fiction / Fantasy"],
          description:
            "A complete fantasy novel about a magical forest and the people protecting it.",
          pageCount: 280,
          publisher: "Test Press",
          industryIdentifiers: [
            { type: "ISBN_13", identifier: "9780000000001" },
          ],
        },
      },
      {
        id: "quality_duplicate",
        volumeInfo: {
          title: "A Forest of Stars",
          authors: ["L. Writer"],
          categories: ["Fiction / Fantasy"],
          description:
            "A complete fantasy novel about a magical forest and the people protecting it.",
          pageCount: 300,
          publisher: "Test Press",
        },
      },
      {
        id: "quality_paper",
        volumeInfo: {
          title: "Conference proceedings on fantasy",
          authors: ["Academic Editor"],
          categories: ["Fiction / Fantasy"],
          description:
            "Academic conference proceedings investigating fictional narratives and their contexts.",
          pageCount: 400,
          publisher: "Test Press",
        },
      },
      {
        id: "quality_unrelated",
        volumeInfo: {
          title: "A History of Machine Tools",
          authors: ["A. Historian"],
          categories: ["History"],
          description:
            "An extensive historical overview of the development of machine tools around the world.",
          pageCount: 200,
          publisher: "Test Press",
        },
      },
      {
        id: "quality_incomplete",
        volumeInfo: {
          title: "Fragment",
          authors: ["A. Writer"],
          categories: ["Fiction / Fantasy"],
        },
      },
    ];
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ totalItems: volumes.length, items: volumes }),
      );
    await searchGoogleBooks(db, "quality-fixture");
    await db.run(
      "INSERT INTO users (id,email,username,display_name,password_hash) VALUES (?,?,?,?,?)",
      "quality-reader",
      "quality@example.test",
      "quality_reader",
      "Reader",
      "unused",
    );
    await db.run(
      "INSERT INTO reading_preferences (user_id,genres) VALUES (?,?)",
      "quality-reader",
      JSON.stringify(["Fantasy"]),
    );
    const picks = await recommendations(db, "quality-reader");
    assert(picks.some((b) => b.title === "A Forest of Stars"));
    assert.equal(
      picks.filter((b) => b.title === "A Forest of Stars").length,
      1,
    );
    assert(
      picks.every((b) => b.genre === "Fantasy"),
      "No off-theme filler",
    );
    for (const id of [
      "gb_quality_paper",
      "gb_quality_incomplete",
      "gb_quality_unrelated",
    ])
      assert(!picks.some((b) => b.id === id));
    const novel = normalizeGoogleVolume(volumes[0])!;
    assert(
      recommendationQuality(
        { ...novel.book, title: "The Notebook", pages: 30 },
        novel.metadata,
      ),
      "Real titles and short ISBN editions are not blanket-banned",
    );
    const ranked = rankSearch(
      [
        { ...novel.book, title: "A Study Guide to Dune" },
        { ...novel.book, title: "The Science of Dune" },
        { ...novel.book, title: "Dune" },
      ],
      "Dune",
    );
    assert.equal(ranked[0].title, "Dune");
    assert.equal(
      normalizeGoogleVolume({
        id: "magazine",
        volumeInfo: { title: "Magazine", printType: "MAGAZINE" },
      }),
      null,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.GOOGLE_BOOKS_API_KEY;
    else process.env.GOOGLE_BOOKS_API_KEY = oldKey;
    await db.close();
  }
});

test("feed cursors, filters and owned comment changes", async () => {
  const db = await testDatabase();
  const server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api`;
  const request = (path: string, method = "GET", body?: unknown, cookie = "") =>
    fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Shelves-Request": "1",
        cookie,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  async function register(username: string) {
    const r = await request("/auth/register", "POST", {
      username,
      displayName: username,
      email: username + "@example.test",
      password: "long-test-password",
    });
    assert.equal(r.status, 201);
    return {
      id: (await r.json()).user.id as string,
      cookie: r.headers.get("set-cookie")!.split(";")[0],
    };
  }
  try {
    const a = await register("cursor_reader"),
      b = await register("cursor_writer");
    for (let i = 0; i < 45; i++)
      await db.run(
        "INSERT INTO posts(id,user_id,body,kind,created_at) VALUES(?,?,?,?,?)",
        "cursor-" + String(i).padStart(3, "0"),
        b.id,
        "Paged story " + i,
        i === 0 ? "review" : "thought",
        "2026-01-01T00:00:00.000Z",
      );
    const first = await (await request("/feed")).json();
    assert.equal(first.items.length, 20);
    assert.equal(first.items[0].id, "cursor-044");
    await db.run(
      "INSERT INTO posts(id,user_id,body,kind,created_at) VALUES(?,?,?,?,?)",
      "new-story",
      b.id,
      "New story",
      "thought",
      "2026-02-01T00:00:00.000Z",
    );
    const second = await (
      await request("/feed?before=" + first.nextCursor)
    ).json();
    const third = await (
      await request("/feed?before=" + second.nextCursor)
    ).json();
    assert.equal(third.nextCursor, null);
    assert.equal(
      new Set(
        [...first.items, ...second.items, ...third.items].map(
          (p: Post) => p.id,
        ),
      ).size,
      45,
    );
    assert.equal(third.items.length, 5);
    const reviews = await (await request("/feed?filter=reviews")).json();
    assert.deepEqual(
      reviews.items.map((p: Post) => p.id),
      ["cursor-000"],
    );
    assert.equal(
      (
        await (
          await request("/feed?filter=following", "GET", undefined, a.cookie)
        ).json()
      ).items.length,
      0,
    );
    await db.run("INSERT INTO follows VALUES(?,?)", a.id, b.id);
    assert.equal(
      (
        await (
          await request("/feed?filter=following", "GET", undefined, a.cookie)
        ).json()
      ).items.length,
      20,
    );
    assert.equal(
      (await (await request("/feed?author=" + a.id)).json()).items.length,
      0,
    );
    assert.equal((await request("/feed?before=invalid")).status, 400);
    assert.equal(
      (
        await request(
          "/posts/cursor-044/comments",
          "POST",
          { body: "Original note" },
          a.cookie,
        )
      ).status,
      201,
    );
    const comment = (await db.get<{ id: string }>(
      "SELECT id FROM comments WHERE user_id=?",
      a.id,
    ))!;
    const path = "/comments/" + comment.id;
    const draft = { body: "Edited note", originalBody: "Original note" };
    assert.equal((await request(path, "PATCH", draft, b.cookie)).status, 404);
    assert.equal(
      (await request(path, "DELETE", undefined, b.cookie)).status,
      404,
    );
    assert.equal((await request(path, "PATCH", draft, a.cookie)).status, 204);
    assert.equal((await request(path, "PATCH", draft, a.cookie)).status, 409);
    assert.equal(
      (
        await request(
          path,
          "PATCH",
          { body: " ", originalBody: "Edited note" },
          a.cookie,
        )
      ).status,
      400,
    );
    await request("/readers/" + b.id + "/controls/block", "PUT", {}, a.cookie);
    assert.equal(
      (
        await request(
          path,
          "PATCH",
          { body: "Blocked edit", originalBody: "Edited note" },
          a.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (await (await request("/feed", "GET", undefined, a.cookie)).json()).items
        .length,
      0,
    );
    assert.equal(
      (await request(path, "DELETE", undefined, a.cookie)).status,
      204,
    );
    assert.equal(
      await db.get("SELECT id FROM comments WHERE id=?", comment.id),
      undefined,
    );
    assert.equal(
      await db.get(
        "SELECT id FROM notifications WHERE comment_id=?",
        comment.id,
      ),
      undefined,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
    await db.close();
  }
});

test("notification history pages, full unread filtering and recipient privacy", async () => {
  const db = await testDatabase();
  const server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api`;
  const request = (path: string, method = "GET", body?: unknown, cookie = "") =>
    fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Shelves-Request": "1",
        cookie,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  async function register(username: string) {
    const r = await request("/auth/register", "POST", {
      username,
      displayName: username,
      email: username + "@example.test",
      password: "long-test-password",
    });
    assert.equal(r.status, 201);
    return {
      id: (await r.json()).user.id as string,
      cookie: r.headers.get("set-cookie")!.split(";")[0],
    };
  }

  try {
    const a = await register("inbox_owner"),
      b = await register("inbox_actor");
    for (let i = 0; i < 125; i++)
      await db.run(
        "INSERT INTO notifications(id,recipient_id,actor_id,kind,event_key,created_at,read_at) VALUES(?,?,?,?,?,?,?)",
        "notice-" + String(i).padStart(3, "0"),
        a.id,
        b.id,
        "follow",
        "fixture-" + i,
        "2026-01-01 00:00:00",
        i < 5 ? null : "2026-02-01 00:00:00",
      );
    const inbox = async (path = "/notifications", cookie = a.cookie) => {
      const r = await request(path, "GET", undefined, cookie);
      assert.equal(r.status, 200);
      return (await r.json()) as NotificationInbox;
    };
    const first = await inbox();
    assert.equal(first.items.length, 20);
    assert.equal(Number(first.unread), 5);
    assert.equal(first.items[0].id, "notice-124");
    const unread = await inbox("/notifications?filter=unread");
    assert.equal(
      unread.items.length,
      5,
      "unread includes entries older than the former 100-item cap",
    );
    assert.equal(unread.nextCursor, null);
    await db.run(
      "INSERT INTO notifications(id,recipient_id,actor_id,kind,event_key,created_at) VALUES(?,?,?,?,?,?)",
      "notice-new",
      a.id,
      b.id,
      "follow",
      "fixture-new",
      "2026-03-01 00:00:00",
    );
    const ids = first.items.map((n) => n.id);
    let cursor = first.nextCursor;
    while (cursor) {
      const next = await inbox("/notifications?before=" + cursor);
      ids.push(...next.items.map((n) => n.id));
      cursor = next.nextCursor;
    }
    assert.equal(ids.length, 125);
    assert.equal(new Set(ids).size, 125);
    assert(!ids.includes("notice-new"));
    assert.equal(
      (await inbox("/notifications?before=" + first.nextCursor, b.cookie)).items
        .length,
      0,
    );
    assert.equal(
      (
        await request(
          "/notifications?before=invalid",
          "GET",
          undefined,
          a.cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/notifications?filter=unknown",
          "GET",
          undefined,
          a.cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/notifications/notice-000/read",
          "PATCH",
          undefined,
          b.cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          "/notifications/notice-000/read",
          "PATCH",
          undefined,
          a.cookie,
        )
      ).status,
      204,
    );
    assert.equal((await inbox("/notifications?filter=unread")).items.length, 5);
    await request("/readers/" + b.id + "/controls/mute", "PUT", {}, a.cookie);
    assert.equal((await inbox()).items.length, 0);
    assert.equal(Number((await inbox()).unread), 0);
    await request(
      "/readers/" + b.id + "/controls/mute",
      "DELETE",
      undefined,
      a.cookie,
    );
    await request("/notifications/read-all", "POST", {}, a.cookie);
    assert.equal((await inbox("/notifications?filter=unread")).items.length, 0);
    assert.equal(Number((await inbox()).unread), 0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
    await db.close();
  }
});

test("language-specific Google caches, catalogue filters and edition grouping", async () => {
  const db = await testDatabase(),
    originalFetch = globalThis.fetch,
    oldKey = process.env.GOOGLE_BOOKS_API_KEY;
  const server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api`;
  let calls = 0;
  const languages: string[] = [];
  try {
    process.env.GOOGLE_BOOKS_API_KEY = "fixture";
    globalThis.fetch = async (input, init) => {
      if (String(input).startsWith(base)) return originalFetch(input, init);
      const url = new URL(String(input));
      languages.push(url.searchParams.get("langRestrict") || "");
      calls++;
      return new Response(
        JSON.stringify({
          totalItems: editionVolumes.length,
          items: editionVolumes
            .filter(
              (v) =>
                !url.searchParams.get("langRestrict") ||
                v.volumeInfo.language === url.searchParams.get("langRestrict"),
            )
            .slice(
              Number(url.searchParams.get("startIndex") || 0),
              Number(url.searchParams.get("startIndex") || 0) + 10,
            ),
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    };
    assert.equal(
      (await searchGoogleBooks(db, "Edition story")).items.length,
      10,
    );
    const bg = await searchGoogleBooks(db, "Edition story", "bg");
    assert.deepEqual(
      bg.items.map((b) => b.id),
      ["gb_edition_13"],
    );
    assert.equal(
      (await searchGoogleBooks(db, "Edition story", "bg")).items.length,
      1,
    );
    assert.equal(calls, 2);
    assert.deepEqual(languages, ["", "bg"]);
    assert.equal(
      (await searchGoogleBooks(db, "Edition story", "fr")).items.length,
      0,
    );
    await searchGoogleBooks(db, "Edition story", "", { startIndex: 10 });
    const metadata = await bookMetadata(db, "gb_edition_13");
    assert.equal(metadata?.format, "ebook");
    assert.equal((await bookMetadata(db, "gb_edition_0"))?.format, null);
    const read = async (path: string) => {
      const r = await fetch(base + path);
      assert.equal(r.status, 200);
      return r.json();
    };
    const catalog = await read("/books/catalog?language=bg");
    assert.equal(catalog.total, 1);
    assert.equal(catalog.items[0].id, "gb_edition_13");
    const author = await read(
      "/books/catalog?author=Edition%20Writer&language=bg",
    );
    assert.equal(author.total, 1);
    const first = await read("/books/gb_edition_0/editions");
    assert.equal(first.total, 14);
    assert.equal(first.items.length, 12);
    const second = await read("/books/gb_edition_0/editions?page=2");
    assert.equal(second.items.length, 2);
    assert.equal(
      new Set(
        [...first.items, ...second.items].map((i: { book: Book }) => i.book.id),
      ).size,
      14,
    );
    assert(
      !first.items.some((i: { book: Book }) =>
        ["gb_edition_14", "gb_edition_15"].includes(i.book.id),
      ),
    );
    assert.equal(
      (await read("/books/gb_edition_0/editions?language=bg")).total,
      1,
    );
    assert.equal(
      (await read("/books/gb_edition_0/editions?language=fr")).total,
      0,
    );
    assert.equal(
      (await fetch(base + "/books/catalog?language=invalid")).status,
      400,
    );
    assert.equal(
      (await fetch(base + "/books/gb_edition_0/editions?page=0")).status,
      400,
    );
    assert.equal((await fetch(base + "/books/not-found/editions")).status, 404);
    for (const id of ["unknown-a", "unknown-b"])
      await db.run(
        "INSERT INTO books(id,title,author,genre,description,color) VALUES(?,?,?,?,?,?)",
        id,
        "Same title",
        "Unknown author",
        "Fiction",
        "",
        "sage",
      );
    assert.equal((await read("/books/unknown-a/editions")).total, 1);
    const savedCalls = calls;
    await db.run(
      "INSERT INTO book_search_cache(query,items,fetched_at) SELECT ?,items,fetched_at FROM book_search_cache WHERE query=?",
      "Legacy search",
      JSON.stringify(["books-v4", "Edition story", "", 0, GOOGLE_BOOK_FIELDS]),
    );
    assert.equal(
      (await searchGoogleBooks(db, "Legacy search")).items.length,
      10,
    );
    assert.equal(
      calls,
      savedCalls,
      "legacy unfiltered cache survives the upgrade",
    );
    // Expired provider cache must not bypass the language constraint on local recovery.
    await db.run("UPDATE book_search_cache SET fetched_at=0");
    globalThis.fetch = async () => new Response("{}", { status: 403 });
    const fallback = await searchGoogleBooks(db, "Edition story", "bg");
    assert.equal(fallback.source, "Saved catalog");
    assert.deepEqual(
      fallback.items.map((b) => b.id),
      ["gb_edition_13"],
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.GOOGLE_BOOKS_API_KEY;
    else process.env.GOOGLE_BOOKS_API_KEY = oldKey;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  }
});

test("Google search recovery preserves edition metadata and field constraints", async () => {
  const db = await testDatabase();
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GOOGLE_BOOKS_API_KEY;
  process.env.GOOGLE_BOOKS_API_KEY = "test-key";
  let calls = 0;
  const sparse = {
    id: "recovery",
    volumeInfo: { title: "Dune", authors: ["Frank Herbert"] },
  };
  const rich = {
    id: "recovery",
    volumeInfo: {
      ...sparse.volumeInfo,
      description: "The desert planet Arrakis and its people.",
      categories: ["Fiction / Science Fiction"],
      publisher: "Test Press",
      language: "en",
      publishedDate: "1965",
      pageCount: 412,
      industryIdentifiers: [{ type: "ISBN_13", identifier: "9780441172719" }],
      imageLinks: {
        thumbnail: "https://books.google.com/books/content?id=recovery",
      },
    },
  };
  try {
    globalThis.fetch = (async () => {
      calls++;
      return Response.json({ totalItems: 1, items: [sparse] });
    }) as typeof fetch;
    await searchGoogleBooks(db, "Dune");
    assert.equal(
      (await db.get<any>("SELECT * FROM books WHERE id=?", "gb_recovery"))
        .pages,
      null,
    );
    globalThis.fetch = (async () => {
      calls++;
      return Response.json(rich);
    }) as typeof fetch;
    const before = calls;
    await Promise.all([
      refreshGoogleBook(db, "gb_recovery"),
      refreshGoogleBook(db, "gb_recovery"),
    ]);
    assert.equal(calls, before + 1);
    assert.equal((await searchGoogleBooks(db, "Dune")).items[0].pages, 412);
    globalThis.fetch = (async () =>
      Response.json({
        totalItems: 1,
        items: [{ id: "recovery", volumeInfo: { title: "Dune" } }],
      })) as typeof fetch;
    const saved = await searchGoogleBooks(db, "Dune novel");
    assert.equal(saved.items[0].author, "Frank Herbert");
    assert.equal(saved.items[0].pages, 412);
    assert.equal(
      (await bookMetadata(db, "gb_recovery"))?.identifiers[0].identifier,
      "9780441172719",
    );
    assert.equal(
      (
        await db.all(
          "SELECT * FROM book_authors WHERE book_id=?",
          "gb_recovery",
        )
      ).length,
      1,
    );
    const queries: string[] = [];
    globalThis.fetch = (async (input: any) => {
      const url = new URL(String(input));
      queries.push(url.searchParams.get("q")!);
      return Response.json(
        queries.length === 1
          ? { totalItems: 0 }
          : {
              totalItems: 2,
              items: [
                rich,
                {
                  id: "wrong",
                  volumeInfo: {
                    title: "Science of Dune",
                    authors: ["Someone Else"],
                  },
                },
              ],
            },
      );
    }) as typeof fetch;
    const recovered = await searchGoogleBooks(
      db,
      'intitle:"Dune" inauthor:"Frank Herbert"',
    );
    assert.deepEqual(queries, [
      'intitle:"Dune" inauthor:"Frank Herbert"',
      "Dune Frank Herbert",
    ]);
    assert.deepEqual(
      recovered.items.map((b) => b.id),
      ["gb_recovery"],
    );
    globalThis.fetch = (async () =>
      new Response(null, { status: 403 })) as typeof fetch;
    const local = await searchGoogleBooks(
      db,
      "intitle:Dune inauthor:Herbert",
      "en",
    );
    assert.equal(local.source, "Saved catalog");
    assert.deepEqual(
      local.items.map((b) => b.id),
      ["gb_recovery"],
    );
    const isbn = await searchGoogleBooks(db, "isbn:9780441172719");
    assert.equal(isbn.items[0].id, "gb_recovery");
    let attempts = 0;
    globalThis.fetch = (async (input: any) => {
      attempts++;
      return new URL(String(input)).searchParams.has("orderBy")
        ? new Response(null, { status: 503 })
        : Response.json({ totalItems: 1, items: [rich] });
    }) as typeof fetch;
    assert.equal(
      (await searchGoogleBooks(db, "Dune Frank Herbert")).source,
      "Google Books",
    );
    assert.equal(attempts, 4);
    globalThis.fetch = (async (input: any) => {
      assert.equal(
        new URL(String(input)).searchParams.get("q"),
        "A Court of Thorns and Roses",
      );
      return Response.json({
        totalItems: 1,
        items: [
          {
            id: "acotar",
            volumeInfo: {
              title: "A Court of Thorns and Roses",
              authors: ["Sarah J. Maas"],
            },
          },
        ],
      });
    }) as typeof fetch;
    assert.equal(
      (await searchGoogleBooks(db, "ACOTAR")).items[0].id,
      "gb_acotar",
    );
    globalThis.fetch = (async () =>
      Response.json({
        totalItems: 3,
        items: [
          {
            id: "littlelife",
            volumeInfo: {
              title: "A Little Life",
              authors: ["Hanya Yanagihara"],
            },
          },
          {
            id: "dorrit",
            volumeInfo: {
              title: "Little Dorrit",
              authors: ["Charles Dickens"],
            },
          },
          { id: "pleasures", volumeInfo: { title: "The Pleasures of Life" } },
        ],
      })) as typeof fetch;
    assert.deepEqual(
      (await searchGoogleBooks(db, "A Little Life")).items.map((b) => b.id),
      ["gb_littlelife"],
    );
    // A wrong-volume detail response must never overwrite an existing edition.
    globalThis.fetch = (async () =>
      Response.json({
        totalItems: 1,
        items: [{ id: "incomplete", volumeInfo: { title: "Incomplete" } }],
      })) as typeof fetch;
    await searchGoogleBooks(db, "Incomplete");
    globalThis.fetch = (async () => Response.json(rich)) as typeof fetch;
    await refreshGoogleBook(db, "gb_incomplete");
    assert.equal(
      (await db.get<any>("SELECT * FROM books WHERE id=?", "gb_incomplete"))
        .pages,
      null,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GOOGLE_BOOKS_API_KEY;
    else process.env.GOOGLE_BOOKS_API_KEY = originalKey;
    await db.close();
  }
});

test("book search prioritizes novels while respecting explicit companion searches", () => {
  for (const title of [
    "A Court of Thorns and Roses",
    "A Little Life",
    "Dune",
    "Piranesi",
  ]) {
    const variants = [
      title + " Colouring Book",
      "Study Guide: " + title,
      title + " Companion",
      "Conversations on " + title,
      title + " Box Set",
      title,
    ];
    const books = variants.map((name, i) =>
      normalizeGoogleVolume({
        id: "rank_" + i,
        volumeInfo: {
          title: name,
          authors: ["Test Author"],
          categories: ["Fiction"],
          publisher: "Publisher",
          pageCount: 250,
          description:
            "A complete novel about a community and its shared history.",
        },
      })!,
    );
    assert.equal(
      rankSearch(
        books.map((v) => v.book),
        title,
      )[0].title,
      title,
    );
    assert.equal(
      rankSearch(
        books.map((v) => v.book),
        title + " colouring book",
      )[0].title,
      title + " Colouring Book",
    );
    assert.equal(
      rankSearch(
        books.map((v) => v.book),
        title + " companion",
      )[0].title,
      title + " Companion",
    );
    assert.equal(
      rankSearch(
        books.map((v) => v.book),
        "Test Author",
      )[0].title,
      title,
    );
    for (const v of books.slice(0, 4))
      assert.equal(recommendationQuality(v.book, v.metadata), false);
    assert.equal(recommendationQuality(books[5].book, books[5].metadata), true);
  }
});

test("reader matches use only public reviews and honor social safety", async () => {
  const db = await testDatabase();
  try {
    for (const name of [
      "match_me",
      "match_same",
      "match_genre",
      "match_private",
      "match_low",
      "match_muted",
      "match_reverse",
      "match_suspended",
    ]) {
      await db.run(
        "INSERT INTO users(id,email,username,display_name,password_hash) VALUES(?,?,?,?,?)",
        name,
        name + "@example.test",
        name,
        name,
        "unused",
      );
    }
    for (const [id, title] of [
      ["match_book", "Shared Novel"],
      ["match_edition", "Shared Novel"],
      ["match_other", "Another Novel"],
    ]) {
      await db.run(
        "INSERT INTO books VALUES(?,?,?,?,?,?,?,?,?)",
        id,
        title,
        "Same Author",
        "Fantasy",
        200,
        "A novel",
        null,
        "sage",
        2020,
      );
    }
    async function review(user: string, book = "match_book", rating = 5) {
      await db.run(
        "INSERT INTO posts(id,user_id,body,kind,book_id,rating) VALUES(?,?,?,?,?,?)",
        user + book,
        user,
        "Public review",
        "review",
        book,
        rating,
      );
    }
    await review("match_me");
    await review("match_same");
    await review("match_same", "match_edition");
    await review("match_genre", "match_other");
    await review("match_low", "match_book", 2);
    for (const user of ["match_muted", "match_reverse", "match_suspended"])
      await review(user);
    await db.run(
      "INSERT INTO reading(user_id,book_id,status,rating,review) VALUES(?,?,?,?,?)",
      "match_private",
      "match_book",
      "Finished",
      5,
      "PRIVATE SENTINEL",
    );
    await db.run(
      "INSERT INTO reader_controls VALUES(?,?,?)",
      "match_me",
      "match_muted",
      "mute",
    );
    await db.run(
      "INSERT INTO reader_controls VALUES(?,?,?)",
      "match_reverse",
      "match_me",
      "block",
    );
    await db.run(
      "INSERT INTO account_suspensions(user_id,reason,created_at,actor_id) VALUES(?,?,?,?)",
      "match_suspended",
      "Test suspension",
      "2026-01-01",
      "match_me",
    );
    let readers = await readerSuggestions(db, "match_me");
    assert.equal(readers[0].id, "match_same");
    assert.equal(
      readers[0].reason,
      "You both rated 1 book highly in public reviews",
    );
    assert.equal(readers[1].id, "match_genre");
    assert.equal(readers[1].reason, "Your public reviews share 1 genre");
    for (const id of ["match_private", "match_low"])
      assert.equal(
        readers.find((r) => r.id === id)?.reason,
        "Explore their reading corner",
      );
    for (const id of [
      "match_me",
      "match_muted",
      "match_reverse",
      "match_suspended",
    ])
      assert(!readers.some((r) => r.id === id));
    assert(!JSON.stringify(readers).includes("PRIVATE SENTINEL"));
    assert(
      (await readerSuggestions(db)).every(
        (r) => r.reason === "Explore their reading corner",
      ),
    );
    await db.run("INSERT INTO follows VALUES(?,?)", "match_me", "match_same");
    assert.equal(
      (await readerSuggestions(db, "match_me")).find(
        (r) => r.id === "match_same",
      )?.following,
      true,
    );
    await db.run("DELETE FROM posts WHERE user_id=?", "match_me");
    readers = await readerSuggestions(db, "match_me");
    assert(readers.every((r) => r.reason === "Explore their reading corner"));
  } finally {
    await db.close();
  }
});

test("list pagination, atomic additions and complete comment history", async () => {
  const db = await testDatabase();
  const server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api`;
  let cookie = "";
  const call = (path: string, method = "GET", body?: unknown, signed = true) =>
    fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Shelves-Request": "1",
        cookie: signed ? cookie : "",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    await seedListFixture(db, await hashPassword("test-password-long"));
    const login = await call("/auth/login", "POST", {
      email: "list-owner@example.test",
      password: "test-password-long",
    });
    assert.equal(login.status, 200);
    cookie = login.headers.get("set-cookie")!.split(";")[0];
    const mine = await (await call("/lists?scope=mine")).json();
    assert.equal(mine.total, 25);
    assert.equal(mine.items.length, 20);
    assert.equal(mine.pages, 2);
    const second = await (await call("/lists?scope=mine&page=2")).json();
    assert.equal(second.items.length, 5);
    assert.equal(
      new Set([...mine.items, ...second.items].map((x) => x.id)).size,
      25,
    );
    const last = await (await call("/lists?page=9999")).json();
    assert.equal(last.total, 125);
    assert.equal(last.page, 7);
    assert.equal(last.items.length, 5);
    assert.equal(
      (await call("/lists?scope=mine", "GET", undefined, false)).status,
      401,
    );
    assert.equal((await call("/lists?page=-1")).status, 400);
    assert.equal((await call("/lists?scope=invalid")).status, 400);
    const guest = await (await call("/lists", "GET", undefined, false)).json();
    assert.equal(guest.total, 101);
    assert(
      guest.items.every(
        (x: { visibility: string }) => x.visibility === "public",
      ),
    );
    const add = (id: string, bookId = "seed-garden", signed = true) =>
      call(`/lists/${id}/books`, "POST", { bookId }, signed);
    assert.equal(
      (await add("collection-000", "seed-garden", false)).status,
      401,
    );
    assert.equal((await add("collection-100")).status, 404);
    assert.equal((await add("collection-000", "missing-book")).status, 404);
    const additions = await Promise.all([
      add("collection-000"),
      add("collection-000"),
      add("collection-000", "seed-overstory"),
    ]);
    assert(additions.every((r) => r.status === 200));
    let detail = await (await call("/lists/collection-000")).json();
    assert.equal(detail.books.length, 2);
    assert.equal(new Set(detail.books.map((b: Book) => b.id)).size, 2);
    for (let i = 2; i < 50; i++)
      await db.run(
        "INSERT INTO list_books VALUES(?,?,?)",
        "collection-000",
        "picker-" + i,
        i,
      );
    assert.equal((await add("collection-000", "picker-124")).status, 400);
    assert.equal((await add("collection-000")).status, 200);
    const catalog = await (
      await call("/books/catalog?q=Catalogue%20story%20124")
    ).json();
    assert.equal(catalog.items[0].id, "picker-124");
    const first = await (await call("/posts/history-post/comments")).json();
    assert.equal(first.total, 125);
    assert.equal(first.items.length, 20);
    assert.equal(first.items[0].id, "note-124");
    const seen = [...first.items];
    let cursor = first.nextCursor;
    await db.run("DELETE FROM comments WHERE id=?", first.items.at(-1).id);
    while (cursor) {
      const response = await call(
        "/posts/history-post/comments?before=" + encodeURIComponent(cursor),
      );
      assert.equal(response.status, 200);
      const page = await response.json();
      seen.push(...page.items);
      cursor = page.nextCursor;
    }
    assert.equal(seen.length, 125);
    assert.equal(new Set(seen.map((x) => x.id)).size, 125);
    assert.equal(
      (await call("/posts/history-post/comments?before=garbage")).status,
      400,
    );
    await db.run(
      "INSERT INTO posts(id,user_id,body,kind) VALUES(?,?,?,?)",
      "other-post",
      "list-visitor",
      "Other",
      "thought",
    );
    assert.equal(
      (
        await call(
          "/posts/other-post/comments?before=" +
            encodeURIComponent(first.nextCursor),
        )
      ).status,
      400,
    );
    await db.run(
      "INSERT INTO reader_controls VALUES(?,?,?)",
      "list-visitor",
      "list-owner",
      "block",
    );
    assert.equal((await call("/posts/history-post/comments")).status, 404);
    assert.equal((await (await call("/lists?scope=all")).json()).total, 25);
  } finally {
    server.close();
    await once(server, "close");
    await db.close();
  }
});

test("optimized Google requests and ISBN cache-aside", async () => {
  const db = await testDatabase(),
    originalFetch = globalThis.fetch,
    originalKey = process.env.GOOGLE_BOOKS_API_KEY;
  const server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api`;
  let calls = 0;
  const volume = {
    id: "compact",
    volumeInfo: {
      title: "A compact book",
      authors: ["An Author"],
      description: "A small response.",
      imageLinks: { thumbnail: "https://books.google.com/books?id=compact" },
    },
  };
  try {
    process.env.GOOGLE_BOOKS_API_KEY = "fixture-only";
    const lite = googleBooksSearchUrl("query", "", { fields: null });
    assert.equal(lite.searchParams.get("projection"), "lite");
    assert(!lite.searchParams.has("fields"));
    globalThis.fetch = async (input, init) => {
      if (String(input).startsWith(base)) return originalFetch(input, init);
      calls++;
      const url = new URL(String(input)),
        headers = new Headers(init?.headers);
      assert.equal(headers.get("Accept-Encoding"), "gzip");
      assert.equal(headers.get("User-Agent"), "Shelves (gzip)");
      assert(init?.signal, "Provider requests have a timeout signal");
      assert(!url.searchParams.has("key"));
      if (url.pathname.endsWith("/compact"))
        return Response.json({
          ...volume,
          volumeInfo: {
            ...volume.volumeInfo,
            language: "en",
            pageCount: 240,
            industryIdentifiers: [
              { type: "ISBN_13", identifier: "9780441172719" },
            ],
          },
        });
      assert.equal(url.searchParams.get("fields"), GOOGLE_BOOK_FIELDS);
      assert.equal(url.searchParams.get("maxResults"), "10");
      assert.equal(url.searchParams.get("printType"), "books");
      const index = Number(url.searchParams.get("startIndex"));
      return Response.json({
        items: [{ ...volume, id: index ? "second_page" : "compact" }],
      });
    };
    const first = await searchGoogleBooks(db, "compact query");
    assert.equal(first.items[0].id, "gb_compact");
    assert.equal(calls, 1);
    await searchGoogleBooks({ ...db }, "compact query");
    assert.equal(
      calls,
      1,
      "Persistent search cache survives a new Store wrapper",
    );
    const next = await originalFetch(
      base + "/books/search?q=compact%20query&startIndex=10",
    );
    assert.equal(next.status, 200);
    assert.equal((await next.json()).items[0].id, "gb_second_page");
    assert.equal(
      (await originalFetch(base + "/books/search?q=test&startIndex=-1")).status,
      400,
    );
    const beforeISBN = calls;
    const books = await Promise.all([
      getBookByISBN(db, "978-0-441-17271-9"),
      getBookByISBN(db, "9780441172719"),
    ]);
    assert.equal(books[0]?.id, "gb_compact");
    assert.deepEqual(books[0], books[1]);
    assert.equal(
      calls,
      beforeISBN + 2,
      "One compact search and one ISBN verification shared by concurrent misses",
    );
    delete process.env.GOOGLE_BOOKS_API_KEY;
    assert.equal((await getBookByISBN({ ...db }, "9780441172719"))?.pages, 240);
    assert.equal(
      calls,
      beforeISBN + 2,
      "A verified local ISBN hit requires neither provider nor API key",
    );
    assert.equal(
      (await originalFetch(base + "/books/isbn/9780441172719")).status,
      200,
    );
    await assert.rejects(getBookByISBN(db, "9780441172710"), /check digit/);
    await searchGoogleBooks(db, "compact query");
    assert.equal(
      calls,
      beforeISBN + 2,
      "Fresh search cache also works without provider configuration",
    );
    process.env.GOOGLE_BOOKS_API_KEY = "fixture-only";
    let limited = 0;
    globalThis.fetch = async () => {
      limited++;
      return new Response("private provider error", {
        status: 429,
        headers: { "Retry-After": "60" },
      });
    };
    await assert.rejects(
      searchGoogleBooks(db, "rate limit unknown"),
      /request limit/,
    );
    assert.equal(limited, 1, "429 is not immediately retried");
    globalThis.fetch = async () => {
      throw new DOMException("timed out", "TimeoutError");
    };
    await assert.rejects(
      searchGoogleBooks(db, "timeout unknown"),
      /too long to respond/,
    );
    globalThis.fetch = async () => Response.json({});
    assert.equal(
      await getBookByISBN(db, "9780140328721"),
      null,
      "An empty partial response is a valid miss",
    );
    await db.run(
      "INSERT INTO book_search_cache VALUES(?,?,?) ON CONFLICT(query) DO UPDATE SET items=excluded.items",
      JSON.stringify(["books-v4", "corrupt", "", 0, GOOGLE_BOOK_FIELDS]),
      "{}",
      Date.now(),
    );
    assert.equal((await searchGoogleBooks(db, "corrupt")).items.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GOOGLE_BOOKS_API_KEY;
    else process.env.GOOGLE_BOOKS_API_KEY = originalKey;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  }
});
