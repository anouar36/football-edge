"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

export interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Body of every error.tsx (the files only wrap it). Production hides the server's message
 * and shows the digest to look up in the logs; development also shows the message,
 * e.g. "DATABASE_URL is still the example value".
 */
export function ErrorView({ error, reset }: ErrorProps) {
  const { t } = useT();

  const isChunkError =
    error?.message?.includes("reading 'call'") ||
    error?.name === "ChunkLoadError" ||
    error?.message?.includes("Loading chunk");

  useEffect(() => {
    console.error(error);
    if (isChunkError && typeof window !== "undefined") {
      const key = "last_chunk_reload";
      const last = sessionStorage.getItem(key);
      const now = Date.now();
      if (!last || now - Number(last) > 8000) {
        sessionStorage.setItem(key, String(now));
        window.location.reload();
      }
    }
  }, [error, isChunkError]);

  const handleRetry = () => {
    if (isChunkError && typeof window !== "undefined") {
      window.location.reload();
    } else {
      reset();
    }
  };

  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold">{t.error.title}</h1>
      <p className="text-sm text-muted-foreground">{t.error.body}</p>
      {process.env.NODE_ENV !== "production" && error.message && (
        <pre dir="ltr" className="max-w-full whitespace-pre-wrap break-words rounded-md bg-secondary px-3 py-2 text-xs">{error.message}</pre>
      )}
      {error.digest && <p dir="ltr" className="num text-xs text-muted-foreground">{error.digest}</p>}
      <Button size="sm" variant="outline" onClick={handleRetry}>{t.error.retry}</Button>
    </div>
  );
}
