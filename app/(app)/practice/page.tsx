import type { Metadata } from "next";
import { Suspense } from "react";
import { SubjectsSection, SubjectsSkeleton } from "@/components/subjects/subjects-section";
import { SectionHeading } from "@/components/ui/section";

export const metadata: Metadata = { title: "Practice" };

export default function PracticeIndexPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <SectionHeading
        title="Choose an exam and subject"
        description="Subjects are grouped by examination track. Availability counts reflect active questions in that track only."
      />
      <Suspense fallback={<SubjectsSkeleton />}>
        <SubjectsSection />
      </Suspense>
    </div>
  );
}
