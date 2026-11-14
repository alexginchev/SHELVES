const {
  chromium,
} = require("C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const { auditLayout } = require("./layout.cjs");
(async () => {
  const server = spawn(
    process.execPath,
    ["--import", "tsx", "tests/safety-server.ts"],
    {
      env: { ...process.env, NODE_ENV: "development" },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let browser,
    output = "";
  server.stdout.on("data", (x) => (output += x));
  server.stderr.on("data", (x) => (output += x));
  const base = "http://127.0.0.1:3102";
  try {
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch(base + "/api/health")).ok) break;
      } catch {}
      if (i === 49) throw Error(output);
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch({
      headless: true,
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    });
    const ctx = await browser.newContext(),
      other = await browser.newContext(),
      admin = await browser.newContext();
    async function register(c, name) {
      const r = await c.request.post(base + "/api/auth/register", {
        headers: { "X-Shelves-Request": "1" },
        data: {
          username: name,
          displayName: name,
          email: name + "@example.test",
          password: "test-password-long",
        },
      });
      assert.equal(r.status(), 201);
      return (await r.json()).user;
    }
    const a = await register(ctx, "reporting_reader"),
      b = await register(other, "reported_reader");
    const post = await (
      await other.request.post(base + "/api/posts", {
        headers: { "X-Shelves-Request": "1" },
        data: {
          body: "A public story for moderation testing",
          kind: "thought",
        },
      })
    ).json();
    const page = await ctx.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // Exercise paging and comment ownership in the isolated social fixture.
    for (let i = 0; i < 24; i++) {
      const r = await other.request.post(base + "/api/posts", {
        headers: { "X-Shelves-Request": "1" },
        data: { body: "Paging story " + i, kind: "thought" },
      });
      assert.equal(r.status(), 201);
    }
    const note = await ctx.request.post(
      base + "/api/posts/" + post.id + "/comments",
      {
        headers: { "X-Shelves-Request": "1" },
        data: { body: "My editable note" },
      },
    );
    assert.equal(note.status(), 201);
    await page.goto(base + "/#home");
    await page
      .getByRole("button", { name: "Load older posts", exact: true })
      .click();
    const older = page
      .locator(".post-card")
      .filter({ hasText: "A public story for moderation testing" });
    await older.waitFor();
    assert.equal(await page.locator(".post-card").count(), 25);
    await older.getByRole("button", { name: /appreciations/ }).click();
    await older.locator(".like-btn[aria-pressed=true]").waitFor();
    assert.equal(await page.locator(".post-card").count(), 25);
    await older
      .getByRole("button", { name: "Edit comment", exact: true })
      .click();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await auditLayout(page, "edit comment " + width);
      await page.screenshot({
        path: "test-results/comment-edit-" + width + ".png",
      });
    }
    await page.getByLabel("Your comment").fill("My revised note");
    await page
      .getByRole("button", { name: "Save comment", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await older.getByText("My revised note", { exact: true }).waitFor();
    await page
      .getByRole("status")
      .filter({ hasText: "Loading posts" })
      .waitFor({ state: "hidden" });
    assert.equal(await page.locator(".post-card").count(), 25);
    await older
      .getByRole("button", { name: "Delete comment", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel" })
      .click();
    await older.getByText("My revised note", { exact: true }).waitFor();
    await older
      .getByRole("button", { name: "Delete comment", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete comment", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await older
      .getByText("My revised note", { exact: true })
      .waitFor({ state: "hidden" });
    await page.goto(base + "/#reader/" + b.id);
    await page
      .getByRole("button", { name: "Load older posts", exact: true })
      .click();
    await older.waitFor();
    assert.equal(await page.locator(".post-card").count(), 25);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(base + "/#reader/" + b.id);
    await page
      .getByRole("button", { name: "Mute reader", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Unmute reader", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Unmute reader", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Mute reader", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Block reader", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel" })
      .click();
    await page
      .getByRole("button", { name: "Block reader", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Block reader", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Unblock reader", exact: true })
      .waitFor();
    await page.goto(base + "/#safety");
    await page.getByRole("button", { name: "Unblock", exact: true }).waitFor();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await auditLayout(page, "safety " + width);
      await page.screenshot({
        path: "test-results/safety-" + width + ".png",
        fullPage: true,
      });
    }
    await page.getByRole("button", { name: "Unblock", exact: true }).click();
    await page
      .getByText("No muted or blocked readers.", { exact: false })
      .waitFor();
    await page.goto(base + "/#post/" + post.id);
    await page
      .getByRole("button", { name: "Report post", exact: true })
      .click();
    await page.getByLabel("Reason", { exact: true }).selectOption("Harassment");
    await page
      .getByLabel("Additional details (optional)")
      .fill("Review this test content.");
    await auditLayout(page, "report dialog 320");
    await page
      .getByRole("button", { name: "Send report", exact: true })
      .click();
    await page.getByText("Your report was sent", { exact: false }).waitFor();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    assert.equal(
      (await ctx.request.get(base + "/api/admin/reports")).status(),
      403,
    );
    const login = await admin.request.post(base + "/api/auth/login", {
      headers: { "X-Shelves-Request": "1" },
      data: { email: "admin@example.test", password: "test-password-long" },
    });
    assert.equal(login.status(), 200);
    const ap = await admin.newPage();
    ap.on("pageerror", (e) => errors.push(e.message));
    await ap.goto(base + "/#moderation");
    await ap
      .getByRole("button", { name: "Remove post", exact: true })
      .waitFor();
    for (const width of [1440, 390, 320]) {
      await ap.setViewportSize({ width, height: 900 });
      await auditLayout(ap, "admin reports " + width);
      await ap.screenshot({
        path: "test-results/moderation-" + width + ".png",
        fullPage: true,
      });
    }
    await ap.getByRole("button", { name: "Remove post", exact: true }).click();
    await auditLayout(ap, "remove confirmation 320");
    await ap
      .getByRole("dialog")
      .getByRole("button", { name: "Remove content", exact: true })
      .click();
    await ap.getByText("No open reports.", { exact: true }).waitFor();
    assert.equal(
      (await ctx.request.get(base + "/api/posts/" + post.id)).status(),
      404,
    );
    await ap.getByLabel("Report status").selectOption("removed");
    await ap.getByText("Review this test content.", { exact: true }).waitFor();

    const collection = await (
      await other.request.post(base + "/api/lists", {
        headers: { "X-Shelves-Request": "1" },
        data: {
          title: "Reportable collection",
          description: "A test list",
          visibility: "public",
          bookIds: [],
        },
      })
    ).json();
    const commentId = require("node:crypto").randomUUID();
    await other.request.post(
      base + "/api/lists/" + collection.id + "/comments",
      {
        headers: { "X-Shelves-Request": "1" },
        data: { id: commentId, body: "Discussion content for review" },
      },
    );
    await page.goto(base + "/#list/" + collection.id);
    await page
      .getByRole("button", { name: "Report list comment", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Send report", exact: true })
      .click();
    await page.getByText("Your report was sent", { exact: false }).waitFor();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await ap.goto(base + "/#moderation");
    await ap.reload();
    await ap.getByLabel("Report status").selectOption("open");
    await ap
      .getByRole("button", { name: "Remove list comment", exact: true })
      .click();
    await ap
      .getByRole("dialog")
      .getByRole("button", { name: "Remove content", exact: true })
      .click();
    await ap.getByText("No open reports.", { exact: true }).waitFor();
    await ap
      .getByRole("link", { name: "Account moderation", exact: true })
      .click();
    await ap.getByLabel("Find a username").fill("reported_reader");
    await ap
      .getByRole("button", { name: "Review account", exact: true })
      .waitFor();
    for (const width of [1440, 390, 320]) {
      await ap.setViewportSize({ width, height: 900 });
      await auditLayout(ap, "account moderation " + width);
      await ap.screenshot({
        path: "test-results/account-moderation-" + width + ".png",
        fullPage: true,
      });
    }
    await ap
      .getByRole("button", { name: "Review account", exact: true })
      .click();
    await ap
      .getByText("No previous account actions.", { exact: true })
      .waitFor();
    await ap
      .getByLabel("Reason for this action")
      .fill("Repeated disruptive behavior in test content");
    await auditLayout(ap, "suspension dialog 320");
    await ap
      .getByRole("button", { name: "Suspend account", exact: true })
      .click();
    await ap.getByRole("dialog").waitFor({ state: "hidden" });
    await ap
      .getByText("@reported_reader · Suspended", { exact: true })
      .waitFor();
    assert.equal(
      (
        await other.request.post(base + "/api/posts", {
          headers: { "X-Shelves-Request": "1" },
          data: { body: "Blocked by suspension", kind: "thought" },
        })
      ).status(),
      401,
    );
    await ap
      .getByRole("button", { name: "Review account", exact: true })
      .click();
    await ap.getByText("Suspended", { exact: true }).waitFor();
    await ap
      .getByLabel("Reason for this action")
      .fill("Account review complete; access restored");
    await ap
      .getByRole("button", { name: "Restore account", exact: true })
      .click();
    await ap.getByRole("dialog").waitFor({ state: "hidden" });
    await ap.getByText("@reported_reader · Active", { exact: true }).waitFor();
    await ap
      .getByRole("button", { name: "Review account", exact: true })
      .click();
    await ap.getByText("Restored", { exact: true }).waitFor();
    await ap.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        passed: true,
        checks: [
          "feed and profile pagination, retained after likes and edits",
          "own comment editing, cancellation and deletion",
          "mute/unmute",
          "block/cancel/unblock",
          "report submission",
          "admin-only queue",
          "confirmed removal",
          "list comment reports",
          "account suspension, restoration and action history",
          "desktop/mobile layout",
        ],
        runtimeErrors: errors,
      }),
    );
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
