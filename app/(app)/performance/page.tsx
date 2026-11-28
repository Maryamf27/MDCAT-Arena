import type { Metadata } from "next";
import { Suspense } from "react";
import { PerformanceSkeleton } from "@/components/dashboard/performance-skeleton";
import { PerformanceSection } from "@/components/dashboard/performance-section";
import { SectionHeading } from "@/components/ui/section";

export const metadata: Metadata = { title: "Performance", description: "Track your exam practice accuracy, subject performance and progress." };

export default function Page() {
  return <div className="mx-auto flex max-w-6xl flex-col gap-6">
    <SectionHeading title="Your performance" description="Statistics and learning insights from your completed practice attempts." />
    <Suspense fallback={<PerformanceSkeleton />}>
      <PerformanceSection />
    </Suspense>
  </div>;
}
