import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.ts";
import { openDatabase, one } from "../server/db.ts";
import {
  recommendations,
  saveReading,
  searchBooks,
  bookSummary,
  publicReviews,
} from "../server/services.ts";
import type { User, Reading, Shelf, Post, Reader } from "../shared/types.ts";
test("accounts, private library ownership, social flows, validation, CSRF and logout", async () => {
  const db = openDatabase(":memory:");
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
    const first = (await registered.json()) as { user: User };
    const cookie = registered.headers.get("set-cookie")!.split(";")[0];
    assert(registered.headers.get("set-cookie")!.includes("HttpOnly"));
    assert(registered.headers.get("set-cookie")!.includes("SameSite=Lax"));
    const stored = one<{ hash: string }>(
      db,
      "SELECT password_hash AS hash FROM users WHERE id=?",
      first.user.id,
    )!;
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
    const second = (await secondRegistration.json()) as { user: User };
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
    const { shelf } = (await newShelf.json()) as { shelf: Shelf };
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
    ).json()) as { items: Reading[] };
    assert.equal(records.items[0].page, 512);
    assert(records.items[0].finishedAt);
    assert.equal(records.items[0].review, update.review);
    const otherSnapshot = (await (
      await request("/snapshot", "GET", undefined, otherCookie)
    ).json()) as { library: Reading[]; stats: unknown };
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
    ).json()) as { items: Reading[] };
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
      !recommendations(db, first.user.id).some(
        (b) => b.id === "seed-overstory",
      ),
    );
    assert.equal(recommendations(db, first.user.id)[0].id, "seed-smallthings");
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
      !recommendations(db, first.user.id).some((b) => b.id === "seed-piranesi"),
    );
    const postResponse = await request(
      "/posts",
      "POST",
      { body: "A public reading thought", kind: "thought" },
      cookie,
    );
    assert.equal(postResponse.status, 201);
    const postId = ((await postResponse.json()) as { id: string }).id;
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
    ).json()) as { items: Reader[] };
    assert(readers.items.find((r) => r.id === first.user.id)?.following);
    assert(!JSON.stringify(readers).includes("email"));
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
    ).json()) as { items: Post[] };
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
    assert.equal(
      one<{ n: number }>(db, "SELECT count(*) AS n FROM comments")!.n,
      0,
    );
    assert.equal(
      (await request("/library/seed-overstory", "DELETE", undefined, cookie))
        .status,
      204,
    );
    assert.equal(
      one<{ n: number }>(db, "SELECT count(*) AS n FROM shelf_books")!.n,
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
    db.close();
  }
});
test("public reviews are separate, editable, owner-scoped and aggregated", async () => {
  const db = openDatabase(":memory:"),
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
        user: ((await r.json()) as { user: User }).user,
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
      { ...bookSummary(db, "seed-garden") },
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
    const firstId = ((await published.json()) as { id: string }).id;
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
    assert.equal(((await updated.json()) as { id: string }).id, firstId);
    assert.deepEqual(
      { ...bookSummary(db, "seed-garden") },
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
      { ...bookSummary(db, "seed-garden") },
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
    const own = publicReviews(db, "seed-garden", a.user.id);
    assert.equal(own.mine?.id, firstId);
    assert(own.mine?.containsSpoilers);
    assert(own.mine?.editedAt);
    assert.equal(
      publicReviews(db, "seed-garden", b.user.id).mine?.userId,
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
      { ...bookSummary(db, "seed-garden") },
      {
        averageRating: 5,
        reviewCount: 1,
      },
    );
    assert.equal(
      one<{ n: number }>(
        db,
        "SELECT count(*) AS n FROM comments WHERE post_id=?",
        firstId,
      )!.n,
      0,
    );
    const privateAfter = (await (
      await req("/library", "GET", undefined, a.cookie)
    ).json()) as { items: Reading[] };
    assert.equal(privateAfter.items[0].review, "Private words stay private");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  }
});
test("database migrations and reading records survive reopening", () => {
  const dir = mkdtempSync(join(tmpdir(), "shelves-test-")),
    file = join(dir, "test.db");
  let db = openDatabase(file);
  try {
    db.prepare(
      "INSERT INTO users (id,email,username,display_name,password_hash) VALUES (?,?,?,?,?)",
    ).run("u", "u@example.test", "u", "Reader", "placeholder");
    saveReading(db, "u", "seed-garden", {
      status: "Currently reading",
      page: 45,
      rating: 4,
      review: "Kept between launches",
      shelfIds: [],
    });
    db.close();
    db = openDatabase(file);
    assert.equal(
      one<{ review: string }>(
        db,
        "SELECT review FROM reading WHERE user_id=?",
        "u",
      )!.review,
      "Kept between launches",
    );
    assert.equal(
      one<{ n: number }>(db, "SELECT count(*) AS n FROM books")!.n,
      6,
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("real catalog response normalization, fixed URLs, and cached fallback", async () => {
  const db = openDatabase(":memory:"),
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
      one<{ title: string }>(
        db,
        "SELECT title FROM books WHERE id=?",
        "OL123W",
      )!.title,
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
    db.close();
  }
});
