// Uses the desktop's bundled Playwright; no browser dependency is added to the app.
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH ||
    "C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const { spawn } = require("node:child_process");
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const assert = require("node:assert/strict");
const { auditLayout } = require("./layout.cjs");
(async () => {
  const dir = mkdtempSync(join(tmpdir(), "shelves-browser-"));
  mkdirSync("test-results", { recursive: true });
  const port = "3101";
  const usePostgres = process.env.BROWSER_DATABASE === "postgres",
    schema = `shelves_test_${randomUUID().replaceAll("-", "")}`;
  const server = spawn(
    process.execPath,
    ["--import", "tsx", "server/start.ts"],
    {
      env: {
        ...process.env,
        PORT: port,
        DATABASE_PATH: join(dir, "browser.db"),
        DATABASE_ENGINE: usePostgres ? "postgres" : "sqlite",
        DATABASE_SCHEMA: usePostgres ? schema : undefined,
        NODE_ENV: "development",
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let browser;
  let serverOutput = "";
  server.stdout.on("data", (d) => (serverOutput += d));
  server.stderr.on("data", (d) => (serverOutput += d));
  const base = `http://127.0.0.1:${port}`,
    errors = [];
  try {
    for (let i = 0; i < 50; i++) {
      try {
        const r = await fetch(`${base}/api/health`);
        if (r.ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
      if (i === 49) throw new Error(serverOutput);
    }
    browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.BROWSER_PATH ||
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
    });
    const first = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      }),
      page = await first.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page
      .getByRole("heading", { name: "Stories are better when shared." })
      .waitFor();
    assert((await page.title()).includes("Shelves"));
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("button", { name: "New here? Create an account" })
      .click();
    await page.getByLabel("Your name", { exact: true }).fill("First Reader");
    await page.getByLabel("Username", { exact: true }).fill("first_reader");
    await page.getByLabel("Email", { exact: true }).fill("first@example.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("A-secure-test-password");
    await page.getByRole("button", { name: "Create my account" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByRole("link", { name: "Choose reading preferences ↗" })
      .click();
    await page.getByLabel("Fantasy", { exact: true }).check();
    await page.getByLabel("Classic", { exact: true }).check();
    await page.getByLabel("Nature", { exact: true }).check();
    await page.getByLabel("Mystery", { exact: true }).check();
    await page.getByLabel("Poetry", { exact: true }).check();
    assert(await page.getByLabel("Romance", { exact: true }).isDisabled());
    await page.getByLabel("Poetry", { exact: true }).uncheck();
    assert(await page.getByLabel("Romance", { exact: true }).isEnabled());
    await page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await page
      .getByText(
        "Your reading preferences are saved. Discover has fresh suggestions for you.",
        { exact: true },
      )
      .waitFor();
    await page.reload();
    await page
      .getByRole("button", { name: "Save preferences", exact: true })
      .waitFor();
    assert(await page.getByLabel("Fantasy", { exact: true }).isChecked());
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await auditLayout(page, `preferences ${width}px`);
      await page.screenshot({
        path: `test-results/preferences-${width}.png`,
        fullPage: true,
      });
    }
    await page
      .getByRole("button", {
        name: "Continue without favorite genres",
        exact: true,
      })
      .click();
    await page
      .getByText(
        "Preferences saved without favorite genres. Your reading activity will still shape suggestions.",
        { exact: true },
      )
      .waitFor();
    assert(!(await page.getByLabel("Fantasy", { exact: true }).isChecked()));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/#home`);
    await page
      .getByRole("heading", { name: "Stories are better when shared." })
      .waitFor();
    assert.equal(
      await page
        .getByRole("link", { name: "Choose reading preferences ↗" })
        .count(),
      0,
    );
    await page
      .getByRole("button", { name: "Create shelf", exact: true })
      .click();
    await page.getByLabel("Shelf name").fill("Favorites");
    await page.getByRole("button", { name: "Create shelf ↗" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .locator(".main-nav")
      .getByRole("button", { name: "Discover", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Open The Overstory", exact: true })
      .click();
    await page
      .getByRole("button", { name: /^(Add to my library|Update reading)/ })
      .click();
    await page.getByLabel("Reading status").selectOption("Currently reading");
    await page.getByLabel("Your rating").selectOption("5");
    await page.getByLabel("Page reached").fill("120");
    await page
      .getByLabel("Your private review")
      .fill("My private note about trees.");
    await page.getByLabel("Favorites", { exact: true }).check();
    await page.getByRole("button", { name: "Save reading update" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .locator(".main-nav")
      .getByRole("button", { name: "My shelves", exact: true })
      .click();
    assert.equal(await page.locator(".feed-column .book-tile").count(), 1);
    await page.reload();
    await page
      .getByRole("link", { name: "Open The Overstory", exact: true })
      .click();
    await page
      .getByRole("button", { name: /^(Add to my library|Update reading)/ })
      .click();
    assert.equal(await page.getByLabel("Page reached").inputValue(), "120");
    assert.equal(
      await page.getByLabel("Your private review").inputValue(),
      "My private note about trees.",
    );
    assert(await page.getByLabel("Favorites", { exact: true }).isChecked());
    await page.getByLabel("Reading status").selectOption("Finished");
    await page.getByRole("button", { name: "Save reading update" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .locator(".main-nav")
      .getByRole("button", { name: "Reading journal", exact: true })
      .click();
    await page
      .getByText("My private note about trees.", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Open profile", exact: true })
      .click();
    await page
      .getByText("Edit profile and reading goal", { exact: true })
      .click();
    await page.getByLabel(/Reading goal for/).fill("12");
    await page.getByRole("button", { name: "Save profile" }).click();
    await page.getByText("Your profile and goal are saved.").waitFor();
    const sharp = require("sharp");
    const uploadImage = await sharp({
      create: { width: 800, height: 500, channels: 3, background: "#8d9f87" },
    })
      .png()
      .toBuffer();
    await page.getByLabel("Profile picture", { exact: true }).setInputFiles({
      name: "portrait.png",
      mimeType: "image/png",
      buffer: uploadImage,
    });
    await page.getByText("Profile image updated.", { exact: true }).waitFor();
    await page.getByLabel("Profile banner", { exact: true }).setInputFiles({
      name: "banner.png",
      mimeType: "image/png",
      buffer: uploadImage,
    });
    await page.locator(".profile-banner img").waitFor();
    await page.locator(".profile-portrait img").waitFor();
    const beforeProgress = await (
      await page.request.get(`${base}/api/snapshot`)
    ).json();
    const originalReading = beforeProgress.library.find(
      (r) => r.bookId === "seed-overstory",
    );
    await page.request.put(`${base}/api/library/seed-overstory`, {
      headers: { "X-Shelves-Request": "1" },
      data: { ...originalReading, status: "Currently reading", page: 120 },
    });
    await page.reload();
    await page
      .locator(".current-reading")
      .getByRole("button", { name: "Update progress", exact: true })
      .first()
      .click();
    await page.getByLabel("Current page", { exact: true }).fill("46");
    await page
      .getByLabel("Share this update on my wall", { exact: true })
      .check();
    await page
      .getByLabel("Add a public note (optional)", { exact: true })
      .fill("A new chapter today.");
    await page
      .getByRole("button", { name: "Save progress", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .locator(".profile-wall .post-copy")
      .filter({ hasText: "A new chapter today." })
      .waitFor();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const portrait = await page
        .locator(".profile-portrait .avatar")
        .boundingBox();
      const banner = await page.locator(".profile-banner").boundingBox();
      assert(portrait.y < banner.y + banner.height, "Portrait overlaps banner");
      assert(
        portrait.y + portrait.height > banner.y + banner.height,
        "Portrait extends below banner",
      );
      await auditLayout(page, `profile images and wall ${width}px`);
      await page.screenshot({
        path: `test-results/profile-wall-${width}.png`,
        fullPage: true,
      });
    }
    const progressSnapshot = await (
      await page.request.get(`${base}/api/snapshot`)
    ).json();
    const progressPost = progressSnapshot.posts.find(
      (p) => p.kind === "progress",
    );
    assert(progressPost);
    await page.request.delete(`${base}/api/posts/${progressPost.id}`, {
      headers: { "X-Shelves-Request": "1" },
    });
    await page.request.put(`${base}/api/library/seed-overstory`, {
      headers: { "X-Shelves-Request": "1" },
      data: originalReading,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });

    await page
      .locator(".main-nav")
      .getByRole("button", { name: "Home", exact: true })
      .click();
    await page.getByRole("button", { name: "Create post" }).click();
    await page
      .getByLabel("Your note")
      .fill("A public thought about a wonderful book.");
    await page
      .getByRole("button", { name: "Share with the community" })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByText("A public thought about a wonderful book.", { exact: true })
      .waitFor();
    await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
    const second = await browser.newContext({
        viewport: { width: 1280, height: 900 },
      }),
      page2 = await second.newPage();
    page2.on("pageerror", (e) => errors.push(e.message));
    await page2.goto(base);
    await page2.getByRole("button", { name: "Sign in", exact: true }).click();
    await page2
      .getByRole("button", { name: "New here? Create an account" })
      .click();
    await page2.getByLabel("Your name", { exact: true }).fill("Second Reader");
    await page2.getByLabel("Username", { exact: true }).fill("second_reader");
    await page2
      .getByLabel("Email", { exact: true })
      .fill("second@example.test");
    await page2
      .getByLabel("Password", { exact: true })
      .fill("A-secure-test-password");
    await page2.getByRole("button", { name: "Create my account" }).click();
    await page2.getByRole("dialog").waitFor({ state: "hidden" });
    await page2
      .locator(".post-card")
      .getByRole("button", { name: /appreciations/ })
      .click();
    await page2
      .locator(".post-card .like-btn b")
      .getByText("1", { exact: true })
      .waitFor();
    await page2
      .locator(".post-card")
      .getByRole("button", { name: "0 notes" })
      .click();
    await page2.getByLabel("Your note").fill("A lovely recommendation.");
    await page2.getByRole("button", { name: "Add note" }).click();
    await page2.getByRole("dialog").waitFor({ state: "hidden" });
    await page2
      .getByText("A lovely recommendation.", { exact: true })
      .waitFor();
    await page2
      .locator(".main-nav")
      .getByRole("button", { name: "My shelves", exact: true })
      .click();
    assert.equal(await page2.locator(".feed-column .book-tile").count(), 0);
    assert(
      !(await page2
        .getByText("My private note about trees.", { exact: true })
        .count()),
    );
    await page2
      .locator(".main-nav")
      .getByRole("button", { name: "Reading circle", exact: true })
      .click();
    await page2
      .locator(".community-row")
      .getByRole("button", { name: "Follow", exact: true })
      .click();
    await page2
      .locator(".community-row")
      .getByRole("button", { name: "Following", exact: true })
      .waitFor();
    await page.reload();
    await page
      .getByRole("button", { name: "Notifications, 3 unread", exact: true })
      .click();
    await page.locator(".notification-item").first().waitFor();
    assert.equal(await page.locator(".notification-item.unread").count(), 3);
    await auditLayout(page, "notification inbox desktop");
    await page.setViewportSize({ width: 320, height: 640 });
    await auditLayout(page, "notification inbox 320px");
    await page
      .locator(".notification-item")
      .filter({ hasText: "left a note on your post." })
      .getByRole("link")
      .click();
    await page.locator(".feed-column .post-card").waitFor();
    await page.getByText("A lovely recommendation.", { exact: true }).waitFor();
    assert.match(page.url(), /#post\//);
    await auditLayout(page, "notification post 320px");
    await page.reload();
    await page.locator(".feed-column .post-card").waitFor();
    await page
      .getByRole("button", { name: "Notifications, 2 unread", exact: true })
      .click();
    await page.getByRole("button", { name: "Mark all as read" }).click();
    await page
      .getByRole("button", { name: "Notifications, 0 unread", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Unread", exact: true }).click();
    await page
      .getByRole("heading", { name: "You are all caught up." })
      .waitFor();
    await page.screenshot({
      path: "test-results/notifications-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .locator(".main-nav")
      .getByRole("button", { name: "Discover", exact: true })
      .click();
    await page.route("**/api/books/search?*", (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: "gb_browser",
              title: "Piranesi",
              author: "Susanna Clarke",
              genre: "Fantasy",
              pages: 272,
              description: "A labyrinth of stories.",
              cover: null,
              color: "sage",
              year: 2020,
            },
          ],
          source: "Google Books",
          warning: null,
        },
      }),
    );
    await page.getByLabel("Book title or author").fill("Piranesi");
    await page.locator(".search-source").waitFor({ timeout: 20000 });
    assert(
      (await page.locator(".search-source").innerText()).includes(
        "Google Books",
      ),
    );
    await page
      .getByRole("link", { name: "Open Piranesi", exact: true })
      .first()
      .waitFor();
    await page.unroute("**/api/books/search?*");
    await page.getByLabel("Book title or author").fill("");
    await page.locator(".book-tile").first().waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    // Escape behavior must not depend on a particular personalized recommendation.
    await page.goto(`${base}/#book/seed-garden`);
    await page.getByRole("button", { name: "Add to my library" }).click();
    assert(await page.getByRole("dialog").isVisible());
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page
      .locator(".mobile-nav")
      .getByRole("button", { name: "You", exact: true })
      .click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByRole("button", { name: "Join Shelves" }).waitFor();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByLabel("Email", { exact: true }).fill("first@example.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("A-secure-test-password");
    await page.getByRole("button", { name: "Sign in ↗" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.goto(`${base}/#book/seed-overstory`);
    await page
      .getByRole("heading", { name: "The Overstory", exact: true, level: 2 })
      .waitFor();
    assert(
      (await page.locator(".community-score").innerText()).includes(
        "Be the first",
      ),
    );
    await page
      .getByRole("button", { name: "Write a public review", exact: true })
      .click();
    await page.getByLabel("Public star rating").selectOption("5");
    await page
      .getByLabel("Public review", { exact: true })
      .fill("Public plot detail from the final chapter.");
    await page.getByLabel("This review contains spoilers").check();
    await page.getByRole("button", { name: "Publish review" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.reload();
    await page.getByRole("button", { name: "Edit my public review" }).waitFor();
    await page
      .locator(".community-score")
      .getByText("5.0", { exact: true })
      .waitFor();
    assert(
      !(await page
        .getByText("Public plot detail from the final chapter.", {
          exact: true,
        })
        .isVisible()),
    );
    await page.locator(".spoiler-review summary").click();
    assert(
      await page
        .getByText("Public plot detail from the final chapter.", {
          exact: true,
        })
        .isVisible(),
    );
    await page.getByRole("button", { name: "Edit my public review" }).click();
    await page.getByLabel("Public star rating").selectOption("3");
    await page
      .getByRole("button", { name: "Save public review changes" })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .locator(".community-score")
      .getByText("3.0", { exact: true })
      .waitFor();
    assert.equal(await page.locator(".feed-column .post-card").count(), 1);
    await page.screenshot({
      path: "test-results/book-mobile.png",
      fullPage: true,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await page2.goto(`${base}/#book/seed-overstory`);
    await page2
      .getByRole("button", { name: "Write a public review", exact: true })
      .waitFor();
    assert(
      !(await page2
        .getByText("My private note about trees.", { exact: true })
        .count()),
    );
    assert.equal(
      await page2
        .getByRole("button", { name: "Delete post", exact: true })
        .count(),
      0,
    );
    await page2
      .getByRole("button", { name: "Write a public review", exact: true })
      .click();
    await page2.getByLabel("Public star rating").selectOption("5");
    await page2
      .getByLabel("Public review", { exact: true })
      .fill("A second perspective on this story.");
    await page2.getByRole("button", { name: "Publish review" }).click();
    await page2.getByRole("dialog").waitFor({ state: "hidden" });
    await page2
      .locator(".community-score")
      .getByText("4.0", { exact: true })
      .waitFor();
    await page2.screenshot({
      path: "test-results/book-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Delete post", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Delete public review", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .locator(".community-score")
      .getByText("5.0", { exact: true })
      .waitFor();
    await page
      .locator(".mobile-nav")
      .getByRole("button", { name: "Shelves", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Open The Overstory", exact: true })
      .click();
    await page.getByRole("button", { name: "Update reading" }).click();
    assert.equal(
      await page.getByLabel("Your private review").inputValue(),
      "My private note about trees.",
    );
    await page.keyboard.press("Escape");
    // Shelf CRUD is owner-scoped and leaves reading records intact.
    await page.goto(`${base}/#shelves`);
    await page
      .locator(".library-tabs")
      .getByRole("button", { name: "Favorites", exact: true })
      .click();
    await page.reload();
    await page
      .getByRole("button", { name: "Rename shelf", exact: true })
      .click();
    await page.getByLabel("Shelf name").fill("Books I would read again");
    await page.getByRole("button", { name: "Save shelf name" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByRole("heading", { name: "Books I would read again", exact: true })
      .waitFor();
    await page.getByLabel("Search my library").fill("missing title");
    assert.equal(await page.locator(".feed-column .book-tile").count(), 0);
    await page.getByRole("button", { name: "Clear library search" }).click();
    assert.equal(await page.locator(".feed-column .book-tile").count(), 1);
    await page.getByLabel("Sort books").selectOption("rating");
    await page
      .getByRole("button", { name: "Delete shelf", exact: true })
      .click();
    assert(
      await page
        .getByRole("dialog")
        .getByText(/books stay|book stays/)
        .isVisible(),
    );
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await page.locator(".feed-column .book-tile").count(), 1);
    await page
      .getByRole("button", { name: "Delete shelf", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete shelf", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(await page.locator(".feed-column .book-tile").count(), 1);
    const firstSnapshot = await (
      await page.request.get(`${base}/api/snapshot`)
    ).json();
    assert.equal(
      firstSnapshot.library[0].review,
      "My private note about trees.",
    );
    const firstId = firstSnapshot.user.id;
    await page2.goto(`${base}/#reader/${firstId}`);
    await page2
      .getByRole("heading", { name: "First Reader", exact: true })
      .waitFor();
    assert.equal(await page2.locator(".feed-column .post-card").count(), 1);
    assert(
      !(await page2
        .getByText("My private note about trees.", { exact: true })
        .count()),
    );
    await page2
      .getByRole("button", { name: "Following", exact: true })
      .first()
      .click();
    await page2
      .getByRole("button", { name: "Follow reader", exact: true })
      .waitFor();
    await page2
      .getByRole("button", { name: "Follow reader", exact: true })
      .click();
    await page2
      .getByRole("button", { name: "Following", exact: true })
      .first()
      .waitFor();
    await page2.reload();
    await page2
      .getByRole("heading", { name: "First Reader", exact: true })
      .waitFor();
    await page.goto(`${base}/#catalog`);
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .waitFor();
    await page
      .getByLabel("Catalogue title or author", { exact: true })
      .fill("The Secret Garden");
    await page
      .getByLabel("Catalogue genre", { exact: true })
      .selectOption("Classic");
    await page.getByLabel("Published from", { exact: true }).fill("1900");
    await page.getByLabel("Published through", { exact: true }).fill("1920");
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await page.getByText("1 book · Page 1 of 1", { exact: true }).waitFor();
    const catalogueUrl = page.url();
    await page.reload();
    await page.getByText("1 book · Page 1 of 1", { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel("Published from", { exact: true }).inputValue(),
      "1900",
    );
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await auditLayout(page, `catalogue ${width}px`);
      await page.screenshot({
        path: `test-results/catalogue-${width}.png`,
        fullPage: true,
      });
    }
    await page
      .getByRole("link", { name: "Open The Secret Garden", exact: true })
      .click();
    await page
      .getByRole("heading", {
        name: "The Secret Garden",
        exact: true,
        level: 2,
      })
      .waitFor();
    await page.goBack();
    assert.equal(page.url(), catalogueUrl);
    await page.getByLabel("Published from", { exact: true }).fill("2020");
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await page
      .getByText("Start year must not be after end year.", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await page
      .getByLabel("Catalogue title or author", { exact: true })
      .fill("no-match-unusual-xyz");
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await page
      .getByText(
        "No books match these filters. Try another genre or a wider year range.",
        { exact: true },
      )
      .waitFor();
    await page.setViewportSize({ width: 1440, height: 1000 });
    // Curated lists: private draft, saved order, public link, and deletion.
    // Feed pagination adds requests to the earlier social flows; keep this
    // accelerated multi-reader suite within the real server's rate limit.
    const listAllowance = await page.request.get(`${base}/api/health`);
    if (Number(listAllowance.headers()["ratelimit-remaining"]) < 70) {
      const seconds = Number(listAllowance.headers()["ratelimit-reset"]);
      await new Promise((resolve) => setTimeout(resolve, (seconds + 1) * 1000));
    }
    await page.goto(`${base}/#lists`);
    await page
      .getByRole("button", { name: "Create a list", exact: true })
      .click();
    await page
      .getByLabel("List title", { exact: true })
      .fill("Quiet autumn reading");
    await page
      .getByLabel("Description", { exact: true })
      .fill("Stories for a rainy afternoon.");
    assert.equal(
      await page.getByLabel("Who can see this list?").inputValue(),
      "private",
    );
    await page
      .getByLabel("Find a book in the catalogue")
      .fill("The Secret Garden");
    await page
      .getByRole("button", { name: "Add The Secret Garden", exact: true })
      .click();
    await page.getByLabel("Find a book in the catalogue").fill("The Overstory");
    await page
      .getByRole("button", { name: "Add The Overstory", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Move The Overstory up", exact: true })
      .click();
    await page.setViewportSize({ width: 320, height: 740 });
    await auditLayout(page, "list editor 320px");
    await page.screenshot({
      path: "test-results/list-editor-320.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Save list", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByRole("heading", { name: "Quiet autumn reading", exact: true })
      .waitFor();
    const listUrl = page.url();
    await page.reload();
    await page
      .getByRole("button", { name: "Edit list", exact: true })
      .waitFor();
    assert(
      (await page.locator(".list-page .book-grid").innerText()).indexOf(
        "The Overstory",
      ) <
        (await page.locator(".list-page .book-grid").innerText()).indexOf(
          "The Secret Garden",
        ),
    );
    await page2.goto(listUrl);
    await page2
      .getByText("List not found or private.", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Edit list", exact: true }).click();
    await page.getByLabel("Who can see this list?").selectOption("public");
    await page.getByRole("button", { name: "Save list", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page2.reload();
    await page2
      .getByRole("heading", { name: "Quiet autumn reading", exact: true })
      .waitFor();
    assert.equal(
      await page2
        .getByRole("button", { name: "Edit list", exact: true })
        .count(),
      0,
    );
    await page2
      .getByLabel("Your comment", { exact: true })
      .fill(
        "I would start with The Secret Garden. " + "LongBookThought".repeat(30),
      );
    await page2
      .getByRole("button", { name: "Add comment", exact: true })
      .click();
    await page2.getByText("Comment added.", { exact: true }).waitFor();
    await page.reload();
    await page.locator(".discussion-comment").first().waitFor();
    await page
      .getByRole("button", { name: "Delete comment", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Keep comment", exact: true })
      .click();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await auditLayout(page, `list detail ${width}px`);
      await page.screenshot({
        path: `test-results/list-${width}.png`,
        fullPage: true,
      });
    }
    await page
      .getByRole("button", { name: "Delete comment", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete permanently", exact: true })
      .click();
    await page.getByText("Comment deleted.", { exact: true }).waitFor();
    await page2.reload();
    await page2
      .getByText(
        "No comments yet. Start the conversation with a book recommendation.",
        { exact: true },
      )
      .waitFor();
    await page
      .getByRole("button", { name: "Delete list", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Delete permanently", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page2.reload();
    await page2
      .getByText("List not found or private.", { exact: true })
      .waitFor();
    // Deliberately stress real surfaces with maximum names, long words and shelves.
    const write = async (path, method, data) => {
      const response = await page.request.fetch(`${base}/api${path}`, {
        method,
        headers: { "X-Shelves-Request": "1" },
        data,
      });
      assert(response.ok(), `fixture ${path}: ${response.status()}`);
      return response.status() === 204 ? null : response.json();
    };
    await write("/me", "PATCH", {
      displayName:
        "ReaderWithAVeryLongUnbrokenNameToExerciseEveryContainerAtOnc",
      bio: "A reader with a long biography. ".repeat(8),
      goal: 12,
    });
    for (let i = 0; i < 8; i++)
      await write("/shelves", "POST", {
        name: `Shelf ${i} with a long title and room for favorite rereads`,
      });
    await write("/posts", "POST", {
      kind: "quote",
      body:
        "WordsWithoutSpaces".repeat(25) +
        "\nA quote worth sharing with everyone in the circle.",
    });
    await page.goto(`${base}/#home`);
    await page.reload();
    await page.locator(".quote-copy").waitFor();
    const layoutAllowance = await page.request.get(`${base}/api/health`);
    if (Number(layoutAllowance.headers()["ratelimit-remaining"]) < 140) {
      const seconds = Number(layoutAllowance.headers()["ratelimit-reset"]);
      assert(Number.isFinite(seconds) && seconds >= 0 && seconds <= 60);
      await new Promise((resolve) => setTimeout(resolve, (seconds + 1) * 1000));
    }
    const layoutChecks = [];
    const routes = [
      "home",
      "discover",
      "shelves",
      "community",
      "journal",
      "lists",
      "settings",
      "preferences",
      "profile",
      "book/seed-overstory",
      `reader/${firstId}`,
    ];
    for (const width of [1440, 1280, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width <= 390 ? 740 : 900 });
      for (const route of routes) {
        await page.evaluate((route) => {
          location.hash = route;
        }, route);
        const heading = route.startsWith("book/")
          ? "The Overstory"
          : route.startsWith("reader/")
            ? "ReaderWithAVeryLongUnbrokenNameToExerciseEveryContainerAtOnc"
            : {
                home: "Your reading nook",
                discover: "Find your next favorite",
                shelves: "Your personal library",
                community: "Better stories, together",
                journal: "Notes worth keeping",
                lists: "Collections worth sharing",
                settings: "Account settings",
                preferences: "Your reading preferences",
                profile: "Your reading life",
              }[route];
        await page
          .getByRole("heading", { name: heading, exact: true })
          .first()
          .waitFor();
        if (route.startsWith("book/"))
          await page.getByRole("button", { name: "Update reading" }).waitFor();
        await auditLayout(page, `${route} at ${width}px`);
        layoutChecks.push(`${route} at ${width}px`);
        if ([1440, 390].includes(width))
          await page.screenshot({
            path: `test-results/layout-${route.split("/")[0]}-${width}.png`,
            fullPage: true,
          });
      }
    }
    const socialAllowance = await first.request.get(`${base}/api/health`);
    if (Number(socialAllowance.headers()["ratelimit-remaining"]) < 75) {
      const seconds = Number(socialAllowance.headers()["ratelimit-reset"]);
      assert(seconds >= 0 && seconds <= 60);
      await new Promise((resolve) => setTimeout(resolve, (seconds + 1) * 1000));
    }
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}/#readers`);
      await page
        .getByLabel("Find readers", { exact: true })
        .fill("second_reader");
      await page
        .getByRole("button", { name: "Search readers", exact: true })
        .click();
      await page.locator(".reader-directory .reader-link").first().waitFor();
      assert.equal(
        await page.locator(".reader-directory .reader-link").count(),
        1,
      );
      await auditLayout(page, `reader directory ${width}px`);
      await page.screenshot({
        path: `test-results/readers-${width}.png`,
        fullPage: true,
      });
      await page.goto(`${base}/#book/seed-overstory`);
      await page.locator(".book-page-author a").click();
      await page
        .getByRole("heading", { name: "Books and editions", exact: true })
        .waitFor();
      await page.locator(".catalog-page .book-tile").first().waitFor();
      await auditLayout(page, `author profile ${width}px`);
      await page.screenshot({
        path: `test-results/author-${width}.png`,
        fullPage: true,
      });
    }
    // Tiny viewport height and long memberships must scroll without clipping.
    await page.setViewportSize({ width: 320, height: 480 });
    await page.goto(`${base}/#book/seed-overstory`);
    await page.getByRole("button", { name: "Update reading" }).click();
    await auditLayout(page, "reading dialog at 320x480");
    await page
      .getByRole("button", { name: "Save reading update" })
      .scrollIntoViewIfNeeded();
    assert(
      await page
        .getByRole("button", { name: "Save reading update" })
        .isVisible(),
    );
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Write a public review", exact: true })
      .click();
    await auditLayout(page, "review dialog at 320x480");
    await page.getByRole("button", { name: "Publish review" }).click();
    await page.getByRole("dialog").locator(".form-error").waitFor();
    assert.equal(
      await page
        .getByLabel("Public review", { exact: true })
        .getAttribute("aria-invalid"),
      "true",
    );
    await page.keyboard.press("Escape");
    await page.goto(`${base}/#home`);
    await page.getByRole("button", { name: "Create post" }).click();
    await auditLayout(page, "composer at 320x480");
    await page
      .getByLabel("Your note")
      .fill("An offline draft that should survive a failed save.");
    await first.setOffline(true);
    await page
      .getByRole("button", { name: "Share with the community" })
      .click();
    await page
      .getByRole("dialog")
      .getByText("Cannot reach Shelves. Check your connection and try again.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page.getByLabel("Your note").inputValue(),
      "An offline draft that should survive a failed save.",
    );
    await auditLayout(page, "composer offline recovery");
    await first.setOffline(false);
    await page.keyboard.press("Escape");
    await page.goto(`${base}/#shelves`);
    await page
      .getByRole("button", { name: "+ New shelf", exact: true })
      .click();
    await auditLayout(page, "new shelf dialog at 320x480");
    await page
      .getByLabel("Shelf name")
      .fill("Shelf 0 with a long title and room for favorite rereads");
    await page.getByRole("button", { name: "Create shelf ↗" }).click();
    await page
      .getByRole("dialog")
      .getByText("You already have a shelf with that name.", { exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Shelf name").inputValue(),
      "Shelf 0 with a long title and room for favorite rereads",
    );
    await page.keyboard.press("Escape");
    const guest = await browser.newContext({
        viewport: { width: 320, height: 480 },
      }),
      guestPage = await guest.newPage();
    await guestPage.goto(base);
    await guestPage
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await auditLayout(guestPage, "sign-in dialog at 320x480");
    await guestPage
      .getByRole("button", { name: "New here? Create an account" })
      .click();
    await auditLayout(guestPage, "registration dialog at 320x480");
    await guestPage.keyboard.press("Escape");
    await guest.close();
    // Long external titles are readable outside the decorative cover.
    const longTitle = "A Very Long Book Title ".repeat(12).trim();
    await page.route("**/api/books/search?*", (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: "layout-book",
              title: longTitle,
              author: "AnAuthorWithAnUnbrokenName".repeat(3),
              genre: "Literary fiction",
              pages: 300,
              description: "",
              cover: null,
              color: "sage",
              year: 2026,
            },
          ],
          source: "Layout fixture",
          warning: null,
        },
      }),
    );
    await page.goto(`${base}/#discover`);
    await page.getByLabel("Book title or author").fill("long title");
    await page.getByRole("heading", { name: longTitle, exact: true }).waitFor();
    await auditLayout(page, "long book title at 320px");
    await page
      .getByRole("button", { name: "Clear search", exact: true })
      .click();
    await page.locator(".book-tile").first().waitFor();
    await page.unroute("**/api/books/search?*");
    await page.goto(`${base}/#reader/missing-reader`);
    await page.getByText("Reader not found.", { exact: true }).waitFor();
    await auditLayout(page, "reader not found");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await auditLayout(page, "reduced motion");
    // The layout matrix deliberately navigates far faster than a reader. Let
    // its request window reset before testing account writes; keep real limits.
    const allowance = await page.request.get(`${base}/api/health`);
    if (Number(allowance.headers()["ratelimit-remaining"]) < 65) {
      const seconds = Number(allowance.headers()["ratelimit-reset"]);
      assert(Number.isFinite(seconds) && seconds >= 0 && seconds <= 60);
      await new Promise((resolve) => setTimeout(resolve, (seconds + 1) * 1000));
    }
    await page.goto(`${base}/#settings`);
    await page.getByText("first@example.test", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Change password", exact: true })
      .click();
    await page
      .getByLabel("Current password", { exact: true })
      .fill("wrong-password");
    await page
      .getByLabel("New password", { exact: true })
      .fill("a-new-secure-password");
    await page
      .getByLabel("Confirm new password", { exact: true })
      .fill("different-password");
    await page
      .getByRole("button", { name: "Save new password", exact: true })
      .click();
    await page
      .getByText("The new passwords do not match.", { exact: true })
      .waitFor();
    await page
      .getByLabel("Confirm new password", { exact: true })
      .fill("a-new-secure-password");
    await page
      .getByRole("button", { name: "Save new password", exact: true })
      .click();
    await page
      .getByText("Current password is incorrect.", { exact: true })
      .waitFor();
    await auditLayout(page, "password change error 320x480");
    await page
      .getByLabel("Current password", { exact: true })
      .fill("A-secure-test-password");
    await page
      .getByRole("button", { name: "Save new password", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByText("Your password has changed. Sign in with your new password.", {
        exact: true,
      })
      .waitFor();
    async function signBackIn() {
      await page
        .locator(".account-settings")
        .getByRole("button", { name: "Sign in", exact: true })
        .click();
      await page
        .getByLabel("Email", { exact: true })
        .fill("first@example.test");
      await page
        .getByLabel("Password", { exact: true })
        .fill("a-new-secure-password");
      await page
        .getByRole("button", { name: "Sign in ↗", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.goto(`${base}/#settings`);
      await page.getByText("first@example.test", { exact: true }).waitFor();
      assert.equal(
        await page
          .getByText("You have signed out of all devices.", { exact: true })
          .count(),
        0,
      );
    }
    await signBackIn();
    await page
      .getByRole("button", { name: "Sign out all devices", exact: true })
      .click();
    await page
      .getByLabel("Current password", { exact: true })
      .fill("a-new-secure-password");
    await page
      .getByRole("button", { name: "Sign out everywhere", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByText("You have signed out of all devices.", { exact: true })
      .waitFor();
    await signBackIn();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await auditLayout(page, `account settings ${width}px`);
      await page.screenshot({
        path: `test-results/account-${width}.png`,
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 320, height: 480 });
    await page
      .getByRole("button", { name: "Delete account", exact: true })
      .click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "Delete account", exact: true })
      .click();
    await auditLayout(page, "account deletion 320x480");
    await page
      .getByLabel("Current password", { exact: true })
      .fill("a-new-secure-password");
    await page
      .getByLabel("Type DELETE to confirm", { exact: true })
      .fill("DELETE");
    await page
      .getByRole("button", {
        name: "Permanently delete my account",
        exact: true,
      })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByText("Your account has been deleted.", { exact: true })
      .waitFor();
    await page.reload();
    await page
      .locator(".account-settings")
      .getByRole("button", { name: "Sign in", exact: true })
      .waitFor();
    writeFileSync(
      "test-results/layout.json",
      JSON.stringify({ passed: true, checks: layoutChecks }, null, 2),
    );
    assert.deepEqual(errors, []);
    const evidence = {
      passed: true,
      database: usePostgres ? "postgres" : "sqlite",
      checks: [
        "registration",
        "reading status, rating, progress and private review",
        "custom shelf membership",
        "reload persistence",
        "goal update",
        "public post",
        "second-account isolation",
        "like and comment",
        "follow",
        "Google Books search rendering",
        "mobile overflow",
        "Escape dismissal",
        "logout and sign-in",
        "shareable book-page reload",
        "public review publish, edit, aggregate and delete",
        "spoiler reveal and review ownership",
        "private notes preserved after public review deletion",
        "shelf rename, bookmark, delete/cancel and preserved private records",
        "library search, clearing and sorting",
        "public reader profiles, follow/unfollow and reload",
        `${layoutChecks.length} route/viewport layout checks`,
        "curated lists: ordering, private access, publication, reload and deletion",
        "account password change, validation, session revocation, deletion/cancel and mobile layouts",
        "private genre preferences, selection limit, reload, reset and mobile layouts",
        "catalogue filters, year validation, URL persistence, back navigation and mobile layouts",
        "short dialogs, inline validation, long content and reduced motion",
        "notification counts, private inbox, conversation deep link, reload and mark-all-read",
      ],
      runtimeErrors: errors,
    };
    writeFileSync(
      "test-results/browser.json",
      JSON.stringify(evidence, null, 2),
    );
    console.log(JSON.stringify(evidence, null, 2));
  } catch (error) {
    if (browser) {
      for (const context of browser.contexts())
        for (const failedPage of context.pages()) {
          console.error(
            "Browser failure state",
            new URL(failedPage.url()).hash,
            await failedPage.getByRole("alert").allTextContents(),
          );
        }
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    if (server.exitCode === null) {
      const exited = new Promise((r) => server.once("exit", r));
      server.kill();
      await exited;
    }
    if (usePostgres) {
      if (!/^shelves_test_[a-f0-9]{32}$/.test(schema))
        throw new Error("Unexpected test schema");
      const { supabasePool } = await import("../server/supabase-config.ts");
      const cleanup = supabasePool();
      try {
        await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await cleanup.end();
      }
    }
    rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
