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
    await page.goto(base + "/#home");
    await page
      .getByRole("heading", { name: "What are you reading?", exact: true })
      .waitFor();
    assert.equal(await page.locator(".welcome-card").count(), 0);
    await page
      .locator(".reading-start")
      .getByRole("link", { name: "Find a book", exact: true })
      .click();
    await page.locator(".discover-page").waitFor();
    assert.equal(
      (
        await context.request.put(base + "/api/library/seed-garden", {
          headers: { "X-Shelves-Request": "1" },
          data: {
            status: "Currently reading",
            page: 24,
            rating: 0,
            review: "",
            shelfIds: [],
          },
        })
      ).status(),
      200,
    );
    for (const width of [1477, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(base + "/#home");
      await page.reload();
      await page.locator(".current-reading-book").waitFor();
      const first = await page
        .locator(".feed-column > :first-child")
        .getAttribute("class");
      assert(first.includes("current-reading"));
      await auditLayout(page, "signed-in home " + width);
      await page.screenshot({
        path: `test-results/signed-home-${width}.png`,
        fullPage: true,
      });
    }
    let fail = true;
    await page.route("**/api/library/seed-garden/progress", async (route) => {
      if (fail) {
        fail = false;
        await route.fulfill({
          status: 503,
          json: { error: "Progress temporarily unavailable." },
        });
      } else await route.continue();
    });
    await page
      .getByRole("button", { name: "Update progress", exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("Share this update on my wall", { exact: true })
        .isChecked(),
      false,
    );
    await page.getByLabel("Current page", { exact: true }).fill("42");
    await page
      .getByRole("button", { name: "Save progress", exact: true })
      .click();
    await page
      .getByText("Progress temporarily unavailable.", { exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Current page", { exact: true }).inputValue(),
      "42",
    );
    await page
      .getByRole("button", { name: "Save progress", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByText("Page 42 of 288", { exact: true }).waitFor();
    await page.reload();
    await page.getByText("Page 42 of 288", { exact: true }).waitFor();
    const guest = await browser.newPage();
    await guest.goto(base + "/#home");
    await guest.locator(".welcome-card").waitFor();
    assert.equal(await guest.locator(".current-reading").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      "Signed-in home passed: guest separation, empty-state action, reading-first order, mobile layouts and private progress retry/reload.",
    );
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
