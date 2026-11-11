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
    { windowsHide: true, stdio: "ignore" },
  );
  const base = "http://127.0.0.1:3102";
  let browser;
  try {
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch(base + "/api/health")).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch({
      headless: true,
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    });
    const first = await browser.newContext(),
      second = await browser.newContext(),
      page = await first.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const headers = { "X-Shelves-Request": "1" };
    assert.equal(
      (
        await first.request.post(base + "/api/auth/login", {
          headers,
          data: { email: "admin@example.test", password: "test-password-long" },
        })
      ).ok(),
      true,
    );
    const registration = await second.request.post(
      base + "/api/auth/register",
      {
        headers,
        data: {
          email: "match-browser@example.test",
          username: "match_browser",
          displayName: "Matching reader",
          password: "test-password-long",
        },
      },
    );
    assert.equal(registration.ok(), true);
    const other = (await registration.json()).user.id;
    await page.goto(base + "/#home");
    await page
      .locator(".feed-filters")
      .getByRole("button", { name: "Following", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Build your reading circle.", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Find readers", exact: false })
      .click();
    await page.locator(".reader-directory").waitFor();
    assert.equal(
      (
        await first.request.put(base + "/api/readers/" + other + "/follow", {
          headers,
        })
      ).ok(),
      true,
    );
    await page.goto(base + "/#home");
    await page.reload();
    await page
      .locator(".feed-filters")
      .getByRole("button", { name: "Following", exact: true })
      .click();
    await page
      .getByRole("heading", {
        name: "Your reading circle is quiet.",
        exact: true,
      })
      .waitFor();
    const books = await (await first.request.get(base + "/api/books")).json();
    const book = books.items[0].id;
    for (const context of [first, second])
      assert.equal(
        (
          await context.request.put(base + "/api/books/" + book + "/review", {
            headers,
            data: {
              body: "A memorable shared favorite.",
              rating: 5,
              containsSpoilers: false,
            },
          })
        ).ok(),
        true,
      );
    await page.reload();
    await page
      .locator(".people-card")
      .getByText("You both rated 1 book highly in public reviews", {
        exact: true,
      })
      .waitFor();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await auditLayout(page, "reader matches " + width);
      await page.screenshot({
        path: "test-results/reader-matches-" + width + ".png",
        fullPage: true,
      });
    }
    const followedFeed = await (
      await first.request.get(base + "/api/feed?filter=following")
    ).json();
    assert(followedFeed.items.some((p) => p.userId === other));
    await page.goto(base + "/#community");
    await page
      .getByRole("link", { name: "Readers you follow", exact: true })
      .waitFor();
    await auditLayout(page, "community matches mobile");
    await page
      .getByRole("link", { name: "Readers you follow", exact: true })
      .click();
    await page.locator(".reader-directory .reader-link").waitFor();
    assert.equal(
      await page.locator(".reader-directory .reader-link").count(),
      1,
    );
    assert.equal(
      (
        await first.request.put(
          base + "/api/readers/" + other + "/controls/mute",
          { headers },
        )
      ).ok(),
      true,
    );
    const muted = await (await first.request.get(base + "/api/readers")).json();
    assert(!muted.items.some((r) => r.id === other));
    assert.equal(
      (
        await first.request.delete(
          base + "/api/readers/" + other + "/controls/mute",
          { headers },
        )
      ).ok(),
      true,
    );
    assert.equal(
      (
        await second.request.put(
          base + "/api/readers/browser-admin/controls/block",
          { headers },
        )
      ).ok(),
      true,
    );
    assert(
      !(
        await (await first.request.get(base + "/api/readers")).json()
      ).items.some((r) => r.id === other),
    );
    const feed = await (
      await first.request.get(base + "/api/feed?filter=following")
    ).json();
    assert(!feed.items.some((p) => p.userId === other));
    assert.deepEqual(errors, []);
    console.log(
      "Reader matches: empty and quiet Following states, directory navigation, public-review match, follow/mute/reverse block and three responsive layouts passed.",
    );
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
