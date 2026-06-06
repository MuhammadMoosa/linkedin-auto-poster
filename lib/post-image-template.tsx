import type { PostImageData } from "@/lib/image-generator";
import { sanitizeOgText } from "@/lib/image-generator";

const colors = {
  bg: "#0f1419",
  surface: "#1a2332",
  border: "#2d3a4f",
  text: "#e7ecf3",
  muted: "#8b9cb3",
  accent: "#0a66c2",
  good: "#6fcf97",
  bad: "#e57373",
};

function MetricBlock({
  stat,
  compact,
}: {
  stat: PostImageData["metrics"][0];
  compact?: boolean;
}) {
  const beforeText = stat.before ? sanitizeOgText(stat.before) : null;
  const afterText = stat.after ? sanitizeOgText(stat.after) : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 16,
        padding: compact ? "16px 18px" : "20px 22px",
        flex: 1,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: compact ? 18 : 20,
          color: colors.muted,
          marginBottom: 10,
          fontWeight: 600,
        }}
      >
        {sanitizeOgText(stat.label)}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: compact ? 28 : 32,
          fontWeight: 700,
        }}
      >
        {beforeText ? (
          <div style={{ display: "flex", color: colors.bad }}>{beforeText}</div>
        ) : null}
        {beforeText && afterText ? (
          <div style={{ display: "flex", color: colors.muted, fontSize: 24 }}>
            {"->"}
          </div>
        ) : null}
        {afterText ? (
          <div style={{ display: "flex", color: colors.good }}>{afterText}</div>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 8,
          fontSize: compact ? 16 : 18,
          color: colors.muted,
        }}
      >
        {sanitizeOgText(stat.improvementLabel)}
      </div>
    </div>
  );
}

export function PostImageTemplate({ data }: { data: PostImageData }) {
  const { day, meta, metrics, hook } = data;
  const metricCount = metrics.length;
  const compact = metricCount > 3;
  const phaseText = day.phase ? sanitizeOgText(day.phase) : "";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: colors.bg,
        color: colors.text,
        padding: "48px 56px",
        fontFamily: "Noto Sans",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              display: "flex",
              background: colors.accent,
              color: "white",
              borderRadius: 12,
              padding: "10px 16px",
              fontSize: 24,
              fontWeight: 800,
            }}
          >
            {`Day ${day.day}`}
          </div>
          {phaseText ? (
            <div
              style={{
                display: "flex",
                fontSize: 20,
                color: colors.muted,
                fontWeight: 600,
              }}
            >
              {phaseText}
            </div>
          ) : null}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 18,
            color: colors.muted,
            fontWeight: 600,
          }}
        >
          {meta.auditTool ?? "Core Web Vitals"}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          fontSize: 44,
          fontWeight: 800,
          lineHeight: 1.15,
          marginBottom: 16,
        }}
      >
        {sanitizeOgText(day.title)}
      </div>

      <div
        style={{
          display: "flex",
          fontSize: 22,
          color: colors.muted,
          marginBottom: hook ? 12 : 28,
        }}
      >
        {sanitizeOgText(day.topic)}
      </div>

      {hook ? (
        <div
          style={{
            display: "flex",
            fontSize: 20,
            color: colors.text,
            marginBottom: 28,
            lineHeight: 1.4,
          }}
        >
          {hook}
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          gap: 16,
          flex: 1,
          alignItems: "stretch",
        }}
      >
        {metrics.length > 0
          ? metrics
              .slice(0, 4)
              .map((stat) => (
                <MetricBlock key={stat.id} stat={stat} compact={compact} />
              ))
          : (
              <div
                style={{
                  display: "flex",
                  flex: 1,
                  alignItems: "center",
                  background: colors.surface,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 16,
                  padding: "24px 28px",
                  fontSize: 22,
                  color: colors.muted,
                }}
              >
                {sanitizeOgText(day.imageSuggestion)}
              </div>
            )}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 28,
          fontSize: 18,
          color: colors.muted,
        }}
      >
        <div style={{ display: "flex" }}>
          {meta.appType ?? "Web Performance"}
        </div>
        <div style={{ display: "flex", color: colors.accent, fontWeight: 700 }}>
          #CoreWebVitals #WebPerformance
        </div>
      </div>
    </div>
  );
}
