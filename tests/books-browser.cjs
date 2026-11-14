const {
  chromium,
} = require("C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const assert = require("node:assert/strict");
const { auditLayout } = require("./layout.cjs");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const result = await (
      await fetch("http://127.0.0.1:3000/api/books/search?q=Piranesi")
    ).json();
    assert.equal(result.source, "Google Books");
    const book = result.items.find(
      (b) => b.cover && b.author === "Susanna Clarke",
    );
    assert(book);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`http://127.0.0.1:3000/#book/${book.id}`);
      await page
        .getByRole("heading", { name: "This edition", exact: true })
        .waitFor();
      await auditLayout(page, `Google edition ${width}`);
      await page.screenshot({
        path: `test-results/google-book-${width}.png`,
        fullPage: true,
      });
      await page.locator(".book-page-author a").first().click();
      await page.locator(".catalog-page .book-tile").first().waitFor();
      await auditLayout(page, `Google author ${width}`);
      await page.screenshot({
        path: `test-results/google-author-${width}.png`,
        fullPage: true,
      });
    }
    await page
      .getByRole("button", {
        name: "Find more editions on Google Books",
        exact: true,
      })
      .click();
    await page
      .locator(".author-page [role=status]")
      .waitFor({ timeout: 20000 });
    assert.equal(await page.locator(".author-page [role=alert]").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      "Live Google Books: edition, author navigation, author loading and six responsive checks passed.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
