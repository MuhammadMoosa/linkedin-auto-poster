type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

function formatEntry(entry: LogEntry): string {
  const contextStr = entry.context
    ? ` ${JSON.stringify(entry.context)}`
    : "";
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${contextStr}`;
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    context,
  };

  const formatted = formatEntry(entry);

  switch (level) {
    case "error":
      console.error(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    case "debug":
      console.debug(formatted);
      break;
    default:
      console.log(formatted);
  }
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) =>
    log("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) =>
    log("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) =>
    log("error", message, context),
  debug: (message: string, context?: Record<string, unknown>) =>
    log("debug", message, context),

  publishSuccess: (day: number, title: string, linkedInPostId: string, status: number) => {
    log("info", "Publish success", {
      day,
      title,
      linkedInPostId,
      responseStatus: status,
    });
  },

  publishFailure: (
    day: number | null,
    title: string | null,
    error: string,
    status?: number
  ) => {
    log("error", "Publish failure", {
      day,
      title,
      error,
      responseStatus: status ?? null,
    });
  },

  apiRequest: (method: string, path: string, status: number) => {
    log("info", "API request completed", {
      method,
      path,
      responseStatus: status,
    });
  },
};

export default logger;
