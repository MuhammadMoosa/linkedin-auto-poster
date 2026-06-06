import { isGitHubConfigured } from "./github";

/**
 * Deployed serverless runtimes use a read-only app directory (/var/task).
 * Local `npm run dev` and `vercel dev` can still write to the project folder.
 */
export function isReadOnlyDeployEnvironment(): boolean {
  if (process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview") {
    return true;
  }

  return Boolean(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT ||
      process.env.NETLIFY
  );
}

/** @deprecated Use isReadOnlyDeployEnvironment */
export function isServerlessEnvironment(): boolean {
  return isReadOnlyDeployEnvironment();
}

/**
 * Local filesystem storage is for development only.
 * On read-only deploy hosts, always persist via GitHub Contents API.
 */
export function shouldUseLocalStorage(): boolean {
  if (isReadOnlyDeployEnvironment()) {
    return false;
  }

  if (process.env.USE_LOCAL_STORAGE === "true") {
    return true;
  }

  return !isGitHubConfigured();
}

export function getStorageMode(): "local" | "github" {
  return shouldUseLocalStorage() ? "local" : "github";
}

export function assertPersistableStorage(operation: string): void {
  if (shouldUseLocalStorage()) {
    return;
  }

  if (isGitHubConfigured()) {
    return;
  }

  const host = isReadOnlyDeployEnvironment() ? "Vercel/serverless" : "this environment";

  throw new Error(
    `${operation} cannot write to the local filesystem on ${host}. ` +
      "Set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO. " +
      "Remove USE_LOCAL_STORAGE from production env vars."
  );
}
