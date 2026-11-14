const assert = require("node:assert/strict");
// Inspect populated screens, not just the document width: a narrow card can clip
// content while the overall page still fits. Cover typography is intentionally
// abbreviated; the full book title is always rendered beside/below it.
async function auditLayout(page, label) {
  await page.evaluate(() => document.fonts.ready);
  const findings = await page.evaluate(() => {
    const issues = [];
    const visible = (e) =>
      e.getClientRects().length && getComputedStyle(e).visibility !== "hidden";
    const name = (e) =>
      e.tagName.toLowerCase() + "." + String(e.className).replaceAll(" ", ".");
    if (document.documentElement.scrollWidth > innerWidth + 1)
      issues.push("page overflows viewport");
    const boxes =
      ".view-panel,.post-card,.book-tile,.rail-card,.compose-card,.book-dialog,.library-tabs,.post-actions,.person-info,.profile-hero,.post-author,.shelf-link,.compose-placeholder,.mobile-nav,.list-summary,.list-fields,.list-picker,.list-actions";
    for (const e of document.querySelectorAll(boxes)) {
      if (!visible(e)) continue;
      if (e.scrollWidth > e.clientWidth + 2)
        issues.push(name(e) + " has horizontal clipping");
    }
    for (const card of document.querySelectorAll(
      ".book-tile,.post-card,.rail-card,.view-panel,.compose-card",
    )) {
      const r = card.getBoundingClientRect(),
        s = getComputedStyle(card);
      const left = r.left + parseFloat(s.paddingLeft),
        right = r.right - parseFloat(s.paddingRight);
      for (const el of card.querySelectorAll(
        "h2,h3,h4,p,button,input,textarea,select,.real-cover,.paper-cover",
      )) {
        if (!visible(el)) continue;
        const b = el.getBoundingClientRect();
        if (b.left < left - 2 || b.right > right + 2)
          issues.push(name(el) + " escapes card padding");
      }
    }
    for (const group of document.querySelectorAll(
      ".book-grid,.library-tabs,.post-actions,.post-head,.compose-top,.compose-bottom,.profile-hero,.topbar,.top-actions,.mobile-nav",
    )) {
      const children = [...group.children].filter(visible);
      for (let i = 0; i < children.length; i++)
        for (let j = i + 1; j < children.length; j++) {
          const a = children[i].getBoundingClientRect(),
            b = children[j].getBoundingClientRect();
          if (
            Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2
          )
            issues.push(name(children[i]) + " overlaps " + name(children[j]));
        }
    }
    const dialog = document.querySelector("dialog[open]");
    if (dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        r.left < 0 ||
        r.right > innerWidth + 1 ||
        r.top < 0 ||
        r.bottom > innerHeight + 1
      )
        issues.push("dialog escapes viewport");
      const close = dialog
          .querySelector(".app-dialog-close")
          .getBoundingClientRect(),
        heading = dialog.querySelector("h2")?.getBoundingClientRect();
      if (heading && close.bottom > heading.top + 1)
        issues.push("dialog close overlaps title");
    }
    const nav = document.querySelector(".mobile-nav");
    if (
      visible(nav) &&
      parseFloat(
        getComputedStyle(document.querySelector(".main-content")).paddingBottom,
      ) <
        nav.clientHeight + 16
    )
      issues.push("missing bottom navigation clearance");
    return [...new Set(issues)];
  });
  assert.deepEqual(findings, [], label);
}
module.exports = { auditLayout };
