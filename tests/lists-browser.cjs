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
      env: { ...process.env, LISTS_FIXTURE: "1" },
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
    const login = await page.request.post(base + "/api/auth/login", {
      headers: { "X-Shelves-Request": "1" },
      data: {
        email: "list-owner@example.test",
        password: "test-password-long",
      },
    });
    assert.equal(login.status(), 200);
    await page.goto(base + "/#lists");
    await page
      .getByRole("link", { name: "Collection 124", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Show my lists", exact: true })
      .click();
    await page.getByText("Page 1 of 2", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await page.getByText("Page 2 of 2", { exact: true }).waitFor();
    assert.equal(await page.locator(".list-summary").count(), 5);
    await page.reload();
    await page.getByText("Page 2 of 2", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Create a list", exact: true })
      .click();
    const search = page.getByLabel("Find a book in the catalogue", {
      exact: true,
    });
    await page
      .getByLabel("List title", { exact: true })
      .fill("A complete catalogue collection");
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Discard changes?", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("List title", { exact: true }).inputValue(),
      "A complete catalogue collection",
    );
    await search.fill("Catalogue story 124");
    await page
      .getByRole("button", { name: "Add Catalogue story 124", exact: true })
      .click();
    await search.fill("not a matching title");
    await page.getByText(/No matching books/).waitFor();
    await page
      .getByRole("button", { name: "Clear book search", exact: true })
      .click();
    assert.equal(await search.inputValue(), "");
    await page
      .getByRole("button", { name: "Add Catalogue story 000", exact: true })
      .waitFor();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await auditLayout(page, "list picker " + width);
      await page.screenshot({ path: `test-results/list-picker-${width}.png` });
    }
    await page.getByRole("button", { name: "Save list", exact: true }).click();
    await page
      .getByRole("heading", {
        name: "A complete catalogue collection",
        exact: true,
      })
      .waitFor();
    await page.goto(base + "/#book/seed-garden");
    await page
      .getByRole("button", { name: "Add to list", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    const row = dialog
      .locator(".list-picker > div")
      .filter({ hasText: "A complete catalogue collection" });
    await row.waitFor();
    await auditLayout(page, "add to list 320");
    await page.route(
      "**/api/lists/*/books",
      (route) =>
        route.fulfill({
          status: 503,
          json: { error: "Please retry this save." },
        }),
      { times: 1 },
    );
    await row.getByRole("button", { name: "Add to list", exact: true }).click();
    await page.getByText("Please retry this save.", { exact: true }).waitFor();
    await row.getByRole("button", { name: "Add to list", exact: true }).click();
    await page
      .getByText("Saved to A complete catalogue collection.", { exact: true })
      .waitFor();
    await page.getByRole("link", { name: "Open list", exact: true }).click();
    await page
      .getByRole("link", { name: "Open The Secret Garden", exact: true })
      .waitFor();
    assert.equal(await page.locator(".list-page .book-tile").count(), 2);
    await page.goto(base + "/#post/history-post");
    await page.getByText("History note 124", { exact: true }).waitFor();
    assert.equal(
      await page.getByText("Hidden note", { exact: true }).count(),
      0,
    );
    await page.route(
      "**/api/posts/history-post/comments?*",
      (route) =>
        route.fulfill({
          status: 503,
          json: { error: "Notes temporarily unavailable." },
        }),
      { times: 1 },
    );
    await page
      .getByRole("button", { name: "Load older notes", exact: true })
      .click();
    await page
      .getByText("Notes temporarily unavailable.", { exact: true })
      .waitFor();
    await page
      .locator(".post-card")
      .getByRole("button", { name: "Try again", exact: true })
      .click();
    await page.getByText("History note 085", { exact: true }).waitFor();
    for (let i = 0; i < 5; i++) {
      await page
        .getByRole("button", { name: "Load older notes", exact: true })
        .click();
      await page
        .getByText(
          `History note ${String(Math.max(0, 65 - i * 20)).padStart(3, "0")}`,
          { exact: true },
        )
        .waitFor();
    }
    assert.equal(await page.locator(".comment-line").count(), 125);
    assert.equal(
      await page
        .getByRole("button", { name: "Load older notes", exact: true })
        .count(),
      0,
    );
    await auditLayout(page, "full note history 320");
    assert.deepEqual(errors, []);
    console.log(
      "Lists browser checks passed: pagination, reload, full catalogue, responsive editor, atomic add retry, complete note history.",
    );
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
