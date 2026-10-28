import { getT } from "@/lib/i18n/server";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartSkeleton, HeaderSkeleton, StatsSkeleton, TableSkeleton } from "@/components/app/skeletons";

export default function Loading() {
  const { t } = getT();
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton title={t.history.title} />
      <StatsSkeleton n={6} className="md:grid-cols-3 xl:grid-cols-6" />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <ChartSkeleton />
        </CardContent>
      </Card>
      <TableSkeleton rows={8} cols={8} title />
    </div>
  );
}
