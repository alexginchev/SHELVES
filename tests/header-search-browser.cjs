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
    const page = await browser.newPage({
        viewport: { width: 1477, height: 1244 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let searches = 0,
      fail = false,
      release;
    let gate = null;
    await page.route("**/api/books/search?*", async (route) => {
      searches++;
      const url = new URL(route.request().url()),
        term = url.searchParams.get("q");
      if (term === "slow") {
        gate = new Promise((r) => (release = r));
        await gate;
      }
      if (fail) {
        fail = false;
        return route.abort();
      }
      const items =
        term === "missing"
          ? []
          : Array.from(
              { length: url.searchParams.get("startIndex") === "10" ? 1 : 10 },
              (_, i) => ({
                id: i === 0 ? "seed-garden" : "result-" + i,
                title:
                  i === 0
                    ? "The Secret Garden"
                    : `A book with a long title ${i}`,
                author: "Frances Hodgson Burnett",
                genre: "Classic",
                pages: 288,
                description: "A garden.",
                cover: "/covers/garden.jpg",
                color: "sage",
                year: 1911,
              }),
            );
      await route.fulfill({
        json: { items, source: "Google Books", warning: null },
      });
    });
    await page.goto(base + "/#home");
    await page.locator(".book-tile").first().waitFor();
    const input = page.getByRole("combobox", {
      name: "Search books and authors",
    });
    await input.fill("slow");
    await page.getByText("Finding books…", { exact: true }).waitFor();
    await page.locator(".quick-search-panel .brand-loading img").waitFor();
    assert.equal(new URL(page.url()).hash, "#home");
    await page.screenshot({ path: "test-results/header-search-loading.png" });
    await input.fill("garden");
    await page.locator(".quick-search-result").first().waitFor();
    if (release) release();
    for (const width of [1477, 390, 320]) {
      await page.setViewportSize({
        width,
        height: width === 1477 ? 1244 : 900,
      });
      await input.focus();
      await page.locator(".quick-search-result").first().waitFor();
      await auditLayout(page, "inline search " + width);
      await page.screenshot({
        path: `test-results/header-search-${width}.png`,
      });
    }
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Page 2", { exact: true }).waitFor();
    assert.equal(await page.locator(".quick-search-result").count(), 1);
    await page
      .getByRole("button", { name: "Close search", exact: true })
      .click();
    assert.equal(await page.locator(".quick-search-panel").count(), 0);
    await input.fill("missing");
    await page
      .getByText("No books found. Try another title or author.", {
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("button", { name: "Clear book search", exact: true })
      .click();
    assert.equal(await input.inputValue(), "");
    const before = searches;
    await input.dispatchEvent("compositionstart");
    await input.fill("composing");
    await page.waitForTimeout(450);
    assert.equal(searches, before);
    await input.dispatchEvent("compositionend");
    await page.locator(".quick-search-result").first().waitFor();
    fail = true;
    await input.fill("failure");
    await page
      .getByRole("button", { name: "Retry search", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Retry search", exact: true })
      .click();
    await page.locator(".quick-search-result").first().waitFor();
    await input.focus();
    await page.keyboard.press("ArrowDown");
    assert(
      await page
        .locator(".quick-search-result")
        .first()
        .evaluate((e) => e === document.activeElement),
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".quick-search-panel").count(), 0);
    assert(await input.evaluate((e) => e === document.activeElement));
    await input.fill("garden");
    await page.locator(".quick-search-result").first().waitFor();
    await input.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page
      .locator(".book-page h2")
      .getByText("The Secret Garden", { exact: true })
      .waitFor();
    assert.equal(new URL(page.url()).hash, "#book/seed-garden");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(base + "/#home");
    await page.locator(".mobile-brand img").waitFor();
    assert.equal(
      await page.locator(".mobile-brand img").getAttribute("src"),
      "/branding/shelves.svg",
    );
    assert.deepEqual(errors, []);
    console.log(
      "Inline search passed: no navigation while typing, loading, cancellation, pagination, empty/retry, IME, keyboard selection, supplied SVG and responsive layouts.",
    );
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
