import { PerformanceSkeleton } from "@/components/dashboard/performance-skeleton";
import { SectionHeading } from "@/components/ui/section";

/** Shown instantly on navigation, before the server finishes the page. */
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <SectionHeading title="Your performance" description="Statistics and learning insights from your completed practice attempts." />
      <PerformanceSkeleton />
    </div>
  );
}