import { readFile, writeFile } from "fs/promises";
import path from "path";
import { logger } from "./logger";
import {
  readContentFromGitHub,
  writeContentToGitHub,
  GitHubError,
} from "./github";
import {
  assertPersistableStorage,
  shouldUseLocalStorage,
} from "./storage";
import {
  appendHashtagsToPost,
  publishToLinkedIn,
  LinkedInError,
} from "./linkedin";
import {
  dayHasImage,
  resolveDayImage,
  saveDayImage,
  validateImageFile,
} from "./images";
import type {
  ContentFileMetadata,
  DayPost,
  FullContentSchema,
  PreviewResponse,
  PublishResult,
  StatusResponse,
} from "@/types/post";

const LOCAL_CONTENT_PATH = path.join(process.cwd(), "data", "content.json");

let cachedMetadata: ContentFileMetadata | null = null;

export class PostsError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "PostsError";
  }
}

function parseContent(raw: string): FullContentSchema {
  try {
    const parsed = JSON.parse(raw) as FullContentSchema;

    if (!parsed.meta || !Array.isArray(parsed.days)) {
      throw new PostsError("Invalid content.json structure", 500);
    }

    parsed.days = parsed.days.map((day) => ({
      ...day,
      posted: day.posted ?? false,
      postedAt: day.postedAt ?? null,
      linkedInPostId: day.linkedInPostId ?? null,
      imagePath: day.imagePath ?? null,
    }));

    return parsed;
  } catch (error) {
    if (error instanceof PostsError) throw error;
    throw new PostsError("Failed to parse content.json", 500, error);
  }
}

function serializeContent(content: FullContentSchema): string {
  return `${JSON.stringify(content, null, 2)}\n`;
}

export async function loadContent(): Promise<{
  content: FullContentSchema;
  metadata: ContentFileMetadata | null;
}> {
  if (shouldUseLocalStorage()) {
    logger.debug("Loading content from local filesystem", {
      path: LOCAL_CONTENT_PATH,
    });

    const raw = await readFile(LOCAL_CONTENT_PATH, "utf-8");
    return {
      content: parseContent(raw),
      metadata: null,
    };
  }

  if (isGitHubConfigured()) {
    const { content: raw, metadata } = await readContentFromGitHub();
    cachedMetadata = metadata;

    return {
      content: parseContent(raw),
      metadata,
    };
  }

  // Vercel/serverless without GitHub: read bundled content.json from the deploy
  try {
    logger.debug("Loading bundled content (GitHub not configured)", {
      path: LOCAL_CONTENT_PATH,
    });
    const raw = await readFile(LOCAL_CONTENT_PATH, "utf-8");
    return {
      content: parseContent(raw),
      metadata: null,
    };
  } catch (error) {
    throw new PostsError(
      "GitHub is not configured. Set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO.",
      500,
      error
    );
  }
}

export async function saveContent(
  content: FullContentSchema,
  commitMessage: string
): Promise<void> {
  const serialized = serializeContent(content);
  assertPersistableStorage("Saving content");

  if (shouldUseLocalStorage()) {
    logger.debug("Saving content to local filesystem", {
      path: LOCAL_CONTENT_PATH,
    });
    await writeFile(LOCAL_CONTENT_PATH, serialized, "utf-8");
    return;
  }

  if (!cachedMetadata?.sha) {
    const { metadata } = await readContentFromGitHub();
    cachedMetadata = metadata;
  }

  const result = await writeContentToGitHub(
    serialized,
    cachedMetadata!.sha,
    commitMessage
  );

  cachedMetadata = {
    sha: result.sha,
    path: cachedMetadata!.path,
  };
}

export function findNextUnpublishedPost(
  content: FullContentSchema
): DayPost | null {
  const sorted = [...content.days].sort((a, b) => a.day - b.day);
  return sorted.find((day) => !day.posted) ?? null;
}

export function findPostByDay(
  content: FullContentSchema,
  day: number
): DayPost | null {
  return content.days.find((entry) => entry.day === day) ?? null;
}

export function getPostedCount(content: FullContentSchema): number {
  return content.days.filter((day) => day.posted).length;
}

