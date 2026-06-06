import { logger } from "./logger";

const LINKEDIN_UGC_POSTS_URL = "https://api.linkedin.com/v2/ugcPosts";
const MAX_RETRIES = 3;
const LINKEDIN_MAX_TEXT_LENGTH = 3000;

export class LinkedInError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "LinkedInError";
  }
}

export interface LinkedInPublishResponse {
  id: string;
  status: number;
}

function getLinkedInConfig() {
  const token = process.env.LINKEDIN_TOKEN;
  const personId = process.env.LINKEDIN_PERSON_ID;

  if (!token) {
    throw new LinkedInError("LINKEDIN_TOKEN is not configured", 500);
  }

  if (!personId) {
    throw new LinkedInError("LINKEDIN_PERSON_ID is not configured", 500);
  }

  return { token, personId };
}

export function validatePostText(text: string): void {
  if (!text || text.trim().length === 0) {
    throw new LinkedInError("Post text cannot be empty", 400);
  }

  if (text.length > LINKEDIN_MAX_TEXT_LENGTH) {
    throw new LinkedInError(
      `Post text exceeds LinkedIn limit of ${LINKEDIN_MAX_TEXT_LENGTH} characters (${text.length} provided)`,
      400
    );
  }
}

function buildAuthorUrn(personId: string): string {
  const normalizedId = personId.startsWith("urn:li:person:")
    ? personId
    : `urn:li:person:${personId}`;
  return normalizedId;
}

function buildPostPayload(text: string, personId: string) {
  return {
    author: buildAuthorUrn(personId),
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: {
          text,
        },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429 || response.status >= 500) {
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn(`LinkedIn API retry ${attempt}/${maxRetries}`, {
          status: response.status,
          delayMs: delay,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const delay = Math.pow(2, attempt) * 1000;
      logger.warn(`LinkedIn fetch error, retry ${attempt}/${maxRetries}`, {
        error: lastError.message,
        delayMs: delay,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error("LinkedIn API request failed after retries");
}

export async function publishToLinkedIn(
  text: string
): Promise<LinkedInPublishResponse> {
  validatePostText(text);

  const { token, personId } = getLinkedInConfig();
  const payload = buildPostPayload(text, personId);

  logger.info("Publishing to LinkedIn", {
    textLength: text.length,
    author: buildAuthorUrn(personId),
  });

  const response = await fetchWithRetry(LINKEDIN_UGC_POSTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let details: unknown;
    try {
      details = await response.json();
    } catch {
      details = await response.text();
    }

    throw new LinkedInError(
      `LinkedIn API error: ${response.statusText}`,
      response.status,
      details
    );
  }

  const postId = response.headers.get("x-restli-id") ?? "unknown";

  logger.info("LinkedIn post published", {
    postId,
    status: response.status,
  });

  return {
    id: postId,
    status: response.status,
  };
}

export function formatHashtags(hashtags: string[]): string {
  return hashtags
    .map((tag) => {
      const trimmed = tag.trim();
      if (!trimmed) return "";
      return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    })
    .filter(Boolean)
    .join(" ");
}

export function appendHashtagsToPost(
  postText: string,
  hashtags: string[]
): string {
  const formattedHashtags = formatHashtags(hashtags);
  if (!formattedHashtags) {
    return postText.trim();
  }

  const baseText = postText.trim();
  const combined = `${baseText}\n\n${formattedHashtags}`;

  validatePostText(combined);
  return combined;
}
