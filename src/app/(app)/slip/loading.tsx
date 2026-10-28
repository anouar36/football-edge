import { getT } from "@/lib/i18n/server";
import { CardSkeleton, HeaderSkeleton, TableSkeleton } from "@/components/app/skeletons";

export default function Loading() {
  const { t } = getT();
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton title={t.slip.title} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <TableSkeleton rows={4} cols={4} />
        <CardSkeleton lines={9} />
      </div>
    </div>
  );
}