export function buildPreview(dayPost: DayPost): PreviewResponse {
  const formattedPreview = appendHashtagsToPost(
    dayPost.linkedinPost,
    dayPost.hashtags
  );

  const hasImage = Boolean(dayPost.imagePath);

  return {
    day: dayPost.day,
    title: dayPost.title,
    topic: dayPost.topic,
    formattedPreview,
    hashtags: dayPost.hashtags,
    metricsHighlighted: dayPost.metricsHighlighted ?? [],
    imageSuggestion: dayPost.imageSuggestion,
    characterCount: formattedPreview.length,
    phase: dayPost.phase,
    category: dayPost.category,
    posted: dayPost.posted,
    postedAt: dayPost.postedAt,
    hasImage,
    imagePreviewUrl: hasImage ? `/api/images/${dayPost.day}` : null,
  };
}

export async function buildPreviewAsync(
  dayPost: DayPost
): Promise<PreviewResponse> {
  const preview = buildPreview(dayPost);
  const hasImage = await dayHasImage(dayPost.day, dayPost.imagePath);
  return {
    ...preview,
    hasImage,
    imagePreviewUrl: hasImage ? `/api/images/${dayPost.day}` : null,
  };
}

export function buildStatus(content: FullContentSchema): StatusResponse {
  const totalPosts = content.days.length;
  const postedCount = getPostedCount(content);
  const remainingCount = totalPosts - postedCount;
  const nextScheduledPost = findNextUnpublishedPost(content);

  return {
    totalPosts,
    postedCount,
    remainingCount,
    completionPercentage:
      totalPosts > 0 ? Math.round((postedCount / totalPosts) * 100) : 0,
    nextScheduledPost,
    campaignComplete: remainingCount === 0,
    meta: content.meta,
    summaryStats: content.summaryStats,
  };
}

async function persistPostedDay(
  content: FullContentSchema,
  day: number,
  postedAt: string,
  linkedInPostId: string | null,
  commitMessage: string
): Promise<FullContentSchema> {
  const updatedDays = content.days.map((entry) =>
    entry.day === day
      ? {
          ...entry,
          posted: true,
          postedAt,
          linkedInPostId,
        }
      : entry
  );

  const updatedContent: FullContentSchema = {
    ...content,
    days: updatedDays,
  };

  await saveContent(updatedContent, commitMessage);
  return updatedContent;
}

export async function setDayImagePath(
  dayNumber: number,
  imagePath: string
): Promise<void> {
  const { content } = await loadContent();
  const targetPost = findPostByDay(content, dayNumber);

  if (!targetPost) {
    throw new PostsError(`Day ${dayNumber} not found`, 404);
  }

  const updatedDays = content.days.map((entry) =>
    entry.day === dayNumber ? { ...entry, imagePath } : entry
  );

  await saveContent(
    { ...content, days: updatedDays },
    `chore: attach image for day ${dayNumber}`
  );
}

export async function uploadDayImage(
  dayNumber: number,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  validateImageFile(buffer, mimeType);

  const { content } = await loadContent();
  const targetPost = findPostByDay(content, dayNumber);

  if (!targetPost) {
    throw new PostsError(`Day ${dayNumber} not found`, 404);
  }

  const imagePath = await saveDayImage(dayNumber, buffer, mimeType);
  await setDayImagePath(dayNumber, imagePath);

  logger.info("Day image saved", { day: dayNumber, imagePath });

  return imagePath;
}

