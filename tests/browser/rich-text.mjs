import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(
  `${process.env.QA_BASE_URL || "http://127.0.0.1:5173"}/tests/browser/rich-text.html`,
);
let box = page.getByRole("textbox", { name: "Descripción", exact: true });
await box.waitFor();
await page.getByRole("button", { name: "Guardar", exact: true }).click();
assert.equal(
  await page.evaluate(() => localStorage.getItem("rich-qa")),
  "  Texto antiguo <b>literal</b>\nwww.example.com  ",
);
await page.getByRole("button", { name: "Editar", exact: true }).click();
await box.fill(
  "Instrucciones completas\nhttps://example.com/path?a=1&b=2\nwww.example.org\nhttp://example.net.\nRoles de Karma Social",
);
await box.press("End");
await box.press("Space");
await page.getByRole("button", { name: "Guardar", exact: true }).click();
assert.equal(await page.locator(".karma-rich-content a").count(), 3);
await page.getByRole("button", { name: "Editar", exact: true }).click();
// Select exact custom text using DOM selection, then the actual shortcut.
async function selectText(text) {
  await box.evaluate((el, text) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = w.nextNode())) {
      const i = node.textContent.indexOf(text);
      if (i >= 0) {
        const r = document.createRange();
        r.setStart(node, i);
        r.setEnd(node, i + text.length);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
        el.focus();
        return;
      }
    }
    throw new Error("text not found");
  }, text);
}
await selectText("Roles de Karma Social");
await box.press("Meta+k");
await page
  .getByRole("textbox", { name: "Dirección del enlace" })
  .fill("www.example.com/roles");
await page.getByRole("button", { name: "Aplicar", exact: true }).click();
assert.equal(
  await box
    .getByRole("link", { name: "Roles de Karma Social" })
    .getAttribute("href"),
  "https://www.example.com/roles",
);
await selectText("Roles de Karma Social");
await page.getByRole("button", { name: "Negrita", exact: true }).click();
assert.equal(await box.locator("strong").innerText(), "Roles de Karma Social");
await page.getByRole("button", { name: "Guardar", exact: true }).click();
await page.reload();
assert.equal(
  await box
    .getByRole("link", { name: "Roles de Karma Social" })
    .getAttribute("href"),
  "https://www.example.com/roles",
);
await selectText("Roles de Karma Social");
await box.press("Control+k");
await page
  .getByRole("textbox", { name: "Dirección del enlace" })
  .fill("javascript:alert(1)");
await page.getByRole("button", { name: "Aplicar", exact: true }).click();
assert.equal(await page.getByRole("alert").count(), 1);
await page
  .getByRole("textbox", { name: "Dirección del enlace" })
  .fill("https://example.com/edited");
await page.getByRole("button", { name: "Aplicar", exact: true }).click();
await selectText("Roles de Karma Social");
await box.press("Meta+k");
await page.getByRole("button", { name: "Quitar", exact: true }).click();
assert.equal(
  await box.getByRole("link", { name: "Roles de Karma Social" }).count(),
  0,
);
// Exercise real paste handlers with a multi-link plain-text clipboard and hostile HTML.
await box.fill("");
await box.evaluate((el) => {
  const d = new DataTransfer();
  d.setData(
    "text/plain",
    "Uno https://example.com\nDos www.example.org\nTres http://example.net.",
  );
  el.dispatchEvent(
    new ClipboardEvent("paste", {
      clipboardData: d,
      bubbles: true,
      cancelable: true,
    }),
  );
});
assert.equal(await box.locator("a").count(), 3);
await box.press("End");
await box.evaluate((el) => {
  const d = new DataTransfer();
  d.setData(
    "text/html",
    '<p onclick="window.bad=1"><b>Documento</b><a href="javascript:alert(1)">Malo</a><img src=x onerror="window.bad=1"><script>window.bad=1</script><a href="https://example.com/doc">Documento enlazado</a></p>',
  );
  el.dispatchEvent(
    new ClipboardEvent("paste", {
      clipboardData: d,
      bubbles: true,
      cancelable: true,
    }),
  );
});
assert.equal(
  await box.locator('script,img,[onclick],a[href^="javascript:"]').count(),
  0,
);
assert.equal(
  await box.getByRole("link", { name: "Documento enlazado" }).count(),
  1,
);
for (const width of [1440, 768, 390, 320]) {
  await page.setViewportSize({ width, height: 844 });
  await selectText("Documento");
  await box.press("Meta+k");
  await page.screenshot({
    path: `${process.env.QA_SCREENSHOT_DIR || "/tmp"}/editor-${width}.png`,
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
}
const editorPopup = page.waitForEvent("popup");
await box.getByRole("link", { name: "Documento enlazado" }).click();
const editorTab = await editorPopup;
assert.equal(await editorTab.evaluate(() => window.opener === null), true);
await editorTab.close();
await selectText("https://example.com");
await box.press("Meta+k");
await page.getByRole("button", { name: "Quitar", exact: true }).click();
await page.getByRole("button", { name: "Guardar", exact: true }).click();
assert.equal(
  await page
    .getByRole("link", { name: "https://example.com", exact: true })
    .count(),
  0,
);
await page.reload();
assert.equal(
  await box
    .getByRole("link", { name: "https://example.com", exact: true })
    .count(),
  0,
);
await page.getByRole("button", { name: "Guardar", exact: true }).click();
const popup = page.waitForEvent("popup");
await page.getByRole("link", { name: "Documento enlazado" }).click();
const tab = await popup;
assert.equal(await tab.evaluate(() => window.opener === null), true);
await tab.close();
assert.deepEqual(errors, []);
console.log(
  "PASS: exact legacy save, multi-URL typing/paste, custom links add/edit/remove, Cmd/Ctrl+K, unsafe input, HTML paste, persistence, bold, safe opening, 1440/768/390/320 no overflow.",
);
await browser.close();
