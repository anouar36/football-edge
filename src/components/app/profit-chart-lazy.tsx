"use client";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/** recharts is about 100 kB: loaded after the page, behind a placeholder of the chart's height. */
export const ProfitChart = dynamic(() => import("./profit-chart").then((m) => m.ProfitChart), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full rounded-lg" />,
});
