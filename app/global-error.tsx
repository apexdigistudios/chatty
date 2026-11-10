'use client';

import posthog from "posthog-js";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    posthog.captureException(error);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#111114", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ display: "grid", minHeight: "100vh", placeContent: "center", padding: 24, textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: 28 }}>Gist me couldn&apos;t start.</h1>
          <p style={{ color: "#c4c4cc" }}>Please retry. If the problem continues, try again later.</p>
          <button
            type="button"
            onClick={() => reset()}
            style={{ justifySelf: "center", minHeight: 44, padding: "0 20px", border: 0, borderRadius: 12, background: "#8b5cf6", color: "#fff", fontWeight: 800, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
