import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createApp } from "../server/app.ts";
import { testDatabase } from "./database.ts";

test("verification and recovery links are one-use, expire, and revoke sessions", async () => {
  const db = await testDatabase();
  const server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const request = (path: string, body: unknown, cookie = "") =>
    fetch(`http://127.0.0.1:${address.port}/api${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shelves-Request": "1",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  try {
    const registration = await request("/auth/register", {
      email: "letter@example.test",
      username: "letterreader",
      displayName: "Letter Reader",
      password: "original-password-123",
    });
    assert.equal(registration.status, 201);
    const { user } = (await registration.json()) as { user: { id: string } };
    const cookie = registration.headers.get("set-cookie")!.split(";")[0];
    const status = await db.get<{ emailVerifiedAt: number | null }>(
      'SELECT email_verified_at AS "emailVerifiedAt" FROM users WHERE id=?',
      user.id,
    );
    assert.equal(status?.emailVerifiedAt, null);
    const hash = (token: string) =>
      createHash("sha256").update(token).digest("hex");
    const verify = "a".repeat(64);
    await db.run("DELETE FROM account_links WHERE user_id=?", user.id);
    await db.run(
      "INSERT INTO account_links VALUES (?,?,?,?,?)",
      hash(verify),
      user.id,
      "verify",
      Date.now(),
      Date.now() + 60000,
    );
    assert.equal(
      (await request("/auth/verify-email", { token: verify })).status,
      200,
    );
    assert.equal(
      (await request("/auth/verify-email", { token: verify })).status,
      400,
    );
    const reset = "b".repeat(64);
    await db.run(
      "INSERT INTO account_links VALUES (?,?,?,?,?)",
      hash(reset),
      user.id,
      "reset",
      Date.now(),
      Date.now() - 1,
    );
    assert.equal(
      (
        await request("/auth/reset-password", {
          token: reset,
          password: "new-password-123",
        })
      ).status,
      400,
    );
    await db.run(
      "UPDATE account_links SET expires_at=? WHERE token_hash=?",
      Date.now() + 60000,
      hash(reset),
    );
    assert.equal(
      (
        await request("/auth/reset-password", {
          token: reset,
          password: "new-password-123",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request("/auth/reset-password", {
          token: reset,
          password: "another-password-123",
        })
      ).status,
      400,
    );
    const session = await fetch(
      `http://127.0.0.1:${address.port}/api/auth/me`,
      { headers: { cookie } },
    );
    assert.equal(((await session.json()) as { user: unknown }).user, null);
    assert.equal(
      (
        await request("/auth/login", {
          username: "letterreader",
          password: "original-password-123",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request("/auth/login", {
          username: "letterreader",
          password: "new-password-123",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request("/auth/forgot-password", {
          email: "unknown@example.test",
        })
      ).status,
      200,
    );
  } finally {
    server.close();
    await db.close();
  }
});
