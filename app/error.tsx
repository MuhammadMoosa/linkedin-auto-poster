"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          maxWidth: 560,
          margin: "4rem auto",
          padding: "0 1.5rem",
          lineHeight: 1.5,
        }}
      >
        <h1>Something went wrong</h1>
        <p>The dashboard failed to load. APIs may still work.</p>
        {error.digest && (
          <p style={{ color: "#666", fontSize: "0.875rem" }}>
            Digest: {error.digest}
          </p>
        )}
        <p style={{ marginTop: "1.5rem" }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "0.5rem 1rem",
              cursor: "pointer",
              marginRight: "0.5rem",
            }}
          >
            Try again
          </button>
          <a href="/api/status">Check /api/status</a>
        </p>
      </body>
    </html>
  );
}
