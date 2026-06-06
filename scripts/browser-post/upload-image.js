const fs = require("fs");
const path = require("path");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getComposerScope(page) {
  const candidates = [
    page.locator(
      '.share-box__modal, .share-box-v2__modal, .artdeco-modal, [role="dialog"]'
    ),
    page.locator(".share-creation-state"),
    page.locator(".share-box"),
    page,
  ];

  return candidates;
}

async function waitForComposerReady(page, actionDelayMs) {
  const editorSelectors = [
    '.ql-editor[contenteditable="true"]',
    '[contenteditable="true"][role="textbox"]',
    '[data-test-ql-editor-contenteditable="true"]',
    '[aria-label="Text editor for creating content"]',
    'div[contenteditable="true"]',
  ];

  for (const selector of editorSelectors) {
    try {
      await page.locator(selector).first().waitFor({
        state: "visible",
        timeout: 15_000,
      });
      await delay(actionDelayMs);
      return page;
    } catch {
      // try next
    }
  }

  throw new Error("Post composer editor not visible.");
}


async function isMediaEditorOpen(page) {
  try {
    if (
      await page
        .getByRole("heading", { name: /^editor$/i })
        .isVisible({ timeout: 600 })
    ) {
      return true;
    }
  } catch {
    // not open
  }

  try {
    const footer = page.locator("div").filter({
      has: page.getByRole("button", { name: /^back$/i }),
      has: page.getByRole("button", { name: /^next$/i }),
    });
    if (await footer.first().isVisible({ timeout: 600 })) {
      return true;
    }
  } catch {
    // not open
  }

  return false;
}

async function clickMediaEditorNext(page, actionDelayMs) {
  console.log("  Clicking Next on LinkedIn media Editor…");

  const candidates = [
    page
      .locator('[role="dialog"]')
      .getByRole("button", { name: /^next$/i }),
    page.getByRole("button", { name: /^next$/i }),
    page
      .locator("button.artdeco-button--primary")
      .filter({ hasText: /^next$/i }),
    page.locator("button").filter({ hasText: /^next$/i }),
  ];

  for (const candidate of candidates) {
    try {
      const count = await candidate.count();
      for (let i = count - 1; i >= 0; i--) {
        const el = candidate.nth(i);
        if (!(await el.isVisible({ timeout: 500 }))) continue;

        try {
          await el.click({ timeout: 5000 });
        } catch {
          await el.click({ timeout: 5000, force: true });
        }
        await delay(actionDelayMs * 2);
        return true;
      }
    } catch {
      // try next selector
    }
  }

  return false;
}

async function hasImagePreview(page) {
  if (await isMediaEditorOpen(page)) {
    return false;
  }

  if (await isCropModalVisible(page)) {
    return false;
  }

  const composerPreviewSelectors = [
    ".share-creation-state__preview",
    ".share-box__image-preview",
    ".share-box__preview",
    ".share-creation-state__preview img",
    ".share-box__image-preview img",
    ".share-box__preview img",
    ".share-creation-state button[aria-label*='Remove' i]",
    ".share-creation-state button[aria-label*='Edit' i]",
    ".share-creation-state img[src*='blob:']",
    ".share-box-v2 img[src*='blob:']",
  ];

  for (const selector of composerPreviewSelectors) {
    try {
      if (await page.locator(selector).first().isVisible({ timeout: 300 })) {
        return true;
      }
    } catch {
      // try next
    }
  }

  return page.evaluate(() => {
    const editorOpen = [...document.querySelectorAll("h1, h2, h3, span, div")]
      .some((el) => el.textContent?.trim() === "Editor");
    if (editorOpen) return false;

    const composer =
      document.querySelector(".share-creation-state") ||
      document.querySelector(".share-box-v2") ||
      document.querySelector(".share-box__modal") ||
      document.querySelector('[data-test-modal-id="sharebox"]');

    if (!composer) return false;

    const removeBtn = composer.querySelector(
      'button[aria-label*="Remove" i], button[aria-label*="Delete" i]'
    );
    if (removeBtn) return true;

    const previewImg = composer.querySelector(
      '.share-creation-state__preview img, .share-box__image-preview img, img[src*="blob:"], img[src*="media.licdn"]'
    );
    return Boolean(previewImg);
  });
}

