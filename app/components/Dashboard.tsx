"use client";

import { useCallback, useState } from "react";
import type { PreviewResponse, StatusResponse, SummaryStat } from "@/types/post";
import type { AppConfigStatus } from "@/lib/config";

interface DashboardProps {
  initialStatus: StatusResponse;
  initialDays: PreviewResponse[];
  postingTips?: string[];
  config: AppConfigStatus;
}

interface Toast {
  message: string;
  type: "success" | "error";
}

function formatApiError(data: {
  error?: string;
  details?: unknown;
}): string {
  const base = data.error ?? "Request failed";
  if (!data.details) return base;

  if (typeof data.details === "string") {
    return `${base}: ${data.details}`;
  }

  if (typeof data.details === "object" && data.details !== null) {
    const record = data.details as Record<string, unknown>;
    if (typeof record.message === "string") {
      return `${base}: ${record.message}`;
    }
    try {
      return `${base}: ${JSON.stringify(data.details)}`;
    } catch {
      return base;
    }
  }

  return base;
}

function StatCard({ stat }: { stat: SummaryStat }) {
  return (
    <div className="stat-card">
      <div className="label">{stat.label}</div>
      <div className="values">
        {stat.before && <span className="before">{stat.before}</span>}
        {stat.after && <span className="after">{stat.after}</span>}
      </div>
      <div className="improvement">{stat.improvementLabel}</div>
    </div>
  );
}

