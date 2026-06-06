function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getEditorTextLength(editor) {
  return editor.evaluate((el) => (el.textContent || el.innerText || "").trim().length);
}

async function insertViaPasteEvent(editor, text) {
  return editor.evaluate((el, content) => {
    el.focus();

    const dt = new DataTransfer();
    dt.setData("text/plain", content);
    const handled = el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      })
    );

    if (!handled) {
      const paragraphs = content.split("\n");
      el.innerHTML = paragraphs
        .map((line) => `<p>${line || "<br>"}</p>`)
        .join("");
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: content }));
    }

    return (el.textContent || el.innerText || "").trim().length;
  }, text);
}

async function insertViaClipboard(page, editor, text) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(async (content) => {
    await navigator.clipboard.writeText(content);
  }, text);

  await editor.click();
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.press(`${mod}+KeyA`);
  await page.keyboard.press("Backspace");
  await page.keyboard.press(`${mod}+KeyV`);
  await delay(400);

  return getEditorTextLength(editor);
}

async function insertViaKeyboard(page, editor, text) {
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  await editor.click();
  await page.keyboard.press(`${mod}+KeyA`);
  await page.keyboard.press("Backspace");
  await page.keyboard.insertText(text);
  await delay(400);

  return getEditorTextLength(editor);
}

async function insertViaQuillHtml(editor, text) {
  return editor.evaluate((el, content) => {
    el.focus();
    const paragraphs = content.split("\n");
    el.innerHTML = paragraphs
      .map((line) => `<p>${line || "<br>"}</p>`)
      .join("");
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return (el.textContent || el.innerText || "").trim().length;
  }, text);
}

/**
 * Insert post text into LinkedIn's Quill editor.
 * Playwright fill() often hangs on contenteditable — use multiple strategies.
 */
async function insertPostText(page, editor, text) {
  const minChars = Math.min(20, Math.floor(text.length * 0.1));
  console.log(`  Inserting ${text.length} characters into composer…`);

  const strategies = [
    { name: "paste event", run: () => insertViaPasteEvent(editor, text) },
    { name: "clipboard", run: () => insertViaClipboard(page, editor, text) },
    { name: "keyboard", run: () => insertViaKeyboard(page, editor, text) },
    { name: "quill html", run: () => insertViaQuillHtml(editor, text) },
  ];

  for (const strategy of strategies) {
    try {
      console.log(`  Trying text insert: ${strategy.name}…`);
      const length = await Promise.race([
        strategy.run(),
        delay(15_000).then(() => {
          throw new Error("timed out");
        }),
      ]);

      if (length >= minChars) {
        console.log(`  ✓ Text inserted (${strategy.name}, ${length} chars)`);
        return true;
      }

      console.log(`  ${strategy.name} only got ${length} chars`);
    } catch (error) {
      console.log(`  ${strategy.name} failed: ${error.message}`);
    }
  }

  throw new Error("Could not insert post text into LinkedIn composer.");
}

module.exports = {
  insertPostText,
};
