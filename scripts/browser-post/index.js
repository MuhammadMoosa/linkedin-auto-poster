/**
 * Browser login posting — same project as dashboard & content.json
 *
 *   npm run post:login     Log in once (saves linkedin-session.json)
 *   npm run post:days      List days + image status
 *   npm run post:next      Post next day with image from data/images/
 *   npm run post:day -- 3  Post day 3
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const dotenv = require("dotenv");
const { chromium } = require("playwright");
const {
  listDaysSummary,
  markDayPosted,
  resolvePostPayload,
} = require("./content");
const { uploadImageToComposer } = require("./upload-image");
const { insertPostText } = require("./composer-text");

const PROJECT_ROOT = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(PROJECT_ROOT, ".env.local") });
dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
if (nodeMajor < 18) {
  console.error(`\n✗ Node.js ${process.version} is too old. Playwright needs Node 18+.\n`);
  console.error("You already have newer Node via nvm. Run:\n");
  console.error("  source ~/.nvm/nvm.sh");
  console.error("  nvm use 20");
  console.error("  node -v          # should show v20.x");
  console.error("  npm run post:login\n");
  process.exit(1);
}

const SESSION_FILE = path.join(PROJECT_ROOT, "linkedin-session.json");
const FEED_URL = "https://www.linkedin.com/feed/";
const LOGIN_URL = "https://www.linkedin.com/login";

const ALLOW_TEXT_ONLY =
  process.env.ALLOW_TEXT_ONLY === "true" || process.env.ALLOW_TEXT_ONLY === "1";
const IMAGE_UPLOAD_TIMEOUT_MS =
  Number(process.env.IMAGE_UPLOAD_TIMEOUT_MS) || 30_000;
const ACTION_DELAY_MS = Number(process.env.ACTION_DELAY_MS) || 800;
const LOGIN_TIMEOUT_MS = Number(process.env.LOGIN_TIMEOUT_MS) || 300_000;
const SKIP_POST = process.argv.includes("--login-only");
const MANUAL_IMAGE_ONLY = process.argv.includes("--manual-image");
const DEBUG_SCREENSHOT = process.env.DEBUG_SCREENSHOT === "true";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveChromiumLaunchOptions() {
  const os = require("os");

  if (
    process.platform === "darwin" &&
    process.arch === "arm64" &&
    !process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE
  ) {
    process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE = "mac26-arm64";
  }

  const options = {
    headless: process.env.HEADLESS === "true" || process.env.HEADLESS === "1",
    slowMo: 50,
  };

  const defaultPath = chromium.executablePath();
  if (fs.existsSync(defaultPath)) {
    return options;
  }

  const cacheRoot = path.join(os.homedir(), "Library/Caches/ms-playwright");
  if (process.platform === "darwin" && fs.existsSync(cacheRoot)) {
    const chromiumDirs = fs
      .readdirSync(cacheRoot)
      .filter((entry) => entry.startsWith("chromium-"))
      .sort()
      .reverse();

    for (const dirName of chromiumDirs) {
      const candidates = [
        path.join(
          cacheRoot,
          dirName,
          "chrome-mac-arm64",
          "Google Chrome for Testing.app",
          "Contents",
          "MacOS",
          "Google Chrome for Testing"
        ),
        path.join(
          cacheRoot,
          dirName,
          "chrome-mac-x64",
          "Google Chrome for Testing.app",
          "Contents",
          "MacOS",
          "Google Chrome for Testing"
        ),
      ];

      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          console.log(`Using Chromium: ${candidate}`);
          options.executablePath = candidate;
          return options;
        }
      }
    }
  }

  return options;
}

function sessionExists() {
  return fs.existsSync(SESSION_FILE);
}

function waitForEnter(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

async function saveSession(context) {
  await context.storageState({ path: SESSION_FILE });
  console.log(`\n✓ Session saved to ${SESSION_FILE}`);
}

function parseCliOptions() {
  const args = process.argv.slice(2);

  if (args.includes("--list") || args.includes("days")) {
    return { mode: "list" };
  }

  if (args.includes("--login") || args.includes("--login-only")) {
    return { mode: "login" };
  }

  const force = args.includes("--force");
  const useNext = args.includes("--next") || process.env.POST_NEXT === "true";

  const dayFlag = args.find((arg) => arg.startsWith("--day="));
  const dayPos = args.findIndex((arg) => arg === "--day");
  let dayNumber;

  if (dayFlag) {
    dayNumber = Number.parseInt(dayFlag.split("=")[1], 10);
  } else if (dayPos >= 0 && args[dayPos + 1]) {
    dayNumber = Number.parseInt(args[dayPos + 1], 10);
  } else if (process.env.POST_DAY) {
    dayNumber = Number.parseInt(process.env.POST_DAY, 10);
  } else if (args[0] && /^\d+$/.test(args[0])) {
    dayNumber = Number.parseInt(args[0], 10);
  }

  if (Number.isNaN(dayNumber)) {
    dayNumber = undefined;
  }

  return { mode: "post", dayNumber, useNext, force };
}

async function performManualLogin(browser) {
  console.log("\n--- Manual login ---\n");
  console.log("1. Chromium opens → log in to LinkedIn (2FA if needed)");
  console.log("2. When you see your feed, press Enter here\n");

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  await delay(ACTION_DELAY_MS);

  await waitForEnter(
    "Press Enter after you are logged in and can see the LinkedIn feed… "
  );

  await page.goto(FEED_URL, {
    waitUntil: "domcontentloaded",
    timeout: LOGIN_TIMEOUT_MS,
  });
  await delay(ACTION_DELAY_MS);
  await saveSession(context);

  return context;
}

async function createAuthenticatedContext(browser) {
  if (sessionExists()) {
    console.log(`✓ Reusing saved session: ${SESSION_FILE}`);
    return browser.newContext({
      storageState: SESSION_FILE,
      viewport: { width: 1280, height: 900 },
    });
  }

  return performManualLogin(browser);
}

async function attachImageManually(page, imagePath) {
  console.log("\n--- Manual image step ---\n");
  console.log("In the LinkedIn browser window:");
  console.log('  1. Click the "Add a photo" icon in the post composer');
  console.log(`  2. Choose this file:\n     ${imagePath}\n`);

  await waitForEnter(
    "Press Enter here after the image preview appears in LinkedIn… "
  );

  return true;
}

async function publishPost(page, text, imagePath) {
  console.log("\n--- Publishing post ---\n");

  await page.goto(FEED_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await delay(ACTION_DELAY_MS * 2);

  console.log("Opening post composer…");
  const composerTriggers = [
    page.getByRole("button", { name: /start a post/i }),
    page.locator(".share-box-feed-entry__trigger"),
    page.locator('[data-placeholder="Start a post"]'),
    page.getByText("Start a post", { exact: false }),
  ];

  let composerOpened = false;
  for (const trigger of composerTriggers) {
    try {
      if (await trigger.first().isVisible({ timeout: 3000 })) {
        await trigger.first().click();
        composerOpened = true;
        break;
      }
    } catch {
      // try next
    }
  }

  if (!composerOpened) {
    throw new Error(
      "Could not find the post composer. LinkedIn UI may have changed."
    );
  }

  console.log("Waiting for composer modal…");
  try {
    await page
      .locator(
        '.share-box__modal, .share-creation-state, [role="dialog"]'
      )
      .filter({ has: page.locator('[contenteditable="true"]') })
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    console.log("  Composer modal not detected — continuing anyway");
  }

  await delay(ACTION_DELAY_MS * 2);

  console.log("Typing post text…");
  const editorSelectors = [
    page.locator('.ql-editor[contenteditable="true"]'),
    page.locator('[contenteditable="true"][role="textbox"]'),
    page.locator('[data-test-ql-editor-contenteditable="true"]'),
    page.locator('[aria-label="Text editor for creating content"]'),
    page
      .locator('div[contenteditable="true"]')
      .filter({ hasNot: page.locator("[aria-hidden]") }),
  ];

  let editor = null;
  for (const candidate of editorSelectors) {
    try {
      const el = candidate.first();
      if (await el.isVisible({ timeout: 3000 })) {
        editor = el;
        break;
      }
    } catch {
      // try next
    }
  }

  if (!editor) {
    throw new Error("Could not find the post text editor.");
  }

  await insertPostText(page, editor, text);
  await delay(ACTION_DELAY_MS);

  if (imagePath) {
    if (MANUAL_IMAGE_ONLY) {
      await attachImageManually(page, imagePath);
    } else {
      try {
        await uploadImageToComposer(page, imagePath, {
          actionDelayMs: ACTION_DELAY_MS,
          debugDir: DEBUG_SCREENSHOT
            ? path.join(PROJECT_ROOT, "debug-upload")
            : null,
        });
        await delay(ACTION_DELAY_MS * 2);
      } catch (error) {
        if (DEBUG_SCREENSHOT) {
          const shot = path.join(PROJECT_ROOT, "debug-composer.png");
          await page.screenshot({ path: shot, fullPage: true });
          console.log(`Debug screenshot saved: ${shot}`);
        }
        if (ALLOW_TEXT_ONLY) {
          console.warn(`⚠ ${error.message}`);
          console.warn("⚠ ALLOW_TEXT_ONLY=true — posting text only.");
        } else {
          throw error;
        }
      }
    }
  }

  console.log("Submitting post…");
  const postButtons = [
    page.getByRole("button", { name: /^post$/i }),
    page.locator("button.share-actions__primary-action"),
    page.locator('button[data-control-name="share_post"]'),
  ];

  let posted = false;
  for (const btn of postButtons) {
    try {
      const el = btn.first();
      if (await el.isVisible({ timeout: 3000 })) {
        await el.click();
        posted = true;
        break;
      }
    } catch {
      // try next
    }
  }

  if (!posted) {
    throw new Error("Could not find the Post button.");
  }

  await delay(ACTION_DELAY_MS * 3);
  console.log("\n✓ Post submitted successfully.\n");
}

async function main() {
  const cli = parseCliOptions();

  if (cli.mode === "list") {
    listDaysSummary();
    return;
  }

  let payload = null;

  if (cli.mode === "post" && !SKIP_POST) {
    payload = resolvePostPayload({
      dayNumber: cli.dayNumber,
      useNext: cli.useNext,
      force: cli.force,
    });
  }

  console.log("LinkedIn Playwright Publisher (browser login — no API token)\n");

  if (payload) {
    console.log(
      payload.dayNumber
        ? `Day ${payload.dayNumber}: ${payload.title}`
        : "Custom POST_TEXT"
    );
    console.log("Preview:", payload.text.slice(0, 100) + (payload.text.length > 100 ? "…" : ""));
    if (payload.imagePath) {
      console.log("Image:", payload.imagePath);
    } else if (payload.dayNumber) {
      console.log("Image: none (text-only post)");
    }
  }

  const browser = await chromium.launch(resolveChromiumLaunchOptions());

  let context;
  try {
    context = await createAuthenticatedContext(browser);

    if (cli.mode === "login" || SKIP_POST) {
      console.log("\n✓ Login complete. Session saved for future runs.");
      console.log("Next: npm run post:next\n");
      await delay(3000);
      return;
    }

    if (!payload) {
      throw new Error("Nothing to post. Use --next, --day N, or POST_TEXT in .env");
    }

    const page = await context.newPage();
    await publishPost(page, payload.text, payload.imagePath);

    if (payload.markPosted && payload.dayNumber) {
      markDayPosted(payload.content, payload.contentPath, payload.dayNumber);
      console.log(`✓ Marked day ${payload.dayNumber} as posted in content.json`);
    }

    await saveSession(context);
    console.log("Done. Browser will close in 5 seconds…");
    await delay(5000);
  } catch (error) {
    console.error("\n✗ Error:", error.message);
    if (
      error.message.includes("login") ||
      error.message.includes("session") ||
      error.message.includes("not logged")
    ) {
      console.error("\nTip: npm run post:login:fresh");
    }
    process.exitCode = 1;
    await delay(8000);
  } finally {
    if (context) await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main();
