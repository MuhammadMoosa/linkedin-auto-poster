import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 640,
        margin: "4rem auto",
        padding: "0 1.5rem",
      }}
    >
      <h1>LinkedIn Auto Poster</h1>
      <p style={{ color: "#555", lineHeight: 1.6 }}>
        Automated daily LinkedIn publishing powered by Next.js, GitHub Actions,
        and JSON-based content storage.
      </p>
      <ul style={{ lineHeight: 2 }}>
        <li>
          <Link href="/api/status">GET /api/status</Link> — campaign progress
        </li>
        <li>
          <Link href="/api/preview">GET /api/preview</Link> — next post preview
        </li>
        <li>
          <Link href="/api/publish">GET /api/publish</Link> — publish next post
        </li>
      </ul>
    </main>
  );
}
