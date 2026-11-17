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
      env: { ...process.env, REVIEWS_FIXTURE: "1", NODE_ENV: "development" },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "",
    browser;
  server.stdout.on("data", (x) => (output += x));
  server.stderr.on("data", (x) => (output += x));
  const base = "http://127.0.0.1:3102";
  try {
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(base + "/api/health")).ok) break;
      } catch {}
      if (i === 79) throw Error(output);
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
    const book = (await (await context.request.get(base + "/api/books")).json())
      .items[0].id;
    assert.equal(
      (
        await context.request.post(base + "/api/auth/login", {
          headers: { "X-Shelves-Request": "1" },
          data: {
            email: "reviewer-000@example.test",
            password: "test-password-long",
          },
        })
      ).status(),
      200,
    );
    let failFirst = true,
      failMore = true;
    await page.route("**/api/books/*/reviews?*", async (route) => {
      const before = new URL(route.request().url()).searchParams.has("before");
      if (failFirst || (before && failMore)) {
        if (failFirst) failFirst = false;
        else failMore = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Reviews temporarily unavailable." }),
        });
      } else await route.continue();
    });
    await page.goto(`${base}/#book/${book}?language=en`);
    const panel = page.getByRole("region", { name: "Public book reviews" });
    await panel.getByRole("alert").waitFor();
    await panel.getByRole("button", { name: "Try again" }).click();
    await panel.getByText("20 reviews loaded", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Edit my public review" }).click();
    assert.equal(
      await page
        .getByRole("textbox", { name: "Public review", exact: true })
        .inputValue(),
      "Book review 0",
    );
    await page.keyboard.press("Escape");
    await panel.getByRole("button", { name: "Load more reviews" }).click();
    await panel.getByRole("alert").waitFor();
    assert.equal(await panel.locator(".post-card").count(), 20);
    await panel.getByRole("button", { name: "Try again" }).click();
    await panel.getByText("40 reviews loaded", { exact: true }).waitFor();
    await panel
      .locator(".post-card")
      .first()
      .getByRole("button", { name: /appreciations/ })
      .click();
    await panel
      .locator(".post-card")
      .first()
      .getByRole("button", { name: "1 appreciations" })
      .waitFor();
    await panel
      .locator(".post-card")
      .first()
      .getByRole("button", { name: "1 appreciations" })
      .click();
    await panel
      .locator(".post-card")
      .first()
      .getByRole("button", { name: "0 appreciations" })
      .waitFor();
    await panel.getByText("40 reviews loaded", { exact: true }).waitFor();
    await panel.getByRole("button", { name: "Refresh reviews" }).click();
    await panel.getByRole("button", { name: "Load more reviews" }).waitFor();
    await panel.getByText("40 reviews loaded", { exact: true }).waitFor();
    await panel.getByRole("button", { name: "Load more reviews" }).click();
    await panel.getByText("60 reviews loaded", { exact: true }).waitFor();
    await panel.getByRole("button", { name: "Load more reviews" }).click();
    await panel.getByText("65 reviews loaded", { exact: true }).waitFor();
    await panel.getByLabel("Review order").selectOption("appreciated");
    await panel.getByText("20 reviews loaded", { exact: true }).waitFor();
    assert.match(
      await panel.locator(".post-card").first().innerText(),
      /Book review 4/,
    );
    assert.match(page.url(), /language=en/);
    await page.reload();
    await panel.getByText("20 reviews loaded", { exact: true }).waitFor();
    assert.equal(
      await panel.getByLabel("Review order").inputValue(),
      "appreciated",
    );
    await panel.getByLabel("Review readers").selectOption("following");
    await panel.getByText("Book review 2", { exact: true }).waitFor();
    assert.match(page.url(), /reviewFilter=following/);
    await panel.getByRole("button", { name: "Load more reviews" }).click();
    await panel.getByText("32 reviews loaded", { exact: true }).waitFor();
    mkdirSync("test-results", { recursive: true });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await panel.getByLabel("Review order").scrollIntoViewIfNeeded();
      await panel.getByLabel("Review order").focus();
      await page.keyboard.press("Alt+ArrowDown");
      await page.keyboard.press("Escape");
      await auditLayout(page, "book reviews " + width);
      await page.screenshot({ path: `test-results/reviews-${width}.png` });
    }
    // A guest using a bookmarked Following filter gets an explicit sign-in path.
    await context.clearCookies();
    await page.reload();
    await panel
      .getByText("Sign in to see reviews from readers you follow.", {
        exact: true,
      })
      .waitFor();
    await panel.getByLabel("Review readers").selectOption("all");
    await panel.getByText("20 reviews loaded", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "Review browser checks passed: 65 reviews, retries, preserved depth, own review, ranking, Following, URL/reload, keyboard and 3 viewports.",
    );
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
