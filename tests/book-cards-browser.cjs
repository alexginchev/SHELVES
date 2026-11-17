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
      env: { ...process.env, BOOK_SPEED_FIXTURE: "1" },
      windowsHide: true,
      stdio: "pipe",
    },
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
    const page = await browser.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const saved = await (
      await fetch(base + "/api/books/gb_speed?cached=1")
    ).json();
    let release;
    const providerGate = new Promise((resolve) => (release = resolve));
    await page.route("**/api/books/gb_speed", async (route) => {
      await providerGate;
      await route.fulfill({
        json: {
          ...saved,
          book: { ...saved.book, description: "Recovered description." },
        },
      });
    });
    await page.goto(base + "/#author?name=Fixture%20Author");
    const tile = page.locator(".catalog-page .book-tile").first();
    await tile.waitFor();
    assert.equal(
      await page.getByRole("button", { name: /View book/ }).count(),
      0,
    );
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await tile.scrollIntoViewIfNeeded();
      await auditLayout(page, "clickable book card " + width);
      await page.screenshot({ path: `test-results/book-card-${width}.png` });
    }
    await tile.click({ position: { x: 5, y: 5 } });
    await page
      .locator(".book-page h2")
      .getByText("A fast opening book", { exact: true })
      .waitFor();
    assert.equal(
      await page.locator(".book-description").innerText(),
      "No description supplied for this edition.",
    );
    release();
    await page.getByText("Recovered description.", { exact: true }).waitFor();
    await page.goto(base + "/#catalog");
    const link = page.getByRole("link", {
      name: "Open A fast opening book",
      exact: true,
    });
    await link.focus();
    await page.keyboard.press("Enter");
    await page.locator(".book-page").waitFor();
    assert.match(page.url(), /#book\/gb_speed/);
    const login = await page.context().request.post(base + "/api/auth/login", {
      headers: { "X-Shelves-Request": "1" },
      data: { email: "admin@example.test", password: "test-password-long" },
    });
    assert.equal(login.status(), 200);
    await page.goto(base + "/#discover");
    // Hash navigation preserves the mounted app; reload to read the new session.
    await page.reload();
    const dismiss = page
      .getByRole("button", { name: "Not interested", exact: true })
      .first();
    await dismiss.waitFor();
    const before = await page.locator(".feed-column .book-tile").count();
    await dismiss.click();
    await page.waitForFunction(
      (count) =>
        document.querySelectorAll(".feed-column .book-tile").length < count,
      before,
    );
    assert.match(page.url(), /#discover/);
    assert.deepEqual(errors, []);
    console.log(
      "Cards passed: no View book button, padding click, keyboard navigation, three widths, saved details visible before delayed enrichment.",
    );
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
