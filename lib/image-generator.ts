import type { DayPost, Meta, SummaryStat } from "@/types/post";

export const LINKEDIN_IMAGE_WIDTH = 1200;
export const LINKEDIN_IMAGE_HEIGHT = 627;

export function resolveMetricsForDay(
  day: DayPost,
  summaryStats: SummaryStat[]
): SummaryStat[] {
  if (day.metricsHighlighted?.length) {
    return day.metricsHighlighted
      .map((id) => summaryStats.find((stat) => stat.id === id))
      .filter((stat): stat is SummaryStat => Boolean(stat));
  }

  return summaryStats.slice(0, 3);
}

export function extractPostHook(linkedinPost: string): string {
  const lines = linkedinPost
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const hook = lines.find(
    (line) =>
      !line.startsWith("#") &&
      !line.startsWith("Day ") &&
      line.length > 20 &&
      line.length < 120
  );

  return hook ?? lines[0]?.slice(0, 100) ?? "";
}

export interface PostImageData {
  day: DayPost;
  meta: Meta;
  metrics: SummaryStat[];
  hook: string;
}

export function buildPostImageData(
  day: DayPost,
  meta: Meta,
  summaryStats: SummaryStat[]
): PostImageData {
  return {
    day,
    meta,
    metrics: resolveMetricsForDay(day, summaryStats),
    hook: sanitizeOgText(extractPostHook(day.linkedinPost)),
  };
}

/** Strip emoji/special chars that trigger external font fetches in next/og */
export function sanitizeOgText(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/↓/g, "-")
    .replace(/↑/g, "+")
    .replace(/✓/g, "OK")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/→/g, "->")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}
