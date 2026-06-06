export interface AppConfigStatus {
  linkedInConfigured: boolean;
  githubConfigured: boolean;
  useLocalStorage: boolean;
  missingEnv: string[];
}

export function getAppConfigStatus(): AppConfigStatus {
  const missingEnv: string[] = [];

  if (!process.env.LINKEDIN_TOKEN) missingEnv.push("LINKEDIN_TOKEN");
  if (!process.env.LINKEDIN_PERSON_ID) missingEnv.push("LINKEDIN_PERSON_ID");

  const githubConfigured = Boolean(
    process.env.GITHUB_TOKEN &&
      process.env.GITHUB_OWNER &&
      process.env.GITHUB_REPO
  );

  if (!githubConfigured && process.env.USE_LOCAL_STORAGE !== "true") {
    if (!process.env.GITHUB_TOKEN) missingEnv.push("GITHUB_TOKEN");
    if (!process.env.GITHUB_OWNER) missingEnv.push("GITHUB_OWNER");
    if (!process.env.GITHUB_REPO) missingEnv.push("GITHUB_REPO");
  }

  const useLocalStorage =
    process.env.USE_LOCAL_STORAGE === "true" || !githubConfigured;

  return {
    linkedInConfigured: Boolean(
      process.env.LINKEDIN_TOKEN && process.env.LINKEDIN_PERSON_ID
    ),
    githubConfigured,
    useLocalStorage,
    missingEnv,
  };
}

export function formatErrorDetails(details: unknown): string | null {
  if (details === null || details === undefined) return null;

  if (typeof details === "string") {
    return details.length > 200 ? `${details.slice(0, 200)}…` : details;
  }

  if (typeof details === "object") {
    const record = details as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.error === "string") return record.error;
    if (typeof record.error_description === "string") {
      return record.error_description;
    }

    try {
      const json = JSON.stringify(details);
      return json.length > 300 ? `${json.slice(0, 300)}…` : json;
    } catch {
      return null;
    }
  }

  return String(details);
}
