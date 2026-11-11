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
    const page = await browser.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/#home");
    await page.locator(".book-tile img").first().waitFor();
    assert.equal(await page.locator(".sidebar-note,.rail-footer").count(), 0);
    assert.equal(await page.locator(".right-rail footer").count(), 0);
    for (const width of [1477, 390, 320]) {
      await page.setViewportSize({
        width,
        height: width === 1477 ? 1244 : 900,
      });
      await page.locator(".site-footer").scrollIntoViewIfNeeded();
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".book-tile img")].every(
          (img) => img.complete && img.naturalWidth > 100,
        ),
      );
      await auditLayout(page, "home identity " + width);
      await page.screenshot({
        path: `test-results/site-home-${width}.png`,
        fullPage: true,
      });
      for (const label of ["Terms of use", "Cookies"]) {
        await page
          .locator(".site-footer")
          .getByRole("link", { name: label, exact: true })
          .click();
        await page.locator(".site-information").waitFor();
        await auditLayout(page, label + " " + width);
        await page.reload();
        await page.locator(".site-information").waitFor();
        await page
          .getByRole("link", { name: "Back to Home", exact: true })
          .click();
        await page.locator(".book-tile img").first().waitFor();
      }
    }
    await page.setViewportSize({ width: 1477, height: 1244 });
    await page.locator(".brand").focus();
    await page.keyboard.press("Enter");
    assert(page.url().endsWith("#home"));
    await page.route("**/covers/*", (route) => route.abort());
    await page.reload();
    await page.locator(".book-tile .paper-cover").first().waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "Site identity passed: real covers, image-failure fallback, footer links/reload, keyboard logo and desktop/mobile layouts.",
    );
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
