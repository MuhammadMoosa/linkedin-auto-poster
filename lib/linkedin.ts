import { logger } from "./logger";

const LINKEDIN_UGC_POSTS_URL = "https://api.linkedin.com/v2/ugcPosts";
const LINKEDIN_REGISTER_UPLOAD_URL =
  "https://api.linkedin.com/v2/assets?action=registerUpload";
const MAX_RETRIES = 3;
const LINKEDIN_MAX_TEXT_LENGTH = 3000;

function formatLinkedInDetails(details: unknown): string {
  if (!details) return "";
  if (typeof details === "object" && details !== null) {
    const record = details as Record<string, unknown>;
    if (typeof record.message === "string") return ` — ${record.message}`;
    if (typeof record.error_description === "string") {
      return ` — ${record.error_description}`;
    }
  }
  if (typeof details === "string" && details.length < 120) {
    return ` — ${details}`;
  }
  return "";
}

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
  hasImage: boolean;
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

function buildPostPayload(
  text: string,
  personId: string,
  imageAssetUrn?: string
) {
  const shareContent: Record<string, unknown> = {
    shareCommentary: { text },
    shareMediaCategory: imageAssetUrn ? "IMAGE" : "NONE",
  };

  if (imageAssetUrn) {
    shareContent.media = [
      {
        status: "READY",
        media: imageAssetUrn,
      },
    ];
  }

  return {
    author: buildAuthorUrn(personId),
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": shareContent,
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

interface RegisterUploadResponse {
  value: {
    uploadMechanism: {
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
        uploadUrl: string;
        headers: Record<string, string>;
      };
    };
    asset: string;
  };
}

export async function uploadImageToLinkedIn(
  imageBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const { token, personId } = getLinkedInConfig();
  const owner = buildAuthorUrn(personId);

  logger.info("Registering LinkedIn image upload", {
    sizeBytes: imageBuffer.length,
    mimeType,
  });

  const registerResponse = await fetchWithRetry(LINKEDIN_REGISTER_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner,
        serviceRelationships: [
          {
            relationshipType: "OWNER",
            identifier: "urn:li:userGeneratedContent",
          },
        ],
      },
    }),
  });

  if (!registerResponse.ok) {
    let details: unknown;
    try {
      details = await registerResponse.json();
    } catch {
      details = await registerResponse.text();
    }
    throw new LinkedInError(
      "Failed to register LinkedIn image upload",
      registerResponse.status,
      details
    );
  }

  const registerData = (await registerResponse.json()) as RegisterUploadResponse;
  const uploadMechanism =
    registerData.value.uploadMechanism[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ];
  const assetUrn = registerData.value.asset;

  const uploadResponse = await fetchWithRetry(uploadMechanism.uploadUrl, {
    method: "PUT",
    headers: {
      ...uploadMechanism.headers,
      "Content-Type": mimeType,
    },
    body: new Uint8Array(imageBuffer),
  });

  if (!uploadResponse.ok) {
    const details = await uploadResponse.text();
    throw new LinkedInError(
      "Failed to upload image binary to LinkedIn",
      uploadResponse.status,
      details
    );
  }

  logger.info("LinkedIn image uploaded", { assetUrn });

  return assetUrn;
}

export async function publishToLinkedIn(
  text: string,
  options?: { imageBuffer?: Buffer; mimeType?: string }
): Promise<LinkedInPublishResponse> {
  validatePostText(text);

  const { token, personId } = getLinkedInConfig();
  let imageAssetUrn: string | undefined;

  if (options?.imageBuffer && options.mimeType) {
    imageAssetUrn = await uploadImageToLinkedIn(
      options.imageBuffer,
      options.mimeType
    );
  }

  const payload = buildPostPayload(text, personId, imageAssetUrn);

  logger.info("Publishing to LinkedIn", {
    textLength: text.length,
    author: buildAuthorUrn(personId),
    hasImage: Boolean(imageAssetUrn),
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
      `LinkedIn API error: ${response.statusText}${formatLinkedInDetails(details)}`,
      response.status,
      details
    );
  }

  const postId = response.headers.get("x-restli-id") ?? "unknown";

  logger.info("LinkedIn post published", {
    postId,
    status: response.status,
    hasImage: Boolean(imageAssetUrn),
  });

  return {
    id: postId,
    status: response.status,
    hasImage: Boolean(imageAssetUrn),
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
  const baseText = postText.trim();

  const missingTags = hashtags.filter((tag) => {
    const normalized = tag.trim().startsWith("#")
      ? tag.trim()
      : `#${tag.trim()}`;
    return !baseText.toLowerCase().includes(normalized.toLowerCase());
  });

  const formattedHashtags = formatHashtags(missingTags);
  if (!formattedHashtags) {
    return baseText;
  }

  const combined = `${baseText}\n\n${formattedHashtags}`;

  validatePostText(combined);
  return combined;
}
