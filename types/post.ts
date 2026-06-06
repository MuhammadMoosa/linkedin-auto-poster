export interface Meta {
  title: string;
  description: string;
  generatedAt?: string;
  version?: string;
  appType?: string;
  environment?: string;
  auditTool?: string;
  auditConditions?: string;
  totalDays: number;
  campaignStartDate?: string;
  postingTips?: string[];
}

export interface SummaryStat {
  id: string;
  label: string;
  before?: string | null;
  after?: string;
  beforeNumeric?: number | null;
  afterNumeric?: number;
  unit: string;
  improvementPercent?: number;
  improvementLabel: string;
}

export interface PageMetricSnapshot {
  metric: string;
  value: string;
  status: "bad" | "good" | string;
}

export interface PageTested {
  pageType: string;
  description: string;
  before: PageMetricSnapshot;
  after: PageMetricSnapshot;
}

export interface TimelineEntry {
  phase: string;
  title: string;
  description: string;
  day?: number;
  scheduledDate?: string;
  status?: "pending" | "posted" | "skipped";
}

export interface LcpMetric {
  metric: string;
  before: string;
  after: string;
  impact: string;
}

export interface LcpSubparts {
  timeToFirstByte: string;
  resourceLoadDelay: { before: number; after: number; unit: string };
  resourceLoadDuration: { before: number; after: number; unit: string };
  elementRenderDelay: { before: number; after: number; unit: string };
}

export interface ClsBreakdownItem {
  source?: string;
  metric?: string;
  before?: string;
  after?: string;
  beforeCls?: number;
  afterCls?: number;
  fix?: string;
  notes?: string;
}

export interface CoreWebVitalsThreshold {
  metric: string;
  good: string;
  needsImprovement: string;
  poor: string;
  bestAchieved: string;
}

export interface OptimizationItem {
  title: string;
  description: string;
  snippet: string;
}

export interface AdOptimization {
  optimization: string;
  before: string;
  after: string;
}

export interface Optimizations {
  lcp: OptimizationItem[];
  cls: OptimizationItem[];
  ads: AdOptimization[];
}

export interface DayPost {
  day: number;
  title: string;
  topic: string;
  linkedinPost: string;
  hashtags: string[];
  metricsHighlighted?: string[];
  imageSuggestion: string;
  category?: string[];
  phase?: string;
  optimizationsApplied?: string[];
  imagePath?: string | null;
  posted: boolean;
  postedAt: string | null;
  linkedInPostId?: string | null;
}

export interface FullContentSchema {
  meta: Meta;
  summaryStats: SummaryStat[];
  pagesTested: PageTested[];
  lcpMetrics?: LcpMetric[];
  lcpSubparts?: LcpSubparts;
  clsArticleDetail?: ClsBreakdownItem[];
  clsVideoDetail?: ClsBreakdownItem[];
  coreWebVitalsThresholds?: CoreWebVitalsThreshold[];
  optimizations?: Optimizations;
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
  manual?: boolean;
  hasImage?: boolean;
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
  phase?: string;
  category?: string[];
  posted: boolean;
  postedAt: string | null;
  hasImage: boolean;
  imagePreviewUrl: string | null;
}

export interface StatusResponse {
  totalPosts: number;
  postedCount: number;
  remainingCount: number;
  completionPercentage: number;
  nextScheduledPost: DayPost | null;
  campaignComplete: boolean;
  meta: Meta;
  summaryStats: SummaryStat[];
}

export interface ContentFileMetadata {
  sha: string;
  path: string;
}
