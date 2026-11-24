import { Suspense } from "react";
import { PerformanceSection } from "@/components/dashboard/performance-section";
import { PracticeEntry } from "@/components/dashboard/practice-entry";
import { WelcomeSection } from "@/components/dashboard/welcome-section";
import { SubjectsSection, SubjectsSkeleton } from "@/components/subjects/subjects-section";
import { SectionHeading } from "@/components/ui/section";
import { PerformanceSkeleton } from "@/components/dashboard/performance-skeleton";

export default function Home() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10">
      <WelcomeSection />

      <section id="performance" className="scroll-mt-24">
        <SectionHeading
          title="Your performance"
          description="Your analytics and progress from completed practice attempts."
        />
        <Suspense fallback={<PerformanceSkeleton />}>
          <PerformanceSection />
        </Suspense>
      </section>

      <section id="subjects" className="scroll-mt-24">
        <SectionHeading
          title="Subjects"
          description="The five MDCAT subjects. Pick one to start a practice session."
        />
        <Suspense fallback={<SubjectsSkeleton />}>
          <SubjectsSection />
        </Suspense>
      </section>

      <section>
        <SectionHeading title="Continue practicing" />
        <PracticeEntry />
      </section>
    </div>
  );
}
