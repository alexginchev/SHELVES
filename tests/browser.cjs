// Uses the desktop's bundled Playwright; no browser dependency is added to the app.
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH ||
    "C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const { spawn } = require("node:child_process");
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const dir = mkdtempSync(join(tmpdir(), "shelves-browser-"));
  mkdirSync("test-results", { recursive: true });
  const port = "3101";
  const server = spawn(
    process.execPath,
    ["--import", "tsx", "server/start.ts"],
    {
      env: {
        ...process.env,
        PORT: port,
        DATABASE_PATH: join(dir, "browser.db"),
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
      .getByRole("button", { name: "Open The Overstory", exact: true })
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
      .getByRole("button", { name: "Open The Overstory", exact: true })
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
    await page.getByLabel(/Reading goal for/).fill("12");
    await page.getByRole("button", { name: "Save profile" }).click();
    await page.getByText("Your profile and goal are saved.").waitFor();
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
    await page
      .locator(".main-nav")
      .getByRole("button", { name: "Discover", exact: true })
      .click();
    await page.getByLabel("Book title or author").fill("Piranesi");
    await page.locator(".search-source").waitFor({ timeout: 20000 });
    assert(
      (await page.locator(".search-source").innerText()).includes(
        "Open Library",
      ),
    );
    await page
      .getByRole("button", { name: "Open Piranesi", exact: true })
      .first()
      .waitFor();
    await page.getByLabel("Book title or author").fill("");
    await page.locator(".book-tile").first().waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await page
      .getByRole("button", { name: "Open The Secret Garden", exact: true })
      .click();
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
      .getByRole("heading", { name: "The Overstory", exact: true })
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
      .getByRole("button", { name: "Open The Overstory", exact: true })
      .click();
    await page.getByRole("button", { name: "Update reading" }).click();
    assert.equal(
      await page.getByLabel("Your private review").inputValue(),
      "My private note about trees.",
    );
    await page.keyboard.press("Escape");
    assert.deepEqual(errors, []);
    const evidence = {
      passed: true,
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
        "live Open Library search",
        "mobile overflow",
        "Escape dismissal",
        "logout and sign-in",
        "shareable book-page reload",
        "public review publish, edit, aggregate and delete",
        "spoiler reveal and review ownership",
        "private notes preserved after public review deletion",
      ],
      runtimeErrors: errors,
    };
    writeFileSync(
      "test-results/browser.json",
      JSON.stringify(evidence, null, 2),
    );
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    if (browser) await browser.close();
    server.kill();
    await new Promise((r) => server.once("exit", r));
    rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
