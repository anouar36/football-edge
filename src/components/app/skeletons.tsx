import { getT } from "@/lib/i18n/server";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * Building blocks for the loading.tsx files: the same layout as each page (header, stat row, cards,
 * table rows), so the click shows the page's shape at once and nothing jumps when the data arrives.
 * Logical classes only, so they mirror in Arabic.
 */

/** The page title is real text (it never waits for data); the subtitle and the actions are placeholders. */
export function HeaderSkeleton({ title, sub = true, right = true }: { title: string; sub?: boolean; right?: boolean }) {
  const { t } = getT();
  return (
    <div className="flex flex-wrap items-end justify-between gap-3" aria-busy="true">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <Skeleton className="mt-2 h-4 w-64 max-w-[70vw]" />}
        <span className="sr-only">{t.common.loading}</span>
      </div>
      {right && <Skeleton className="h-8 w-40 rounded-lg" />}
    </div>
  );
}

export function StatsSkeleton({ n = 4, className }: { n?: number; className?: string }) {
  return (
    <Card>
      <CardContent className={cn("grid grid-cols-2 gap-6 p-5 md:grid-cols-4", className)}>
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** A table card: a row of short header bars, then rows with a team-badge pair and a few cells. */
export function TableSkeleton({ rows = 6, cols = 5, title = false }: { rows?: number; cols?: number; title?: boolean }) {
  return (
    <Card>
      {title && (
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
      )}
      <CardContent className={cn("flex flex-col gap-4 p-4 sm:p-5", title && "pt-0")}>
        <div className="flex gap-4">
          {Array.from({ length: cols }, (_, i) => (
            <Skeleton key={i} className={cn("h-3", i === 0 ? "w-32" : "w-14", i > 2 && "hidden sm:block")} />
          ))}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex items-center gap-4">
            <div className="flex shrink-0 gap-1">
              <Skeleton className="h-[22px] w-[22px] rounded-[22%]" />
              <Skeleton className="h-[22px] w-[22px] rounded-[22%]" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="h-3 w-28" />
            </div>
            {Array.from({ length: Math.max(0, cols - 2) }, (_, i) => (
              <Skeleton key={i} className={cn("h-4 w-12", i > 1 && "hidden sm:block")} />
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** A card with a title bar and a few lines of text. */
export function CardSkeleton({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-5 w-36" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className={cn("h-4", i % 3 === 2 ? "w-2/3" : "w-full")} />
        ))}
      </CardContent>
    </Card>
  );
}

/** Same height as the profit chart, so the page does not move when it loads. */
export function ChartSkeleton() {
  return <Skeleton className="h-64 w-full rounded-lg" />;
}
