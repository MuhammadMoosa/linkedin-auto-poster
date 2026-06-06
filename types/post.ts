export interface Meta {
  title: string;
  description: string;
  generatedAt: string;
  version: string;
  totalDays: number;
  campaignStartDate?: string;
}

export interface SummaryStats {
  totalPosts: number;
  avgEngagementRate: number;
  topHashtags: string[];
  optimizationScore: number;
  totalReachEstimate?: number;
  bestPerformingTopic?: string;
}

export interface PageTested {
  name: string;
  url: string;
  score: number;
  notes?: string;
}

export interface TimelineEntry {
  day: number;
  scheduledDate?: string;
  status: "pending" | "posted" | "skipped";
  title?: string;
}

export interface DayPost {
  day: number;
  title: string;
  topic: string;
  linkedinPost: string;
  hashtags: string[];
  metricsHighlighted: string[];
  imageSuggestion: string;
  posted: boolean;
  postedAt: string | null;
  linkedInPostId?: string | null;
}

export interface FullContentSchema {
  meta: Meta;
  summaryStats: SummaryStats;
  pagesTested: PageTested[];
  timeline: TimelineEntry[];
  days: DayPost[];
}

export interface PublishResult {
  success: boolean;
  day: number;
  title: string;
  linkedInPostId?: string;
  postedAt: string;
  message: string;
}

export interface PreviewResponse {
  day: number;
  title: string;
  topic: string;
  formattedPreview: string;
  hashtags: string[];
  metricsHighlighted: string[];
  imageSuggestion: string;
  characterCount: number;
}

export interface StatusResponse {
  totalPosts: number;
  postedCount: number;
  remainingCount: number;
  completionPercentage: number;
  nextScheduledPost: DayPost | null;
  campaignComplete: boolean;
}

export interface ContentFileMetadata {
  sha: string;
  path: string;
}
