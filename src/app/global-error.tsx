"use client";

// Catches errors thrown in the root layout itself. Must render its own <html>/<body>.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F7F5F0", color: "#252824", margin: 0 }}>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "0 24px",
          }}
        >
          <h1 style={{ fontSize: "1.75rem", fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ color: "#5c5f58", marginTop: 8 }}>An unexpected error occurred. Please try again.</p>
          <button
            onClick={reset}
            style={{
              marginTop: 24,
              background: "#B84A3A",
              color: "white",
              border: "none",
              borderRadius: 8,
              padding: "10px 18px",
              fontSize: "0.95rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
