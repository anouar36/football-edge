import { getT } from "@/lib/i18n/server";
import { CardSkeleton, HeaderSkeleton } from "@/components/app/skeletons";

export default function Loading() {
  const { t } = getT();
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <HeaderSkeleton title={t.settings.title} sub={false} />
      <CardSkeleton lines={4} />
      <CardSkeleton lines={2} />
      <CardSkeleton lines={6} />
      <CardSkeleton lines={6} />
    </div>
  );
}
