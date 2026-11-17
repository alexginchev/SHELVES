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
    await page.goto(base + "/#home");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const greeting = dialog.locator(".auth-greeting strong");
    assert.equal(await greeting.textContent(), "reader");
    await dialog.getByLabel("Email or username").fill("test_admin");
    assert.equal(await greeting.textContent(), "test_admin");
    await dialog
      .getByRole("button", { name: "New here? Create an account" })
      .click();
    assert.equal(await greeting.textContent(), "reader");
    await dialog.getByLabel("Your name").fill("Sam");
    assert.equal(await greeting.textContent(), "Sam");
    await dialog.getByLabel("Username", { exact: true }).fill("sam_reads");
    assert.equal(await greeting.textContent(), "sam_reads");
    await dialog.getByLabel("Username", { exact: true }).clear();
    await dialog.getByLabel("Your name").clear();
    assert.equal(await greeting.textContent(), "reader");
    await dialog
      .getByRole("button", { name: "Already a reader? Sign in" })
      .click();
    await dialog
      .getByLabel("Password", { exact: true })
      .fill("test-password-long");
    await dialog
      .getByRole("button", { name: "Sign in ↗", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await page.setViewportSize({ width: 651, height: 603 });
    await page.goto(base + "/#shelves");
    const filters = page.getByRole("group", { name: "Reading status" });
    await filters
      .getByRole("button", { name: "Want to read", exact: true })
      .click();
    await page.waitForURL("**/#shelves?shelf=Want%20to%20read");
    await page.reload();
    await filters
      .getByRole("button", { name: "Want to read", pressed: true })
      .waitFor();
    await auditLayout(page, "Library filters at the annotated viewport");
    await page.getByRole("button", { name: "New shelf", exact: true }).click();
    const newShelf = page.getByRole("dialog", { name: "Make a new shelf" });
    await newShelf.getByLabel("Shelf name").fill("Weekend reading");
    await newShelf.getByRole("button", { name: /Create shelf/ }).click();
    await newShelf.waitFor({ state: "hidden" });
    const customShelves = page.getByRole("group", { name: "Custom shelves" });
    await customShelves
      .getByRole("button", { name: "Weekend reading" })
      .click();
    await customShelves
      .getByRole("button", { name: "Weekend reading", pressed: true })
      .waitFor();
    await page.setViewportSize({ width: 320, height: 650 });
    await auditLayout(page, "Library filters on a narrow phone");
    await page.goto(base + "/#home");
    await page.locator(".home-reading-strip > summary").click();
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
    const neighbor = await browser.newContext();
    assert.equal(
      (
        await neighbor.request.post(base + "/api/auth/register", {
          headers: { "X-Shelves-Request": "1" },
          data: {
            email: "mira@example.test",
            username: "mira_reads",
            displayName: "Mira",
            password: "test-password-long",
          },
        })
      ).status(),
      201,
    );
    for (const body of [
      "The Secret Garden feels different on a reread. This time I keep noticing how much of the story is about learning to pay attention.",
      "Which book made you slow down instead of racing to the last page?",
    ]) {
      assert.equal(
        (
          await neighbor.request.post(base + "/api/posts", {
            headers: { "X-Shelves-Request": "1" },
            data: { kind: "thought", body, bookId: "seed-garden" },
          })
        ).status(),
        201,
      );
    }
    for (const width of [1477, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(base + "/#home");
      await page.reload();
      await page.locator(".home-reading-strip > summary").click();
      await page.locator(".current-reading-book").waitFor();
      const first = await page
        .locator(".feed-column > :first-child")
        .getAttribute("class");
      assert(first.includes("home-reading-strip"));
      await auditLayout(page, "signed-in home " + width);
      await page.screenshot({
        path: `test-results/signed-home-${width}.png`,
        fullPage: true,
      });
      await page.locator(".home-reading-strip > summary").click();
      await page.locator(".social-post").first().waitFor();
      await auditLayout(page, "social home " + width);
      await page.screenshot({
        path: `test-results/social-home-${width}.png`,
        fullPage: true,
      });
    }
    await page.getByRole("button", { name: "Latest", exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector(".post-feed-reason"),
    );
    await page.getByRole("button", { name: "For you", exact: true }).click();
    await page.locator(".post-feed-reason").first().waitFor();
    await page.route("**/api/feed?filter=for-you", (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Feed temporarily unavailable." },
      }),
    );
    await page
      .getByRole("button", { name: "Refresh feed", exact: true })
      .click();
    await page
      .getByText("Feed temporarily unavailable.", { exact: true })
      .waitFor();
    assert.equal(await page.locator(".social-post").count(), 2);
    await page.unroute("**/api/feed?filter=for-you");
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page
      .getByText("Feed temporarily unavailable.", { exact: true })
      .waitFor({ state: "hidden" });
    await page.locator(".home-reading-strip > summary").click();
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
    await page.locator(".home-reading-strip > summary").click();
    await page.getByText("Page 42 of 288", { exact: true }).waitFor();

    await page.goto(base + "/#preferences");
    await page.getByRole("checkbox", { name: "Fantasy", exact: true }).check();
    await page.getByRole("button", { name: "Save preferences" }).click();
    await page.getByText(/Your reading preferences are saved/).waitFor();
    await page.goto(base + "/#home");
    const personal = page.frameLocator(
      'iframe[title="Interactive featured book collection"]',
    );
    await personal
      .getByRole("heading", { name: "Piranesi", exact: true })
      .waitFor();
    assert.equal(
      await personal
        .getByRole("button", { name: "Braiding Sweetgrass", exact: true })
        .count(),
      0,
    );
    await page.getByRole("link", { name: "View Piranesi" }).click();
    await page.waitForURL("**/#book/seed-piranesi");

    const guest = await browser.newPage({
      viewport: { width: 651, height: 603 },
      hasTouch: true,
    });
    await guest.goto(base + "/#home");
    const featured = guest.frameLocator(
      'iframe[title="Interactive featured book collection"]',
    );
    await featured
      .getByRole("heading", { name: "Braiding Sweetgrass", exact: true })
      .waitFor();
    const piranesi = featured.getByRole("button", {
      name: "Piranesi",
      exact: true,
    });
    await piranesi.focus();
    await featured
      .getByRole("heading", { name: "Piranesi", exact: true })
      .waitFor();
    await guest.getByRole("link", { name: "View Piranesi" }).waitFor();
    await piranesi.press("Enter");
    await guest.waitForURL("**/#book/seed-piranesi");
    await guest.goto(base + "/#home");
    await piranesi.click();
    await guest.waitForURL("**/#book/seed-piranesi");
    await guest.goto(base + "/#home");
    const spine = featured.getByRole("button", {
      name: "Small Things Like These",
      exact: true,
    });
    assert(
      await spine.locator(".side-book__title").evaluate((title) => {
        const label = title.getBoundingClientRect();
        const book = title.parentElement.getBoundingClientRect();
        return (
          label.left >= book.left &&
          label.right <= book.right &&
          label.top >= book.top &&
          label.bottom <= book.bottom
        );
      }),
    );
    await spine.tap();
    await guest.waitForURL("**/#book/seed-smallthings");
    await guest.goto(base + "/#home");
    await guest.getByRole("button", { name: "Switch to light mode" }).click();
    await featured.locator("body:not(.dark-mode)").waitFor();
    await guest.reload();
    await guest.getByRole("button", { name: "Switch to dark mode" }).waitFor();
    await featured.locator("body:not(.dark-mode)").waitFor();
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
