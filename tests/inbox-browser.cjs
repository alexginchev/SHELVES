const {
  chromium,
} = require("C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const { spawn } = require("node:child_process");
const { mkdirSync } = require("node:fs");
const assert = require("node:assert/strict");
const { auditLayout } = require("./layout.cjs");
(async () => {
  const server = spawn(
    process.execPath,
    ["--import", "tsx", "tests/safety-server.ts"],
    {
      env: { ...process.env, NODE_ENV: "development", INBOX_FIXTURE: "1" },
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
    const context = await browser.newContext(),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    assert.equal(
      (
        await context.request.post(base + "/api/auth/login", {
          headers: { "X-Shelves-Request": "1" },
          data: {
            email: "inbox_owner@example.test",
            password: "test-password-long",
          },
        })
      ).status(),
      200,
    );
    let failFirst = true,
      failOlder = true;
    await page.route("**/api/notifications?*", async (route) => {
      const url = new URL(route.request().url());
      if (failFirst || (url.searchParams.has("before") && failOlder)) {
        if (failFirst) failFirst = false;
        else failOlder = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Activity temporarily unavailable." }),
        });
      } else await route.continue();
    });
    await page.goto(base + "/#notifications");
    await page
      .getByRole("alert")
      .filter({ hasText: "Activity temporarily unavailable." })
      .waitFor();
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.locator(".notification-item").nth(19).waitFor();
    await page
      .getByRole("button", { name: "Load older notifications", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Activity temporarily unavailable." })
      .waitFor();
    assert.equal(
      await page.locator(".notification-item").count(),
      20,
      "failed page keeps existing rows",
    );
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.locator(".notification-item").nth(39).waitFor();
    await page.getByRole("button", { name: "Mark read", exact: true }).click();
    await page
      .getByText("5 unread · 40 notifications loaded", { exact: true })
      .waitFor();
    assert.equal(await page.locator(".notification-item").count(), 40);
    await page.getByRole("button", { name: "Unread", exact: true }).click();
    await page
      .getByText("5 unread · 5 notifications loaded", { exact: true })
      .waitFor();
    mkdirSync("test-results", { recursive: true });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await auditLayout(page, "unread notifications " + width);
      await page.screenshot({
        path: "test-results/inbox-" + width + ".png",
        fullPage: true,
      });
    }
    // A failed write must leave unread rows unchanged and recover on retry.
    await page.route("**/api/notifications/read-all", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Could not mark activity read." }),
      }),
    );
    await page
      .getByRole("button", { name: "Mark all as read", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Could not mark activity read." })
      .waitFor();
    assert.equal(await page.locator(".notification-item").count(), 5);
    await page.unroute("**/api/notifications/read-all");
    await page
      .getByRole("button", { name: "Mark all as read", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "You are all caught up.", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "All activity", exact: true })
      .click();
    await page.locator(".notification-item").nth(19).waitFor();
    for (let n = 40; n <= 120; n += 20) {
      await page
        .getByRole("button", { name: "Load older notifications", exact: true })
        .click();
      await page
        .locator(".notification-item")
        .nth(n - 1)
        .waitFor();
    }
    await page
      .getByRole("button", { name: "Load older notifications", exact: true })
      .click();
    await page
      .getByText("You’ve reached the end of this activity.", { exact: true })
      .waitFor();
    assert.equal(await page.locator(".notification-item").count(), 125);
    assert.equal(
      await page
        .getByRole("button", { name: "Load older notifications", exact: true })
        .count(),
      0,
    );
    await page
      .getByRole("button", { name: "Refresh activity", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Loading notifications" })
      .waitFor({ state: "hidden" });
    assert.equal(await page.locator(".notification-item").count(), 125);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        passed: true,
        checks: [
          "initial error retry",
          "failed older page preserves rows",
          "mark read preserves page depth",
          "unread beyond 100",
          "failed bulk write recovery",
          "all 125 entries reachable",
          "refresh retains loaded pages",
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
