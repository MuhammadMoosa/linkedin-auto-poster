import { logger } from "./logger";
import type { ContentFileMetadata } from "@/types/post";

const DEFAULT_CONTENT_PATH = "data/content.json";
const GITHUB_API_BASE = "https://api.github.com";

export class GitHubError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

function getGitHubConfig() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const path = process.env.GITHUB_CONTENT_PATH ?? DEFAULT_CONTENT_PATH;
  const branch = process.env.GITHUB_BRANCH ?? "main";

  if (!token || !owner || !repo) {
    return null;
  }

  return { token, owner, repo, path, branch };
}

function getGitHubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "linkedin-auto-poster",
  };
}

interface GitHubContentResponse {
  name: string;
  path: string;
  sha: string;
  size: number;
  content: string;
  encoding: string;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429 || response.status >= 500) {
        const delay = Math.pow(2, attempt) * 500;
        logger.warn(`GitHub API retry ${attempt}/${maxRetries}`, {
          status: response.status,
          delayMs: delay,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const delay = Math.pow(2, attempt) * 500;
      logger.warn(`GitHub fetch error, retry ${attempt}/${maxRetries}`, {
        error: lastError.message,
        delayMs: delay,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error("GitHub API request failed after retries");
}

export function isGitHubConfigured(): boolean {
  return getGitHubConfig() !== null;
}

export async function readContentFromGitHub(): Promise<{
  content: string;
  metadata: ContentFileMetadata;
}> {
  const config = getGitHubConfig();
  if (!config) {
    throw new GitHubError(
      "GitHub is not configured. Set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO.",
      500
    );
  }

  const url = `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/contents/${config.path}?ref=${config.branch}`;

  logger.debug("Reading content from GitHub", { path: config.path });

  const response = await fetchWithRetry(url, {
    method: "GET",
    headers: getGitHubHeaders(config.token),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new GitHubError(
      `Failed to read content from GitHub: ${response.statusText}`,
      response.status,
      details
    );
  }

  const data = (await response.json()) as GitHubContentResponse;

  if (data.encoding !== "base64") {
    throw new GitHubError("Unexpected GitHub content encoding", 500, data);
  }

  const content = Buffer.from(data.content, "base64").toString("utf-8");

  return {
    content,
    metadata: { sha: data.sha, path: data.path },
  };
}

export async function writeContentToGitHub(
  content: string,
  sha: string,
  commitMessage: string
): Promise<{ sha: string; commitSha: string }> {
  const config = getGitHubConfig();
  if (!config) {
    throw new GitHubError(
      "GitHub is not configured. Set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO.",
      500
    );
  }

  const url = `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/contents/${config.path}`;

  logger.debug("Writing content to GitHub", {
    path: config.path,
    commitMessage,
  });

  const response = await fetchWithRetry(url, {
    method: "PUT",
    headers: {
      ...getGitHubHeaders(config.token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: commitMessage,
      content: Buffer.from(content, "utf-8").toString("base64"),
      sha,
      branch: config.branch,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new GitHubError(
      `Failed to write content to GitHub: ${response.statusText}`,
      response.status,
      details
    );
  }

  const result = (await response.json()) as {
    content: { sha: string };
    commit: { sha: string };
  };

  logger.info("Content saved to GitHub", {
    fileSha: result.content.sha,
    commitSha: result.commit.sha,
  });

  return {
    sha: result.content.sha,
    commitSha: result.commit.sha,
  };
}
