"use client";
import { dictionaries } from "@/lib/i18n";

/* Inline styles: when the root layout fails, the app's stylesheet is not loaded with this page. */
const muted = { color: "GrayText", fontSize: 14, lineHeight: 1.6, margin: "6px 0 0" };

/**
 * The root layout itself failed, so this replaces it, with its own <html> and <body>.
 * There is no locale cookie context here: the message is shown in both languages.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { ar, en } = dictionaries;

  const isChunkError =
    error?.message?.includes("reading 'call'") ||
    error?.name === "ChunkLoadError" ||
    error?.message?.includes("Loading chunk");

  const handleReset = () => {
    if (isChunkError && typeof window !== "undefined") {
      window.location.reload();
    } else {
      reset();
    }
  };

  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, background: "Canvas", color: "CanvasText", fontFamily: "system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif" }}>
        <main role="alert" style={{ maxWidth: 440, minHeight: "100vh", margin: "0 auto", padding: "0 16px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, margin: 0 }}>{ar.error.title}</h1>
            <p style={muted}>{ar.error.body}</p>
          </div>
          <div dir="ltr" lang="en">
            <h2 style={{ fontSize: 20, margin: 0 }}>{en.error.title}</h2>
            <p style={muted}>{en.error.body}</p>
          </div>
          {error.digest && <p dir="ltr" style={{ ...muted, fontSize: 12 }}>{error.digest}</p>}
          <button
            type="button"
            onClick={handleReset}
            style={{ alignSelf: "flex-start", padding: "6px 14px", borderRadius: 8, border: "1px solid ButtonBorder", background: "ButtonFace", color: "ButtonText", fontSize: 14, cursor: "pointer" }}
          >
            {ar.error.retry} / {en.error.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