async function waitForImagePreview(page, maxWaitMs = 12_000) {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    if (await hasImagePreview(page)) {
      return true;
    }
    await delay(400);
  }
  return false;
}

function getCropModalScope(page) {
  return [
    page.locator(".media-editor"),
    page.locator('[class*="media-editor"]'),
    page
      .locator('[role="dialog"], .artdeco-modal')
      .filter({ has: page.locator("img, canvas, .media-editor") }),
  ];
}

async function findVisibleCropScope(page) {
  for (const candidate of getCropModalScope(page)) {
    try {
      const el = candidate.first();
      if (await el.isVisible({ timeout: 400 })) {
        return el;
      }
    } catch {
      // try next
    }
  }
  return null;
}

async function isCropModalVisible(page) {
  const cropScope = await findVisibleCropScope(page);
  if (!cropScope) return false;

  return cropScope
    .getByRole("button", { name: /^(done|next|save|apply)$/i })
    .first()
    .isVisible({ timeout: 400 })
    .catch(() => false);
}

async function clickCropModalAction(page, actionDelayMs) {
  const cropScope = await findVisibleCropScope(page);
  if (!cropScope) return false;

  const actionButtons = [
    cropScope.getByRole("button", { name: /^done$/i }),
    cropScope.getByRole("button", { name: /^next$/i }),
    cropScope.getByRole("button", { name: /^save$/i }),
    cropScope.getByRole("button", { name: /^apply$/i }),
    cropScope.locator('button[aria-label="Done"]'),
    cropScope.locator('button[aria-label="Next"]'),
    cropScope.locator('button[aria-label="Apply"]'),
    cropScope.locator(".artdeco-button--primary").filter({ hasText: /^done$/i }),
    cropScope.locator(".artdeco-button--primary").filter({ hasText: /^next$/i }),
    cropScope.locator(".artdeco-button--primary").filter({ hasText: /^apply$/i }),
  ];

  for (const button of actionButtons) {
    try {
      const el = button.first();
      if (await el.isVisible({ timeout: 500 })) {
        console.log("  Dismissing image crop/edit dialog…");
        try {
          await el.click({ timeout: 5000 });
        } catch {
          await el.click({ timeout: 5000, force: true });
        }
        await delay(actionDelayMs);
        return true;
      }
    } catch {
      // try next
    }
  }

  return false;
}

async function dismissCropFlow(page, actionDelayMs, maxSteps = 4) {
  let dismissedAny = false;

  for (let step = 0; step < maxSteps; step++) {
    if (await hasImagePreview(page)) {
      return true;
    }

    const cropVisible = await isCropModalVisible(page);
    if (!cropVisible) {
      return dismissedAny;
    }

    const clicked = await clickCropModalAction(page, actionDelayMs);
    if (!clicked) {
      return dismissedAny;
    }

    dismissedAny = true;
    console.log(`  Crop step ${step + 1} confirmed`);
    await delay(actionDelayMs);
  }

  return dismissedAny;
}

const PHOTO_BUTTON_SELECTORS = [
  '[data-control-name="add_photo"]',
  '[aria-label="Add a photo"]',
  '[aria-label*="Add a photo" i]',
  '[aria-label*="Add media" i]',
  '[aria-label*="Add an image" i]',
  'button[aria-label*="image" i]',
  ".share-box-footer__secondary-btn",
  ".share-creation-state__footer button",
  'button.share-box__item-button',
];

async function clickPhotoButton(page, scope) {
  const scopes = scope ? [scope, page] : [page];

  for (const root of scopes) {
    for (const selector of PHOTO_BUTTON_SELECTORS) {
      try {
        const el = root.locator(selector).first();
        if (await el.isVisible({ timeout: 1500 })) {
          await el.click();
          await delay(600);
          return el;
        }
      } catch {
        // try next
      }
    }

    for (const label of [/add a photo/i, /add media/i, /add an image/i]) {
      try {
        const el = root.getByRole("button", { name: label }).first();
        if (await el.isVisible({ timeout: 1500 })) {
          await el.click();
          await delay(600);
          return el;
        }
      } catch {
        // try next
      }
    }
  }

  return null;
}

