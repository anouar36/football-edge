import { getT } from "@/lib/i18n/server";
import { CardSkeleton, HeaderSkeleton, StatsSkeleton, TableSkeleton } from "@/components/app/skeletons";

/** Dashboard: shown at once on navigation (and prefetched with the link), until the page streams in. */
export default function Loading() {
  const { t } = getT();
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton title={t.dashboard.title} />
      <StatsSkeleton n={4} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <TableSkeleton rows={6} cols={6} title />
        <div className="flex flex-col gap-6">
          <CardSkeleton lines={5} />
          <CardSkeleton lines={4} />
        </div>
      </div>
    </div>
  );
}
