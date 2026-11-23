import type { Metadata } from "next";
import { Suspense } from "react";
import { SubjectsSection, SubjectsSkeleton } from "@/components/subjects/subjects-section";
import { SectionHeading } from "@/components/ui/section";

export const metadata: Metadata = { title: "Practice" };

export default function PracticeIndexPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <SectionHeading
        title="Choose a subject"
        description="Biology currently has the approved sample questions. Other subjects will fill up as questions are approved."
      />
      <Suspense fallback={<SubjectsSkeleton />}>
        <SubjectsSection />
      </Suspense>
    </div>
  );
}