function DayCard({
  day,
  onUpdate,
}: {
  day: PreviewResponse;
  onUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState(!day.posted);
  const [loading, setLoading] = useState<string | null>(null);
  const [hasImage, setHasImage] = useState(day.hasImage);
  const [imageVersion, setImageVersion] = useState(0);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(day.formattedPreview);
      return true;
    } catch {
      return false;
    }
  };

  const handleImageSelect = (file: File | null) => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(file);
    setPendingPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleGenerateImage = async () => {
    setLoading("generate");
    try {
      const res = await fetch(`/api/generate-image/${day.day}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(formatApiError(data));

      setHasImage(true);
      setImageVersion((v) => v + 1);
      handleImageSelect(null);
      onUpdate();
      return { message: data.message, type: "success" as const };
    } catch (err) {
      return {
        message: err instanceof Error ? err.message : "Image generation failed",
        type: "error" as const,
      };
    } finally {
      setLoading(null);
    }
  };

  const handleUploadImage = async () => {
    if (!pendingFile) {
      return {
        message: "Choose an image first",
        type: "error" as const,
      };
    }

    setLoading("upload");
    try {
      const formData = new FormData();
      formData.append("day", String(day.day));
      formData.append("image", pendingFile);

      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(formatApiError(data));

      setHasImage(true);
      setImageVersion((v) => v + 1);
      handleImageSelect(null);
      onUpdate();
      return { message: data.message, type: "success" as const };
    } catch (err) {
      return {
        message: err instanceof Error ? err.message : "Upload failed",
        type: "error" as const,
      };
    } finally {
      setLoading(null);
    }
  };

  const handlePublish = async () => {
    const withImage = hasImage || pendingFile;
    const msg = withImage
      ? `Publish Day ${day.day} to LinkedIn WITH image?\n\n"${day.title}"`
      : `Publish Day ${day.day} to LinkedIn (text only)?\n\nTip: attach a screenshot first for better reach.\n\n"${day.title}"`;

    if (!confirm(msg)) return null;

    setLoading("publish");
    try {
      let res: Response;

      if (pendingFile) {
        const formData = new FormData();
        formData.append("day", String(day.day));
        formData.append("image", pendingFile);
        res = await fetch("/api/publish", { method: "POST", body: formData });
      } else {
        res = await fetch("/api/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ day: day.day }),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(formatApiError(data));
      handleImageSelect(null);
      onUpdate();
      return { message: data.message, type: "success" as const };
    } catch (err) {
      return {
        message: err instanceof Error ? err.message : "Publish failed",
        type: "error" as const,
      };
    } finally {
      setLoading(null);
    }
  };

  const handleMarkPosted = async () => {
    if (
      !confirm(
        `Mark Day ${day.day} as posted?\n\nUse this if you copied and posted manually on LinkedIn.`
      )
    ) {
      return null;
    }

    setLoading("mark");
    try {
      const res = await fetch("/api/mark-posted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: day.day }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(formatApiError(data));
      onUpdate();
      return { message: data.message, type: "success" as const };
    } catch (err) {
      return {
        message: err instanceof Error ? err.message : "Failed to mark as posted",
        type: "error" as const,
      };
    } finally {
      setLoading(null);
    }
  };

  const runAction = async (
    action: () => Promise<{ message: string; type: "success" | "error" } | null>,
    onToast: (toast: Toast) => void
  ) => {
    const result = await action();
    if (result) onToast(result);
  };

  return (
    <DayCardInner
      day={day}
      expanded={expanded}
      loading={loading}
      hasImage={hasImage}
      imageVersion={imageVersion}
      pendingPreview={pendingPreview}
      onToggle={() => setExpanded((v) => !v)}
      onCopy={handleCopy}
      onImageSelect={handleImageSelect}
      onGenerateImage={(onToast) => runAction(handleGenerateImage, onToast)}
      onUploadImage={(onToast) => runAction(handleUploadImage, onToast)}
      onPublish={(onToast) => runAction(handlePublish, onToast)}
      onMarkPosted={(onToast) => runAction(handleMarkPosted, onToast)}
    />
  );
}

function DayCardInner({
  day,
  expanded,
  loading,
  hasImage,
  imageVersion,
  pendingPreview,
  onToggle,
  onCopy,
  onImageSelect,
  onGenerateImage,
  onUploadImage,
  onPublish,
  onMarkPosted,
}: {
  day: PreviewResponse;
  expanded: boolean;
  loading: string | null;
  hasImage: boolean;
  imageVersion: number;
  pendingPreview: string | null;
  onToggle: () => void;
  onCopy: () => Promise<boolean>;
  onImageSelect: (file: File | null) => void;
  onGenerateImage: (onToast: (t: Toast) => void) => void;
  onUploadImage: (onToast: (t: Toast) => void) => void;
  onPublish: (onToast: (t: Toast) => void) => void;
  onMarkPosted: (onToast: (t: Toast) => void) => void;
}) {
  const [localToast, setLocalToast] = useState<Toast | null>(null);

  const showToast = (toast: Toast) => {
    setLocalToast(toast);
    setTimeout(() => setLocalToast(null), 3500);
  };

  return (
    <article className={`day-card${day.posted ? " posted" : ""}`}>
      <div className="day-card-header" onClick={onToggle}>
        <div className={`day-number${day.posted ? " posted" : ""}`}>
          {day.day}
        </div>
        <div className="day-info">
          <h3>{day.title}</h3>
          <p className="topic">{day.topic}</p>
          <div className="day-badges">
            {day.phase && <span className="badge">{day.phase}</span>}
            {day.category?.map((cat) => (
              <span key={cat} className="badge">
                {cat}
              </span>
            ))}
            <span className={`badge ${day.posted ? "posted" : "pending"}`}>
              {day.posted
                ? `Posted${day.postedAt ? ` · ${new Date(day.postedAt).toLocaleDateString()}` : ""}`
                : "Pending"}
            </span>
            {hasImage && !day.posted && (
              <span className="badge image-ready">🖼 Image attached</span>
            )}
          </div>
        </div>
        <span className={`chevron${expanded ? " open" : ""}`}>▼</span>
      </div>

      {expanded && (
        <div className="day-card-body">
          <div className="image-suggestion">
            <strong>📷 Image suggestion:</strong> {day.imageSuggestion}
          </div>

          <div className="image-upload-section">
            <div className="image-action-row">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={loading !== null}
                onClick={() => onGenerateImage(showToast)}
              >
                {loading === "generate"
                  ? "Generating…"
                  : "✨ Generate from post text"}
              </button>
              <label className="image-upload-label">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="image-input-hidden"
                  onChange={(e) =>
                    onImageSelect(e.target.files?.[0] ?? null)
                  }
                />
                📎 Upload custom image
              </label>
            </div>

            {(pendingPreview || hasImage) && (
              <div className="image-preview-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    pendingPreview ??
                    `/api/images/${day.day}?v=${imageVersion}`
                  }
                  alt={`Day ${day.day} post image`}
                  className="image-preview"
                />
              </div>
            )}

            {pendingPreview && (
              <div className="actions image-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={loading !== null}
                  onClick={() => onUploadImage(showToast)}
                >
                  {loading === "upload" ? "Saving…" : "💾 Save image"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onImageSelect(null)}
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          <div className="post-preview">{day.formattedPreview}</div>

          <div className="post-meta">
            <span>{day.characterCount} characters</span>
            {day.metricsHighlighted.length > 0 && (
              <span>Metrics: {day.metricsHighlighted.join(", ")}</span>
            )}
          </div>

          <div className="actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={async () => {
                const ok = await onCopy();
                showToast({
                  message: ok ? "Copied to clipboard!" : "Copy failed",
                  type: ok ? "success" : "error",
                });
              }}
            >
              📋 Copy post
            </button>

            {!day.posted && (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={loading !== null}
                  onClick={() => onPublish(showToast)}
                >
                  {loading === "publish"
                    ? "Publishing…"
                    : hasImage || pendingPreview
                      ? "🚀 Publish with image"
                      : "🚀 Publish to LinkedIn"}
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  disabled={loading !== null}
                  onClick={() => onMarkPosted(showToast)}
                >
                  {loading === "mark" ? "Saving…" : "✓ Mark as posted"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {localToast && (
        <div className={`toast${localToast.type === "error" ? " error" : ""}`}>
          {localToast.message}
        </div>
      )}
    </article>
  );
}

export default function Dashboard({
  initialStatus,
  initialDays,
  postingTips,
  config,
}: DashboardProps) {
  const [status, setStatus] = useState(initialStatus);
  const [days, setDays] = useState(initialDays);
  const [toast, setToast] = useState<Toast | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/days");
      const data = await res.json();
      if (data.success) {
        setStatus(data.status);
        setDays(data.days);
      }
    } catch {
      setToast({ message: "Failed to refresh", type: "error" });
    }
  }, []);

  const publishNext = async () => {
    if (!confirm("Publish the next unpublished post to LinkedIn?")) return;

    try {
      const res = await fetch("/api/publish", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(formatApiError(data));
      setToast({ message: data.message, type: "success" });
      await refresh();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Publish failed",
        type: "error",
      });
    }
  };

  const { meta } = status;

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>{meta.title}</h1>
        <p className="subtitle">{meta.description}</p>

        <div className="meta-tags">
          {meta.appType && <span className="meta-tag">{meta.appType}</span>}
          {meta.auditTool && <span className="meta-tag">{meta.auditTool}</span>}
          {meta.auditConditions && (
            <span className="meta-tag">{meta.auditConditions}</span>
          )}
          {meta.environment && (
            <span className="meta-tag">{meta.environment}</span>
          )}
        </div>
      </header>

      {!config.linkedInConfigured && (
        <div className="config-alert">
          <strong>LinkedIn not configured</strong>
          <p>
            Create <code>.env.local</code> in the project root with your
            credentials, then restart the server:
          </p>
          <pre>{`LINKEDIN_TOKEN=your_token
LINKEDIN_PERSON_ID=your_person_id
USE_LOCAL_STORAGE=true`}</pre>
          <p className="config-hint">
            Copy from <code>.env.example</code> · Publishing will fail until
            these are set.
          </p>
        </div>
      )}

      <section className="progress-section">
        <div className="progress-stats">
          <span>
            <strong>{status.postedCount}</strong> / {status.totalPosts} posted
          </span>
          <span>
            <strong>{status.remainingCount}</strong> remaining
          </span>
          <span>
            <strong>{status.completionPercentage}%</strong> complete
          </span>
        </div>
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill"
            style={{ width: `${status.completionPercentage}%` }}
          />
        </div>
        {!status.campaignComplete && status.nextScheduledPost && (
          <div className="progress-stats">
            <span>
              Next up: <strong>Day {status.nextScheduledPost.day}</strong> —{" "}
              {status.nextScheduledPost.title}
            </span>
            <button type="button" className="btn btn-primary" onClick={publishNext}>
              Publish next →
            </button>
          </div>
        )}
      </section>

      <div className="stats-grid">
        {status.summaryStats.map((stat) => (
          <StatCard key={stat.id} stat={stat} />
        ))}
      </div>

      {postingTips && postingTips.length > 0 && (
        <div className="tips-box">
          <strong>Posting tips</strong>
          <ul>
            {postingTips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="section-title">10-Day Content Plan</h2>

      {days.map((day) => (
        <DayCard key={day.day} day={day} onUpdate={refresh} />
      ))}

      {toast && (
        <div className={`toast${toast.type === "error" ? " error" : ""}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
