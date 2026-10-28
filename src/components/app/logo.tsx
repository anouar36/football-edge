import { cn } from "@/lib/utils";

/** The "EdgeXI" wordmark. Always Latin and left-to-right, also in Arabic. */
export function Logo({ className }: { className?: string }) {
  return (
    <span lang="en" dir="ltr" className={cn("font-display font-bold tracking-tight text-lg", className)}>
      Edge<span className="text-muted-foreground font-normal">XI</span>
    </span>
  );
}
