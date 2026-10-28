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
  useEffect(() => console.error(error), [error]);
  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold">{t.error.title}</h1>
      <p className="text-sm text-muted-foreground">{t.error.body}</p>
      {process.env.NODE_ENV !== "production" && error.message && (
        <pre dir="ltr" className="max-w-full whitespace-pre-wrap break-words rounded-md bg-secondary px-3 py-2 text-xs">{error.message}</pre>
      )}
      {error.digest && <p dir="ltr" className="num text-xs text-muted-foreground">{error.digest}</p>}
      <Button size="sm" variant="outline" onClick={reset}>{t.error.retry}</Button>
    </div>
  );
}
