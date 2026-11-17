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
    { windowsHide: true, stdio: "pipe" },
  );
  let browser,
    output = "";
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
    const context = await browser.newContext();
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    assert.equal(
      (
        await context.request.post(base + "/api/auth/login", {
          headers: { "X-Shelves-Request": "1" },
          data: { email: "admin@example.test", password: "test-password-long" },
        })
      ).status(),
      200,
    );
    assert.equal(
      (
        await context.request.put(base + "/api/library/seed-garden", {
          headers: { "X-Shelves-Request": "1" },
          data: {
            status: "Finished",
            page: 288,
            rating: 5,
            review: "",
            shelfIds: [],
          },
        })
      ).status(),
      200,
    );
    for (const width of [1477, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(base + "/#shelves");
      await page.locator(".library-page .book-tile").waitFor();
      assert(
        (await page.locator(".library-page .book-tile").boundingBox()).width <
          260,
      );
      assert.equal(await page.locator(".right-rail").isVisible(), false);
      await auditLayout(page, "library collection " + width);
      await page.screenshot({
        path: `test-results/collection-library-${width}.png`,
        fullPage: true,
      });
      await page
        .getByLabel("Search my library", { exact: true })
        .fill("missing");
      await page
        .getByText("No books match this search. Try another title or author.")
        .waitFor();
      await page.getByRole("button", { name: "Clear library search" }).click();
      await page.locator(".library-page .book-tile").waitFor();
      await page.goto(base + "/#author?name=Frances%20Hodgson%20Burnett");
      await page.locator(".author-catalog .book-tile").waitFor();
      assert.equal(
        await page.getByLabel("Catalogue sort", { exact: true }).isVisible(),
        false,
      );
      await auditLayout(page, "author collection " + width);
      await page.screenshot({
        path: `test-results/collection-author-${width}.png`,
        fullPage: true,
      });
      await page.locator(".catalog-filters summary").focus();
      await page.keyboard.press("Enter");
      await page
        .getByLabel("Catalogue sort", { exact: true })
        .selectOption("newest");
      await page.getByLabel("Published from", { exact: true }).fill("2020");
      await page
        .getByRole("button", { name: "Apply filters", exact: true })
        .click();
      await page.getByText(/No books match these filters/).waitFor();
      assert(new URL(page.url()).hash.includes("from=2020"));
      await page.reload();
      await page.getByText(/No books match these filters/).waitFor();
      await page.locator(".catalog-filters summary").click();
      await auditLayout(page, "author expanded filters " + width);
      await page
        .getByRole("button", { name: "Clear filters", exact: true })
        .click();
      await page.locator(".author-catalog .book-tile").waitFor();
    }
    let fail = true;
    await page.route("**/api/books/catalog?*", async (route) => {
      if (fail) {
        fail = false;
        await route.fulfill({
          status: 503,
          json: { error: "Catalogue unavailable." },
        });
      } else await route.continue();
    });
    await page.reload();
    await page.getByRole("alert").getByText("Catalogue unavailable.").waitFor();
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.locator(".author-catalog .book-tile").waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "Collection pages passed: bounded single-book cards, desktop/mobile layouts, disclosure keyboard, filters/sort, URL reload, empty states and error retry.",
    );
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
