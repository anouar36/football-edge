import { cn } from "@/lib/utils";

/**
 * Numbers, odds, percentages, scores and money stay left-to-right with tabular
 * digits, also inside right-to-left Arabic pages.
 */
export function Num({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={cn("num", className)}>
      {children}
    </bdi>
  );
}
