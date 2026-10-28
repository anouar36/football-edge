import { getT } from "@/lib/i18n/server";
import { HeaderSkeleton, TableSkeleton } from "@/components/app/skeletons";

export default function Loading() {
  const { t } = getT();
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton title={t.picks.title} right={false} />
      <TableSkeleton rows={5} cols={8} title />
    </div>
  );
}
