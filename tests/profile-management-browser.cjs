const {
  chromium,
} = require("C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const { spawn } = require("node:child_process");
const { mkdirSync } = require("node:fs");
const assert = require("node:assert/strict");
const { auditLayout } = require("./layout.cjs");
(async () => {
  const server = spawn(
    process.execPath,
    ["--import", "tsx", "tests/safety-server.ts"],
    {
      env: { ...process.env, NODE_ENV: "development" },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let browser,
    output = "";
  server.stdout.on("data", (x) => (output += x));
  server.stderr.on("data", (x) => (output += x));
  const base = "http://127.0.0.1:3102";
  try {
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch(base + "/api/health")).ok) break;
      } catch {}
      if (i === 49) throw Error(output);
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch({
      headless: true,
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    });
    const context = await browser.newContext(),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    assert.equal(
      (
        await context.request.post(base + "/api/auth/login", {
          headers: { "X-Shelves-Request": "1" },
          data: {
            email: "admin@example.test",
            password: "test-password-long",
          },
        })
      ).status(),
      200,
    );

    await page.goto(base + "/#profile");
    const panel = page.getByRole("region", {
      name: "Profile & account",
      exact: true,
    });
    await panel.waitFor();
    assert.equal(
      await panel.getByRole("link", { name: /Community reports/ }).count(),
      1,
    );
    assert.equal(await page.locator(".profile-management").count(), 1);
    assert.equal(await page.locator(".profile-edit[open]").count(), 0);
    const image = await require("sharp")({
      create: { width: 800, height: 500, channels: 3, background: "#8d9f87" },
    })
      .png()
      .toBuffer();
    await panel.getByLabel("Profile picture", { exact: true }).setInputFiles({
      name: "portrait.png",
      mimeType: "image/png",
      buffer: image,
    });
    await panel
      .getByAltText("Current profile picture", { exact: true })
      .waitFor();
    await panel.getByLabel("Profile banner", { exact: true }).setInputFiles({
      name: "banner.png",
      mimeType: "image/png",
      buffer: image,
    });
    await panel.getByAltText("Current banner", { exact: true }).waitFor();
    await page.reload();
    await panel.getByAltText("Current banner", { exact: true }).waitFor();
    mkdirSync("test-results", { recursive: true });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await auditLayout(page, "profile management " + width);
      await panel.screenshot({
        path: "test-results/profile-management-" + width + ".png",
      });
    }
    await panel.getByLabel("Profile picture", { exact: true }).setInputFiles({
      name: "bad.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("invalid"),
    });
    await panel.getByRole("alert").waitFor();
    assert.equal(
      await panel
        .getByAltText("Current profile picture", { exact: true })
        .count(),
      1,
    );
    await panel
      .getByRole("link", { name: /Muted and blocked readers/ })
      .click();
    assert(page.url().endsWith("#safety"));
    await page.goto(base + "/#profile");
    await panel.getByRole("link", { name: /Community reports/ }).click();
    assert(page.url().endsWith("#moderation"));
    await page.goto(base + "/#profile");
    await panel.getByRole("link", { name: /Account settings/ }).click();
    assert(page.url().endsWith("#settings"));
    const other = await browser.newContext();
    assert.equal(
      (
        await other.request.post(base + "/api/auth/register", {
          headers: { "X-Shelves-Request": "1" },
          data: {
            username: "ordinary_reader",
            displayName: "Ordinary Reader",
            email: "ordinary@example.test",
            password: "test-password-long",
          },
        })
      ).status(),
      201,
    );
    const otherPage = await other.newPage();
    await otherPage.goto(base + "/#profile");
    await otherPage
      .getByRole("heading", { name: "Profile & account", exact: true })
      .waitFor();
    assert.equal(
      await otherPage
        .locator(".profile-management")
        .getByRole("link", { name: /Community reports/ })
        .count(),
      0,
    );
    await page.goto(base + "/#home");
    await page
      .getByRole("heading", { name: "Currently reading", exact: true })
      .waitFor();
    assert.equal(await page.locator(".profile-management").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        passed: true,
        checks: [
          "dedicated profile links",
          "admin report visibility",
          "visible photo and banner uploads",
          "reload persistence",
          "invalid upload retains photo",
          "desktop/mobile layout",
          "profile-only controls",
        ],
        runtimeErrors: errors,
      }),
    );
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
