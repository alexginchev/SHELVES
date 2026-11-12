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
    const headers = { "X-Shelves-Request": "1" };
    for (const [title, bookIds] of [
      ["Garden reading", ["seed-garden", "seed-sweetgrass", "seed-overstory"]],
      ["My next collection", []],
    ]) {
      assert.equal(
        (
          await context.request.post(base + "/api/lists", {
            headers,
            data: {
              title,
              bookIds,
              description: "Books to spend an afternoon with.",
              visibility: "public",
            },
          })
        ).status(),
        201,
      );
    }
    for (const width of [1477, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(base + "/#lists");
      await page.locator(".list-jackets .real-cover").first().waitFor();
      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter((a) => a.effect?.getTiming().iterations !== Infinity)
            .map((a) => a.finished.catch(() => {})),
        ),
      );
      await auditLayout(page, "list jackets " + width);
      await page.screenshot({
        path: `test-results/list-jackets-${width}.png`,
        fullPage: true,
      });
    }
    await page
      .getByRole("link", { name: "Garden reading", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("heading", { name: "Garden reading", exact: true })
      .waitFor();
    const manifest = await (
      await context.request.get(base + "/manifest.webmanifest")
    ).json();
    assert.equal(manifest.name, "Shelves");
    for (const icon of manifest.icons) {
      const response = await context.request.get(base + icon.src);
      assert.equal(response.status(), 200);
      if (icon.type === "image/png") {
        const metadata = await require("sharp")(
          await response.body(),
        ).metadata();
        assert.equal(icon.sizes, `${metadata.width}x${metadata.height}`);
      }
    }
    assert.equal(
      await page
        .locator('link[rel="icon"][type="image/svg+xml"]')
        .getAttribute("href"),
      "/branding/icon.svg",
    );
    assert.deepEqual(errors, []);
    console.log(
      "List artwork and icons passed: cover previews, empty artwork, keyboard navigation, mobile layouts, SVG favicon and manifest icon dimensions.",
    );
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