export async function publishPostByDay(
  dayNumber?: number,
  options?: { imageBuffer?: Buffer; mimeType?: string; requireImage?: boolean }
): Promise<PublishResult> {
  const { content } = await loadContent();

  const targetPost = dayNumber
    ? findPostByDay(content, dayNumber)
    : findNextUnpublishedPost(content);

  if (!targetPost) {
    if (dayNumber) {
      throw new PostsError(`Day ${dayNumber} not found`, 404);
    }
    throw new PostsError("All posts have already been published", 409);
  }

  if (targetPost.posted) {
    throw new PostsError(
      `Day ${targetPost.day} has already been posted — duplicate prevented`,
      409
    );
  }

  const fullPostText = appendHashtagsToPost(
    targetPost.linkedinPost,
    targetPost.hashtags
  );

  let imageBuffer = options?.imageBuffer;
  let mimeType = options?.mimeType;

  if (!imageBuffer) {
    const resolved = await resolveDayImage(
      targetPost.day,
      targetPost.imagePath
    );
    if (resolved) {
      imageBuffer = resolved.buffer;
      mimeType = resolved.mimeType;
    }
  }

  if (options?.requireImage && !imageBuffer) {
    throw new PostsError(
      `Day ${targetPost.day} requires an image. Upload one before publishing.`,
      400
    );
  }

  let linkedInResult;
  try {
    linkedInResult = await publishToLinkedIn(fullPostText, {
      imageBuffer,
      mimeType,
    });
  } catch (error) {
    if (error instanceof LinkedInError) {
      logger.publishFailure(
        targetPost.day,
        targetPost.title,
        error.message,
        error.statusCode
      );
      throw new PostsError(error.message, error.statusCode, error.details);
    }
    throw error;
  }

  const postedAt = new Date().toISOString();

  try {
    await persistPostedDay(
      content,
      targetPost.day,
      postedAt,
      linkedInResult.id,
      `chore: publish LinkedIn post day ${targetPost.day} — ${targetPost.title}`
    );
  } catch (error) {
    logger.publishFailure(
      targetPost.day,
      targetPost.title,
      "Post published to LinkedIn but failed to save state",
      error instanceof GitHubError ? error.statusCode : 500
    );

    throw new PostsError(
      "Post was published to LinkedIn but failed to persist state. Manual reconciliation may be required.",
      500,
      {
        linkedInPostId: linkedInResult.id,
        day: targetPost.day,
        originalError: error instanceof Error ? error.message : String(error),
      }
    );
  }

  logger.publishSuccess(
    targetPost.day,
    targetPost.title,
    linkedInResult.id,
    linkedInResult.status
  );

  return {
    success: true,
    day: targetPost.day,
    title: targetPost.title,
    linkedInPostId: linkedInResult.id,
    postedAt,
    hasImage: linkedInResult.hasImage,
    message: `Successfully published day ${targetPost.day}: ${targetPost.title}${linkedInResult.hasImage ? " (with image)" : ""}`,
  };
}

export async function markPostAsPosted(dayNumber: number): Promise<PublishResult> {
  const { content } = await loadContent();
  const targetPost = findPostByDay(content, dayNumber);

  if (!targetPost) {
    throw new PostsError(`Day ${dayNumber} not found`, 404);
  }

  if (targetPost.posted) {
    throw new PostsError(`Day ${dayNumber} is already marked as posted`, 409);
  }

  const postedAt = new Date().toISOString();

  await persistPostedDay(
    content,
    dayNumber,
    postedAt,
    "manual",
    `chore: manually mark day ${dayNumber} as posted — ${targetPost.title}`
  );

  logger.info("Post marked as manually posted", {
    day: dayNumber,
    title: targetPost.title,
  });

  return {
    success: true,
    day: dayNumber,
    title: targetPost.title,
    postedAt,
    manual: true,
    message: `Day ${dayNumber} marked as posted (manual)`,
  };
}

export async function publishNextPost(): Promise<PublishResult> {
  return publishPostByDay();
}

export async function getPreview(dayNumber?: number): Promise<PreviewResponse | null> {
  const { content } = await loadContent();

  const targetPost = dayNumber
    ? findPostByDay(content, dayNumber)
    : findNextUnpublishedPost(content);

  if (!targetPost) {
    return null;
  }

  return buildPreviewAsync(targetPost);
}

export async function getAllDayPreviews(): Promise<PreviewResponse[]> {
  const { content } = await loadContent();
  const sorted = [...content.days].sort((a, b) => a.day - b.day);
  return Promise.all(sorted.map((day) => buildPreviewAsync(day)));
}

export async function getStatus(): Promise<StatusResponse> {
  const { content } = await loadContent();
  return buildStatus(content);
}
