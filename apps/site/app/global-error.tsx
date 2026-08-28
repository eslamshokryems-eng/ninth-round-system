"use client";

/**
 * App Router global error boundary. Same rationale as `not-found.tsx` and
 * `apps/web/app/global-error.tsx`: this monorepo runs two React major
 * versions side by side, so Next's own built-in default error page is not
 * reliable here — we ship our own.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0B0B0C",
          color: "#F4F3F1",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <div>
          <p style={{ fontSize: "1.5rem", fontWeight: 600 }}>Something went wrong</p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "0.75rem",
              padding: "0.5rem 1.25rem",
              borderRadius: "999px",
              border: "none",
              background: "#E4141B",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
