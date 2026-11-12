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
    for (const width of [1477, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of ["community", "profile", "readers"]) {
        await page.goto(base + "/#" + route);
        const target =
          route === "community"
            ? ".reading-garden-art"
            : route === "profile"
              ? ".profile-display-name .shelves-badge"
              : ".reader-directory .shelves-badge";
        await page.locator(target).first().waitFor();
        await page.evaluate(() =>
          Promise.all(
            document
              .getAnimations()
              .filter((a) => a.effect?.getTiming().iterations !== Infinity)
              .map((a) => a.finished.catch(() => {})),
          ),
        );
        await auditLayout(page, "watercolor " + route + " " + width);
        if (route === "profile") {
          const badge = await page.locator(target).boundingBox();
          const name = await page
            .locator(".profile-display-name")
            .boundingBox();
          assert(
            badge.x >= name.x &&
              badge.x + badge.width <= name.x + name.width + 1,
          );
          assert(badge.height <= name.height);
        }
        await page.screenshot({
          path: `test-results/watercolor-${route}-${width}.png`,
          fullPage: true,
        });
      }
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(base + "/#community");
    await page.locator(".community-garden").waitFor();
    assert.equal(
      await page
        .locator(".community-garden")
        .evaluate((e) => getComputedStyle(e).animationName),
      "none",
    );
    await page
      .getByRole("link", { name: /Explore community book lists/ })
      .click();
    assert.equal(new URL(page.url()).hash, "#lists");
    const result = await (
      await context.request.get(base + "/api/readers/directory?q=test_admin")
    ).json();
    assert.equal(result.items[0].isAdmin, true);
    assert.deepEqual(errors, []);
    console.log(
      "Watercolor UI passed: community/profile/directory layouts, adjacent admin badge, admin directory metadata, reduced motion and lists navigation.",
    );
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
