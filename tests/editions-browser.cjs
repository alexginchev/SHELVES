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
      env: { ...process.env, NODE_ENV: "development", EDITION_FIXTURE: "1" },
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
            email: "admin@example.test",
            password: "test-password-long",
          },
        })
      ).status(),
      200,
    );

    assert.equal(
      (
        await context.request.put(base + "/api/library/gb_edition_0", {
          headers: { "X-Shelves-Request": "1" },
          data: {
            status: "Currently reading",
            page: 42,
            rating: 4,
            review: "Keep my original notes",
            shelfIds: [],
          },
        })
      ).status(),
      200,
    );
    let failEditions = true;
    await page.route("**/api/books/*/editions?*", async (route) => {
      if (failEditions) {
        failEditions = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Edition list unavailable." }),
        });
      } else await route.continue();
    });
    await page.goto(base + "/#book/gb_edition_0");
    await page
      .getByRole("alert")
      .filter({ hasText: "Edition list unavailable." })
      .waitFor();
    await page
      .getByRole("button", { name: "Retry editions", exact: true })
      .click();

    await page.locator(".edition-card").nth(11).waitFor();
    assert.equal(await page.locator(".edition-card-heading").count(), 12);
    let failImport = true;
    await page.route("**/api/books/search?*", async (route) => {
      if (failImport) {
        failImport = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Google lookup unavailable." }),
        });
      } else await route.continue();
    });
    await page
      .getByRole("button", { name: "Find more editions", exact: true })
      .click();
    await page
      .getByText("Google lookup unavailable.", { exact: true })
      .waitFor();
    assert.equal(await page.locator(".edition-card").count(), 12);
    assert.equal(
      await page
        .getByRole("button", { name: "Retry editions", exact: true })
        .count(),
      0,
    );
    await page
      .getByRole("button", { name: "Find more editions", exact: true })
      .click();
    await page
      .getByText("Google Books checked. Matching editions are listed below.", {
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("button", { name: "Next editions", exact: true })
      .click();
    await page
      .getByText("14 matching editions · Page 2 of 2", { exact: true })
      .waitFor();
    await page
      .getByLabel("Edition language", { exact: true })
      .selectOption("bg");
    await page
      .getByText("1 matching edition · Page 1 of 1", { exact: true })
      .waitFor();
    assert(page.url().includes("language=bg"));
    await page.reload();
    await page
      .getByText("1 matching edition · Page 1 of 1", { exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Edition language", { exact: true }).inputValue(),
      "bg",
    );
    mkdirSync("test-results", { recursive: true });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await auditLayout(page, "book editions " + width);
      await page.screenshot({
        path: "test-results/editions-" + width + ".png",
        fullPage: true,
      });
    }
    await page
      .getByRole("link", { name: "Choose this edition", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add to my library", exact: false })
      .click();
    assert(page.url().includes("language=bg"));
    await page.getByLabel("Reading status").selectOption("Currently reading");
    await page.getByLabel("Page reached").fill("10");
    await page
      .getByRole("button", {
        name: /Save reading update|Add to my shelves|Save to my shelves|Add to library/,
      })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    const library = (
      await (await context.request.get(base + "/api/library")).json()
    ).items;
    assert.equal(
      library.find((r) => r.book.id === "gb_edition_0").review,
      "Keep my original notes",
    );
    assert.equal(library.find((r) => r.book.id === "gb_edition_0").page, 42);
    assert.equal(library.find((r) => r.book.id === "gb_edition_13").page, 10);
    await page
      .getByLabel("Edition language", { exact: true })
      .selectOption("fr");
    await page
      .getByText(
        "No matching editions in this language yet. Try another language or find more editions.",
        { exact: true },
      )
      .waitFor();
    await page
      .getByRole("button", { name: "Find more editions", exact: true })
      .click();
    await page
      .getByText("Google Books checked. Matching editions are listed below.", {
        exact: true,
      })
      .waitFor();
    await page.goto(base + "/#catalog?language=bg");
    await page.locator(".catalog-page .book-tile").waitFor();
    assert.equal(await page.locator(".catalog-page .book-tile").count(), 1);
    await page.reload();
    assert.equal(
      await page.getByLabel("Catalogue language", { exact: true }).inputValue(),
      "bg",
    );
    await page.goto(base + "/#author?name=Edition%20Writer&language=bg");
    await page.locator(".catalog-page .book-tile").waitFor();
    assert.equal(await page.locator(".catalog-page .book-tile").count(), 1);
    await page
      .getByRole("button", {
        name: "Find more books",
        exact: true,
      })
      .click();
    await page.getByText(/Google Books results checked/).waitFor();
    await page.goto(base + "/#discover");
    await page
      .getByLabel("Search language", { exact: true })
      .selectOption("bg");
    failImport = true;
    await page
      .getByRole("searchbox", { name: "Book title or author", exact: true })
      .fill("Edition story");
    await page
      .getByText("Google lookup unavailable.", { exact: true })
      .waitFor();
    const retryButton = page.getByRole("button", {
      name: "Retry search",
      exact: true,
    });
    await retryButton.focus();
    await page.keyboard.press("Enter");
    await page.waitForResponse(
      (r) =>
        r.url().includes("/api/books/search?") &&
        r.url().includes("language=bg"),
    );
    await page.getByText("1 results · Google Books", { exact: true }).waitFor();
    assert.equal(await page.locator(".view-panel .book-tile").count(), 1);
    await auditLayout(page, "language search mobile");
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        passed: true,
        checks: [
          "edition groups and paging",
          "language URL and reload",
          "desktop/mobile layouts",
          "choose and save distinct edition preserving original notes",
          "no matching language",
          "Google edition import",
          "catalogue and author filters",
          "live search language",
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
