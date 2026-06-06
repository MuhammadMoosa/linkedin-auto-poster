import { readFile, writeFile } from "fs/promises";
import path from "path";
import { logger } from "./logger";
import {
  isGitHubConfigured,
  readContentFromGitHub,
  writeContentToGitHub,
  GitHubError,
} from "./github";
import {
  appendHashtagsToPost,
  publishToLinkedIn,
  LinkedInError,
} from "./linkedin";
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

function shouldUseLocalStorage(): boolean {
  if (process.env.USE_LOCAL_STORAGE === "true") {
    return true;
  }
  return !isGitHubConfigured();
}

function parseContent(raw: string): FullContentSchema {
  try {
    const parsed = JSON.parse(raw) as FullContentSchema;

    if (!parsed.meta || !Array.isArray(parsed.days)) {
      throw new PostsError("Invalid content.json structure", 500);
    }

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

  const { content: raw, metadata } = await readContentFromGitHub();
  cachedMetadata = metadata;

  return {
    content: parseContent(raw),
    metadata,
  };
}

export async function saveContent(
  content: FullContentSchema,
  commitMessage: string
): Promise<void> {
  const serialized = serializeContent(content);

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

export function getPostedCount(content: FullContentSchema): number {
  return content.days.filter((day) => day.posted).length;
}

export function buildPreview(nextPost: DayPost): PreviewResponse {
  const formattedPreview = appendHashtagsToPost(
    nextPost.linkedinPost,
    nextPost.hashtags
  );

  return {
    day: nextPost.day,
    title: nextPost.title,
    topic: nextPost.topic,
    formattedPreview,
    hashtags: nextPost.hashtags,
    metricsHighlighted: nextPost.metricsHighlighted,
    imageSuggestion: nextPost.imageSuggestion,
    characterCount: formattedPreview.length,
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
  };
}

function updateTimelineStatus(
  content: FullContentSchema,
  day: number
): FullContentSchema {
  return {
    ...content,
    timeline: content.timeline.map((entry) =>
      entry.day === day ? { ...entry, status: "posted" as const } : entry
    ),
  };
}

export async function publishNextPost(): Promise<PublishResult> {
  const { content } = await loadContent();
  const nextPost = findNextUnpublishedPost(content);

  if (!nextPost) {
    throw new PostsError("All posts have already been published", 409);
  }

  if (nextPost.posted) {
    throw new PostsError(
      `Day ${nextPost.day} has already been posted — duplicate prevented`,
      409
    );
  }

  const fullPostText = appendHashtagsToPost(
    nextPost.linkedinPost,
    nextPost.hashtags
  );

  let linkedInResult;
  try {
    linkedInResult = await publishToLinkedIn(fullPostText);
  } catch (error) {
    if (error instanceof LinkedInError) {
      logger.publishFailure(nextPost.day, nextPost.title, error.message, error.statusCode);
      throw new PostsError(error.message, error.statusCode, error.details);
    }
    throw error;
  }

  const postedAt = new Date().toISOString();

  const updatedDays = content.days.map((day) =>
    day.day === nextPost.day
      ? {
          ...day,
          posted: true,
          postedAt,
          linkedInPostId: linkedInResult.id,
        }
      : day
  );

  let updatedContent: FullContentSchema = {
    ...content,
    days: updatedDays,
  };

  updatedContent = updateTimelineStatus(updatedContent, nextPost.day);

  try {
    await saveContent(
      updatedContent,
      `chore: publish LinkedIn post day ${nextPost.day} — ${nextPost.title}`
    );
  } catch (error) {
    logger.publishFailure(
      nextPost.day,
      nextPost.title,
      "Post published to LinkedIn but failed to save state",
      error instanceof GitHubError ? error.statusCode : 500
    );

    throw new PostsError(
      "Post was published to LinkedIn but failed to persist state. Manual reconciliation may be required.",
      500,
      {
        linkedInPostId: linkedInResult.id,
        day: nextPost.day,
        originalError: error instanceof Error ? error.message : String(error),
      }
    );
  }

  logger.publishSuccess(
    nextPost.day,
    nextPost.title,
    linkedInResult.id,
    linkedInResult.status
  );

  return {
    success: true,
    day: nextPost.day,
    title: nextPost.title,
    linkedInPostId: linkedInResult.id,
    postedAt,
    message: `Successfully published day ${nextPost.day}: ${nextPost.title}`,
  };
}

export async function getPreview(): Promise<PreviewResponse | null> {
  const { content } = await loadContent();
  const nextPost = findNextUnpublishedPost(content);

  if (!nextPost) {
    return null;
  }

  return buildPreview(nextPost);
}

export async function getStatus(): Promise<StatusResponse> {
  const { content } = await loadContent();
  return buildStatus(content);
}

export { PostsError as default, GitHubError, LinkedInError };
