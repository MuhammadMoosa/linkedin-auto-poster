const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_CONTENT_JSON = path.join(PROJECT_ROOT, "data/content.json");

function getContentPath() {
  return process.env.CONTENT_JSON
    ? path.resolve(process.env.CONTENT_JSON)
    : DEFAULT_CONTENT_JSON;
}

function loadContent() {
  const contentPath = getContentPath();
  if (!fs.existsSync(contentPath)) {
    throw new Error(`Content file not found: ${contentPath}`);
  }

  const raw = fs.readFileSync(contentPath, "utf-8");
  const content = JSON.parse(raw);

  if (!Array.isArray(content.days)) {
    throw new Error("Invalid content.json — missing days array");
  }

  return { content, contentPath };
}

function saveContent(content, contentPath) {
  fs.writeFileSync(contentPath, `${JSON.stringify(content, null, 2)}\n`, "utf-8");
}

function resolveImagePath(dayEntry, contentPath) {
  if (!dayEntry.imagePath) return null;

  const projectRoot = path.resolve(path.dirname(contentPath), "..");
  const absolute = path.resolve(projectRoot, dayEntry.imagePath);

  return fs.existsSync(absolute) ? absolute : null;
}

function findDay(content, dayNumber) {
  return content.days.find((entry) => entry.day === dayNumber) ?? null;
}

function findNextUnpublished(content) {
  return (
    [...content.days]
      .sort((a, b) => a.day - b.day)
      .find((entry) => !entry.posted) ?? null
  );
}

function markDayPosted(content, contentPath, dayNumber) {
  const updatedDays = content.days.map((entry) =>
    entry.day === dayNumber
      ? {
          ...entry,
          posted: true,
          postedAt: new Date().toISOString(),
          linkedInPostId: "playwright",
        }
      : entry
  );

  saveContent({ ...content, days: updatedDays }, contentPath);
}

function listDaysSummary() {
  const { content, contentPath } = loadContent();
  const sorted = [...content.days].sort((a, b) => a.day - b.day);

  console.log(`\nProject: ${PROJECT_ROOT}`);
  console.log(`Content: ${contentPath}`);
  console.log(`Campaign: ${content.meta?.title ?? "LinkedIn series"}\n`);

  for (const entry of sorted) {
    const status = entry.posted ? "posted" : "pending";
    let imageLabel = "no image";
    if (entry.imagePath) {
      imageLabel = resolveImagePath(entry, contentPath) ? "image" : "MISSING";
    }
    console.log(
      `  Day ${String(entry.day).padStart(2, " ")}  [${status.padEnd(7)}]  [${imageLabel.padEnd(7)}]  ${entry.title}`
    );
  }

  const next = findNextUnpublished(content);
  console.log(
    next
      ? `\nNext up: Day ${next.day} — ${next.title}\n`
      : "\nAll days marked as posted.\n"
  );
}

function resolvePostPayload(options = {}) {
  const { dayNumber, useNext, force = false } = options;

  if (process.env.POST_TEXT?.trim()) {
    return {
      text: process.env.POST_TEXT.trim(),
      dayNumber: null,
      imagePath: process.env.IMAGE_PATH
        ? path.resolve(process.env.IMAGE_PATH)
        : null,
      markPosted: false,
    };
  }

  const { content, contentPath } = loadContent();
  const target = dayNumber
    ? findDay(content, dayNumber)
    : useNext
      ? findNextUnpublished(content)
      : null;

  if (dayNumber && !target) {
    throw new Error(`Day ${dayNumber} not found in content.json`);
  }

  if (useNext && !target) {
    throw new Error("All days are already marked as posted in content.json");
  }

  if (!target) {
    throw new Error("Use --next, --day N, or POST_TEXT in .env");
  }

  if (target.posted && !force) {
    throw new Error(
      `Day ${target.day} is already marked as posted. Use --force to post again.`
    );
  }

  return {
    text: target.linkedinPost.trim(),
    dayNumber: target.day,
    title: target.title,
    imagePath: resolveImagePath(target, contentPath),
    markPosted: !target.posted,
    content,
    contentPath,
  };
}

module.exports = {
  listDaysSummary,
  markDayPosted,
  resolvePostPayload,
};