async function setFilesOnAllInputs(page, absolutePath, scope) {
  const root = scope ?? page;
  const inputs = root.locator('input[type="file"]');
  const count = await inputs.count();

  for (let i = 0; i < count; i++) {
    try {
      await inputs.nth(i).setInputFiles(absolutePath, { timeout: 10_000 });
      return true;
    } catch {
      // try next input
    }
  }

  return false;
}

async function tryFileChooserUpload(page, absolutePath, scope) {
  const scopes = scope ? [scope, page] : [page];

  for (const root of scopes) {
    for (const selector of PHOTO_BUTTON_SELECTORS) {
      try {
        const button = root.locator(selector).first();
        if (!(await button.isVisible({ timeout: 1500 }))) continue;

        const [fileChooser] = await Promise.all([
          page.waitForEvent("filechooser", { timeout: 12_000 }),
          button.click(),
        ]);
        await fileChooser.setFiles(absolutePath);
        return true;
      } catch {
        // try next
      }
    }

    for (const label of [/add a photo/i, /add media/i, /add an image/i]) {
      try {
        const button = root.getByRole("button", { name: label }).first();
        if (!(await button.isVisible({ timeout: 1500 }))) continue;

        const [fileChooser] = await Promise.all([
          page.waitForEvent("filechooser", { timeout: 12_000 }),
          button.click(),
        ]);
        await fileChooser.setFiles(absolutePath);
        return true;
      } catch {
        // try next
      }
    }
  }

  return false;
}

async function tryInjectFileOnInput(page, absolutePath) {
  const buffer = fs.readFileSync(absolutePath);
  const fileName = path.basename(absolutePath);

  return page.evaluate(
    ({ bytes, name, mimeType }) => {
      function collectFileInputs(root) {
        const found = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);

        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (node instanceof HTMLInputElement && node.type === "file") {
            found.push(node);
          }
          if (node instanceof Element && node.shadowRoot) {
            found.push(...collectFileInputs(node.shadowRoot));
          }
        }

        return found;
      }

      const inputs = collectFileInputs(document);
      if (inputs.length === 0) return false;

      const file = new File([new Uint8Array(bytes)], name, { type: mimeType });
      const dt = new DataTransfer();
      dt.items.add(file);

      for (const input of inputs) {
        try {
          input.files = dt.files;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        } catch {
          // try next input
        }
      }

      return false;
    },
    {
      bytes: Array.from(buffer),
      name: fileName,
      mimeType: "image/png",
    }
  );
}

async function tryDragDropUpload(page, absolutePath) {
  const buffer = fs.readFileSync(absolutePath);
  const fileName = path.basename(absolutePath);

  return page.evaluate(
    ({ bytes, name, mimeType }) => {
      const targets = [
        document.querySelector(".ql-editor"),
        document.querySelector('[contenteditable="true"][role="textbox"]'),
        document.querySelector('[contenteditable="true"]'),
        document.querySelector(".share-box__modal"),
        document.querySelector(".share-creation-state"),
        document.querySelector('[role="dialog"]'),
      ].filter(Boolean);

      if (targets.length === 0) return false;

      const file = new File([new Uint8Array(bytes)], name, { type: mimeType });
      const dt = new DataTransfer();
      dt.items.add(file);

      for (const target of targets) {
        for (const type of ["dragenter", "dragover", "drop"]) {
          target.dispatchEvent(
            new DragEvent(type, {
              bubbles: true,
              cancelable: true,
              dataTransfer: dt,
            })
          );
        }
      }

      return true;
    },
    {
      bytes: Array.from(buffer),
      name: fileName,
      mimeType: "image/png",
    }
  );
}

