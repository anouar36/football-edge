import { getT } from "@/lib/i18n/server";
import { CardSkeleton, HeaderSkeleton } from "@/components/app/skeletons";

/** Same three columns as the match page. */
export default function Loading() {
  const { t } = getT();
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton title={t.match.title} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <CardSkeleton lines={9} />
          <CardSkeleton lines={6} />
        </div>
        <CardSkeleton lines={14} />
        <div className="flex flex-col gap-6 lg:col-span-2 xl:col-span-1">
          <CardSkeleton lines={8} />
          <CardSkeleton lines={4} />
        </div>
      </div>
      <CardSkeleton lines={5} />
    </div>
  );
}