async function tryCdpFileUpload(page, absolutePath) {
  try {
    const session = await page.context().newCDPSession(page);
    const { root } = await session.send("DOM.getDocument", {
      depth: -1,
      pierce: true,
    });
    const { nodeIds } = await session.send("DOM.querySelectorAll", {
      nodeId: root.nodeId,
      selector: 'input[type="file"]',
    });

    if (!nodeIds?.length) return false;

    for (const nodeId of nodeIds) {
      try {
        await session.send("DOM.setFileInputFiles", {
          files: [absolutePath],
          nodeId,
        });
        await page.evaluate(() => {
          const inputs = document.querySelectorAll('input[type="file"]');
          for (const input of inputs) {
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }
        });
        return true;
      } catch {
        // try next node
      }
    }
  } catch {
    return false;
  }

  return false;
}

async function verifyUploadSucceeded(page, actionDelayMs) {
  console.log("  Waiting for upload to finish…");

  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (await hasImagePreview(page)) {
      return true;
    }

    if (await isMediaEditorOpen(page)) {
      await clickMediaEditorNext(page, actionDelayMs);
      continue;
    }

    await dismissCropFlow(page, actionDelayMs, 1);
    await delay(400);
  }

  return hasImagePreview(page);
}

/**
 * Upload image to LinkedIn post composer — tries multiple strategies automatically.
 */
async function uploadImageToComposer(page, imagePath, options = {}) {
  const actionDelayMs = options.actionDelayMs ?? 800;
  const debugDir = options.debugDir ?? null;

  if (!imagePath || !fs.existsSync(imagePath)) {
    throw new Error(`Image file not found: ${imagePath}`);
  }

  const absolutePath = path.resolve(imagePath);
  console.log(`Uploading image: ${absolutePath}`);

  await waitForComposerReady(page, actionDelayMs);

  const scopes = getComposerScope(page);
  let scope = page;
  for (const candidate of scopes) {
    try {
      if (candidate === page) {
        scope = page;
        break;
      }
      if (await candidate.first().isVisible({ timeout: 1000 })) {
        scope = candidate.first();
        break;
      }
    } catch {
      // try next
    }
  }

  const strategies = [
    {
      name: "file chooser",
      run: async () => tryFileChooserUpload(page, absolutePath, scope),
    },
    {
      name: "photo button + file input",
      run: async () => {
        await clickPhotoButton(page, scope);
        await delay(1000);
        return (
          (await setFilesOnAllInputs(page, absolutePath, scope)) ||
          (await setFilesOnAllInputs(page, absolutePath, page))
        );
      },
    },
    {
      name: "direct file input",
      run: async () =>
        (await setFilesOnAllInputs(page, absolutePath, scope)) ||
        (await setFilesOnAllInputs(page, absolutePath, page)),
    },
    {
      name: "inject file on input",
      run: async () => tryInjectFileOnInput(page, absolutePath),
    },
    {
      name: "CDP file input",
      run: async () => tryCdpFileUpload(page, absolutePath),
    },
    {
      name: "drag and drop",
      run: async () => tryDragDropUpload(page, absolutePath),
    },
  ];

  for (const strategy of strategies) {
    console.log(`  Trying ${strategy.name}…`);
    try {
      const started = await strategy.run();
      if (!started) continue;

      if (await verifyUploadSucceeded(page, actionDelayMs)) {
        console.log(`✓ Image uploaded (${strategy.name})`);
        return true;
      }

      console.log(`  ${strategy.name} picked a file but upload did not finish`);
      break;
    } catch (error) {
      console.log(`  ${strategy.name} failed: ${error.message}`);
    }
  }

  if (debugDir) {
    fs.mkdirSync(debugDir, { recursive: true });
    const shot = path.join(debugDir, "upload-failed.png");
    const html = path.join(debugDir, "upload-failed.html");
    await page.screenshot({ path: shot, fullPage: true });
    const content = await page.content();
    fs.writeFileSync(html, content, "utf-8");
    console.log(`  Debug saved: ${shot}`);
    console.log(`  Debug saved: ${html}`);
  }

  throw new Error(
    "Automatic image upload failed. Run with DEBUG_SCREENSHOT=true for a capture."
  );
}

module.exports = {
  uploadImageToComposer,
};
